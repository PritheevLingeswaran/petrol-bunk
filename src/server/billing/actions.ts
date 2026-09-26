"use server";

import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { Decimal, round2 } from "@/lib/money";
import { amountInIndianWords, computeBillLine, computeBillTotals, evaluateCredit, type ComputedBillLine, type TaxTreatment } from "@/lib/billing";
import { INDIA_TIMEZONE, businessDateFromInput } from "@/lib/date";
import { withAudit } from "@/server/audit";
import { db } from "@/server/db";
import { requirePermission, requireUnlockedDate } from "@/server/guard";
import { getRateAt, recordStockMovement } from "@/server/pump/services";
import { issueNumber } from "@/server/numbering";
import { postVoucher } from "@/server/accounts/posting";
import { postSettlementVoucher } from "@/server/accounts/operations-posting";
import { loadSettings, settingDefinition } from "@/server/settings";
import { auditJson, buildEInvoice, customerOutstanding, ensureCustomerLedger, sendBillNotifications, type BillingTx } from "@/server/billing/services";
import { billSchema, billingSettingsSchema, cancellationApprovalSchema, cancellationSchema, consolidatedBillingSchema, eInvoiceUpdateSchema, markPrintedSchema, resolveShortCreditSchema, shortCreditSchema } from "@/server/billing/schemas";

export type BillingActionResult<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
const fail = (error: unknown): BillingActionResult<never> => ({ ok: false, error: error instanceof Error ? error.message : "Nothing was saved" });
const localTimestamp = (date: string, time: string) => fromZonedTime(`${date}T${time}:00`, INDIA_TIMEZONE);

async function accountBySystemOrCode(tx: BillingTx, outletId: string, systemKey: string, code: string) {
  const account = await tx.account.findFirst({ where: { outletId, OR: [{ systemKey }, { code }] } });
  if (!account) throw new Error(`Ledger ${code} is not configured for this outlet`);
  return account;
}

type PreparedLine = ComputedBillLine & { product: { id: string; code: string; name: string; hsnCode: string | null; type: "LITRE" | "KILOGRAM" | "PIECE" | "MILLILITRE" | "KG_CNG"; isFuel: boolean; weightedAvgCost: { toString(): string } }; cessPct: Decimal };

async function prepareLines(tx: BillingTx, outletId: string, billedAt: Date, invoiceKind: "GST_INVOICE" | "BILL_OF_SUPPLY", customerStateCode: string | undefined, inputs: { productId: string; quantity: string; discountPerUnit: string }[]): Promise<PreparedLine[]> {
  const outlet = await tx.outlet.findUniqueOrThrow({ where: { id: outletId }, include: { firm: true } });
  const sellerState = outlet.firm?.stateCode;
  const treatment: TaxTreatment = invoiceKind === "BILL_OF_SUPPLY" ? "EXEMPT" : customerStateCode && sellerState && customerStateCode !== sellerState ? "INTER_STATE" : "INTRA_STATE";
  const lines: PreparedLine[] = [];
  for (const input of inputs) {
    const product = await tx.product.findFirstOrThrow({ where: { id: input.productId, outletId, isActive: true } });
    const price = await getRateAt(product.id, billedAt, tx);
    if (!price) throw new Error(`${product.name} has no price effective at the bill time`);
    const line = computeBillLine({ productId: product.id, quantity: input.quantity, rate: price.rate.toString(), discountPerUnit: input.discountPerUnit, gstPct: product.isFuel ? "0" : product.gstPct?.toString() ?? "0", cessPct: product.cessPct?.toString() ?? "0", taxTreatment: product.isFuel ? "EXEMPT" : treatment });
    lines.push({ ...line, product: { id: product.id, code: product.code, name: product.name, hsnCode: product.hsnCode, type: product.type, isFuel: product.isFuel, weightedAvgCost: product.weightedAvgCost }, cessPct: new Decimal(product.cessPct?.toString() ?? "0") });
  }
  return lines;
}

async function revenueVoucherLines(tx: BillingTx, outletId: string, lines: PreparedLine[]) {
  const fuel = await accountBySystemOrCode(tx, outletId, "SALES_MS", "SALES_MS");
  const lube = await accountBySystemOrCode(tx, outletId, "SALES_LUBE", "LUBE_SALES");
  // Grouped by PRODUCT, not by account: two products sharing the sales ledger
  // must stay separate lines or per-product margin is attributed to whichever
  // one happened to be first. Each line carries its quantity so gross profit
  // per litre is derivable from the ledger alone.
  const grouped = new Map<string, { accountId: string; amount: Decimal; quantity: Decimal; productId: string }>();
  for (const line of lines) {
    const account = line.product.isFuel ? fuel : lube;
    const current = grouped.get(line.product.id) ?? { accountId: account.id, amount: new Decimal(0), quantity: new Decimal(0), productId: line.product.id };
    current.amount = current.amount.plus(line.taxableValue);
    current.quantity = current.quantity.plus(line.quantity);
    grouped.set(line.product.id, current);
  }
  return [...grouped.values()].map((entry) => ({ accountId: entry.accountId, credit: round2(entry.amount), productId: entry.productId, quantity: round2(entry.quantity), narration: "Sales" }));
}

export async function saveBill(payload: unknown): Promise<BillingActionResult<{ id: string; docNumber: string; warnings: string[]; duplicate: boolean }>> {
  const parsed = billSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;
  try {
    await requirePermission("BILLING", "add");
    const businessDate = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(businessDate);
    if (input.clientRequestId) {
      const duplicate = await db.bill.findUnique({ where: { outletId_clientRequestId: { outletId, clientRequestId: input.clientRequestId } } });
      if (duplicate) return { ok: true, id: duplicate.id, docNumber: duplicate.docNumber, warnings: [], duplicate: true };
    }
    const billedAt = localTimestamp(input.businessDate, input.billedTime);
    const originalBill = input.billType === "CREDIT_NOTE"
      ? await db.bill.findFirstOrThrow({ where: { id: input.originalBillId, outletId, status: "POSTED" }, include: { settlements: true } })
      : null;
    const customerId = input.customerId ?? originalBill?.customerId ?? undefined;
    const customer = customerId ? await db.customer.findFirstOrThrow({ where: { id: customerId, outletId, isActive: true }, include: { vehicles: true } }) : null;
    if (input.vehicleId && !customer?.vehicles.some((vehicle) => vehicle.id === input.vehicleId)) return { ok: false, error: "The selected vehicle does not belong to this customer" };
    if (input.salesmanEmployeeId && !await db.employee.findFirst({ where: { id: input.salesmanEmployeeId, outletId, status: "ACTIVE" } })) return { ok: false, error: "The salesman is not active in this outlet" };
    const selectedShiftEntry = input.shiftEntryId ? await db.shiftEntry.findFirst({ where: { id: input.shiftEntryId, outletId, status: { not: "CANCELLED" } } }) : null;
    if (input.shiftEntryId && !selectedShiftEntry) return { ok: false, error: "The selected shift does not belong to this outlet" };
    if (selectedShiftEntry && selectedShiftEntry.businessDate.toISOString().slice(0, 10) !== input.businessDate) return { ok: false, error: "The selected shift does not belong to the bill date" };
    const selectedNozzle = input.nozzleId ? await db.nozzle.findFirst({ where: { id: input.nozzleId, outletId, status: "ACTIVE" } }) : null;
    if (input.nozzleId && !selectedNozzle) return { ok: false, error: "The nozzle is not active in this outlet" };
    const settings = await loadSettings(outletId);
    const previewLines = await db.$transaction((tx) => prepareLines(tx, outletId, billedAt, input.invoiceKind, customer?.gstin?.slice(0, 2), input.lines));
    const previewTotals = computeBillTotals(previewLines, input.autoRoundOff && settings.boolean("billing.autoRoundOff"));
    const hasFuel = previewLines.some((line) => line.product.isFuel);
    const hasNonFuel = previewLines.some((line) => !line.product.isFuel);
    if (input.billType === "COUNTER" && hasFuel) return { ok: false, error: "Fuel must be billed from cash, credit or mobile billing" };
    if (input.billType !== "COUNTER" && input.billType !== "CREDIT_NOTE" && hasNonFuel) return { ok: false, error: "Lubes, spares and merchandise must use counter billing" };
    if (input.billType !== "CREDIT_NOTE" && hasFuel && (!input.shiftEntryId || !input.salesmanEmployeeId || !input.nozzleId)) return { ok: false, error: "Fuel billing requires the shift, salesman and nozzle" };
    if (selectedNozzle && previewLines.some((line) => line.product.isFuel && line.product.id !== selectedNozzle.productId)) return { ok: false, error: "The selected nozzle does not dispense one of the fuel products on this bill" };
    if (hasFuel && input.billType !== "CREDIT_NOTE") {
      const assignedReading = await db.nozzleReading.findFirst({ where: { shiftEntryId: input.shiftEntryId!, nozzleId: input.nozzleId!, salesmanEmployeeId: input.salesmanEmployeeId!, productId: selectedNozzle!.productId }, select: { id: true, saleLitres: true } });
      if (!assignedReading) return { ok: false, error: "This nozzle is not assigned to the selected salesman in that shift" };
      const [priorBills, priorShorts] = await Promise.all([
        db.billLine.aggregate({ where: { productId: selectedNozzle!.productId, bill: { outletId, shiftEntryId: input.shiftEntryId!, salesmanEmployeeId: input.salesmanEmployeeId!, nozzleId: input.nozzleId!, status: "POSTED", type: { notIn: ["COUNTER", "CONSOLIDATED", "CREDIT_NOTE"] }, convertedShortCredit: { is: null } } }, _sum: { quantity: true } }),
        db.shortCredit.aggregate({ where: { outletId, shiftEntryId: input.shiftEntryId!, salesmanEmployeeId: input.salesmanEmployeeId!, nozzleId: input.nozzleId!, productId: selectedNozzle!.productId }, _sum: { quantity: true } }),
      ]);
      const requestedLitres = previewLines.reduce((sum, line) => sum.plus(line.quantity), new Decimal(0));
      const allocatedLitres = new Decimal(priorBills._sum.quantity?.toString() ?? "0").plus(priorShorts._sum.quantity?.toString() ?? "0").plus(requestedLitres);
      if (allocatedLitres.gt(assignedReading.saleLitres.toString())) return { ok: false, error: "This bill exceeds the unbilled metered litres for the selected nozzle and salesman" };
    }
    const selectedVehicle = input.vehicleId ? customer?.vehicles.find((vehicle) => vehicle.id === input.vehicleId) : null;
    if (selectedVehicle?.allowedProductCodes.length && previewLines.some((line) => !selectedVehicle.allowedProductCodes.includes(line.product.code))) return { ok: false, error: "One or more products are not permitted for the selected vehicle" };
    if (selectedVehicle?.monthlyLimit && new Decimal(selectedVehicle.monthlyLimit.toString()).gt(0)) {
      const monthStart = new Date(Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth() + 1, 0));
      const prior = await db.billLine.aggregate({ where: { bill: { outletId, vehicleId: selectedVehicle.id, status: "POSTED", type: { not: "CREDIT_NOTE" }, businessDate: { gte: monthStart, lte: monthEnd } } }, _sum: { quantity: true } });
      const requested = previewLines.reduce((total, line) => total.plus(line.quantity), new Decimal(0));
      if (new Decimal(prior._sum.quantity?.toString() ?? "0").plus(requested).gt(selectedVehicle.monthlyLimit.toString())) return { ok: false, error: `This bill would exceed the vehicle monthly quantity limit of ${selectedVehicle.monthlyLimit.toString()}` };
    }
    const warnings: string[] = [];
    if (input.billType === "CREDIT" && customer) {
      const exposure = await customerOutstanding(outletId, customer.id, businessDate);
      const decision = evaluateCredit({ outstanding: exposure.outstanding, billAmount: previewTotals.grandTotal, creditLimit: customer.creditLimit.toString(), overdueAmount: exposure.overdue, blockLimit: customer.blockOnLimitBreach && settings.boolean("credit.blockOnLimitBreach"), blockOverdue: settings.boolean("credit.blockOnOverdue") });
      warnings.push(...decision.warnings);
      if (decision.blocked) {
        if (!input.creditOverrideReason) return { ok: false, error: `${decision.warnings.join(". ")}. A manager override reason is required.` };
        await requirePermission("BILLING", "approve");
      }
    }
    const result = await withAudit({ outletId, tableName: "bills", recordId: "new", action: "CREATE", businessDate, newValue: auditJson(input), reason: input.creditOverrideReason }, async (tx) => {
      const lines = await prepareLines(tx, outletId, billedAt, input.invoiceKind, customer?.gstin?.slice(0, 2), input.lines);
      const totals = computeBillTotals(lines, input.autoRoundOff && settings.boolean("billing.autoRoundOff"));
      const seriesName = input.channel === "MOBILE" ? "BILL_MOBILE" : input.billType === "CREDIT_NOTE" ? "CREDIT_NOTE" : `BILL_${input.billType}`;
      const number = await issueNumber(tx, outletId, seriesName, businessDate, settings.number("org.financialYearStartMonth"));
      const dueDate = input.billType === "CREDIT" && customer ? addDays(businessDate, customer.creditDays) : null;
      const bill = await tx.bill.create({ data: {
        outletId, customerId: customer?.id, vehicleId: input.vehicleId ?? originalBill?.vehicleId, shiftEntryId: input.shiftEntryId, salesmanEmployeeId: input.salesmanEmployeeId, nozzleId: input.nozzleId, originalBillId: input.originalBillId,
        seriesCode: number.seriesCode, seriesNumber: number.seriesNumber, docNumber: number.docNumber, businessDate, billedAt, dueDate, type: input.billType, invoiceKind: input.invoiceKind, channel: input.channel, clientRequestId: input.clientRequestId,
        vehicleNo: input.vehicleNo ?? originalBill?.vehicleNo, driverName: input.driverName ?? originalBill?.driverName, customerName: customer?.name ?? originalBill?.customerName ?? "Walk-in customer", subTotal: totals.subTotal, discount: totals.discount, taxableValue: totals.taxableValue, gstAmount: totals.gstAmount, cgstAmount: totals.cgstAmount, sgstAmount: totals.sgstAmount, igstAmount: totals.igstAmount, cessAmount: totals.cessAmount, roundOff: totals.roundOff, totalAmount: totals.grandTotal, paidAmount: input.billType === "CREDIT" ? new Decimal(0) : totals.grandTotal, amountInWords: amountInIndianWords(totals.grandTotal), remarks: input.remarks, createdById: session.user.id,
        lines: { create: lines.map((line, index) => ({ productId: line.product.id, quantity: line.quantity, rate: line.rate, unit: line.product.type, hsnCode: line.product.hsnCode, discountPerUnit: line.discountPerUnit, discount: line.discount, taxableValue: line.taxableValue, gstPct: line.gstPct, gstAmount: line.gstAmount, cgstPct: line.cgstPct, cgstAmount: line.cgstAmount, sgstPct: line.sgstPct, sgstAmount: line.sgstAmount, igstPct: line.igstPct, igstAmount: line.igstAmount, cessPct: line.cessPct, cessAmount: line.cessAmount, amount: line.amount, costAtSale: new Decimal(line.product.weightedAvgCost.toString()), lineNo: index + 1 })) },
      } });
      const isCreditNote = input.billType === "CREDIT_NOTE";
      let debitAccount;
      if (input.billType === "CREDIT" || input.billType === "CREDIT_NOTE" && customer) debitAccount = await ensureCustomerLedger(tx, outletId, customer!.id);
      else {
        const paymentModeId = input.paymentModeId ?? originalBill?.settlements[0]?.paymentModeId;
        if (!paymentModeId) throw new Error("The original bill has no payment ledger to reverse");
        const mode = await tx.paymentMode.findFirstOrThrow({ where: { id: paymentModeId, outletId, isActive: true }, include: { account: true } });
        if (!isCreditNote && mode.type === "CREDIT") throw new Error("Use the credit billing screen for credit sales");
        if (!mode.account) throw new Error(`${mode.name} is not mapped to a ledger`);
        debitAccount = mode.account;
        if (!isCreditNote) await tx.billPaymentMode.create({ data: { billId: bill.id, paymentModeId: mode.id, amount: totals.grandTotal, referenceNo: input.paymentReference } });
      }
      const revenue = await revenueVoucherLines(tx, outletId, lines);
      const gstPayable = totals.gstAmount.plus(totals.cessAmount).gt(0) ? await accountBySystemOrCode(tx, outletId, "GST_PAYABLE", "GST_PAY") : null;
      const roundOffAccount = !totals.roundOff.isZero() ? await accountBySystemOrCode(tx, outletId, "ROUND_OFF", "ROUND_OFF") : null;
      const normalLines = [{ accountId: debitAccount.id, debit: totals.grandTotal, narration: number.docNumber }, ...revenue, ...(gstPayable ? [{ accountId: gstPayable.id, credit: totals.gstAmount.plus(totals.cessAmount), narration: "Output GST and cess" }] : []), ...(roundOffAccount && totals.roundOff.gt(0) ? [{ accountId: roundOffAccount.id, credit: totals.roundOff, narration: "Round off" }] : []), ...(roundOffAccount && totals.roundOff.lt(0) ? [{ accountId: roundOffAccount.id, debit: totals.roundOff.abs(), narration: "Round off" }] : [])];
      const voucherLines = isCreditNote
        ? normalLines.map((line) => ({ ...line, debit: "credit" in line ? line.credit : undefined, credit: "debit" in line ? line.debit : undefined }))
        : normalLines;
      await postVoucher(tx, { outletId, type: isCreditNote ? "CREDIT_NOTE" : "SALES", businessDate, narration: `${isCreditNote ? "Credit note" : "Sales bill"} ${number.docNumber}`, billId: bill.id, createdById: session.user.id, lines: voucherLines });
      if (input.billType === "COUNTER") for (const line of lines.filter((item) => !item.product.isFuel)) await recordStockMovement(tx, { outletId, productId: line.product.id, businessDate, type: "SALE", quantity: line.quantity.negated(), rate: line.product.weightedAvgCost.toString(), sourceType: "bills", sourceId: bill.id, remarks: number.docNumber, createdById: session.user.id });
      if (!isCreditNote && lines.some((line) => line.product.isFuel) && bill.shiftEntryId && bill.salesmanEmployeeId) {
        const settlement = await tx.shiftSettlement.findFirst({ where: { shiftEntryId: bill.shiftEntryId, employeeId: bill.salesmanEmployeeId, status: { not: "CANCELLED" } } });
        if (settlement) await postSettlementVoucher(tx, settlement.id, { createdById: session.user.id, financialYearStartMonth: settings.number("org.financialYearStartMonth") });
      }
      return { id: bill.id, docNumber: bill.docNumber };
    });
    const channels = [...(input.sendSms ? ["SMS" as const] : []), ...(input.sendEmail ? ["EMAIL" as const] : [])];
    if (channels.length) await sendBillNotifications(result.id, channels);
    revalidatePath("/billing");
    return { ok: true, ...result, warnings, duplicate: false };
  } catch (error) { return fail(error); }
}

export async function issueShortCredit(payload: unknown): Promise<BillingActionResult<{ id: string; docNumber: string }>> {
  const parsed = shortCreditSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;
  try {
    await requirePermission("BILLING", "add");
    const businessDate = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(businessDate);
    const issuedAt = localTimestamp(input.businessDate, input.issuedTime);
    const [product, salesman] = await Promise.all([db.product.findFirstOrThrow({ where: { id: input.productId, outletId, isActive: true } }), db.employee.findFirstOrThrow({ where: { id: input.salesmanEmployeeId, outletId, status: "ACTIVE" } })]);
    const [customer, vehicle, nozzle, shiftEntry] = await Promise.all([
      input.customerId ? db.customer.findFirst({ where: { id: input.customerId, outletId, isActive: true } }) : null,
      input.vehicleId && input.customerId ? db.customerVehicle.findFirst({ where: { id: input.vehicleId, customerId: input.customerId, customer: { outletId } } }) : null,
      input.nozzleId ? db.nozzle.findFirst({ where: { id: input.nozzleId, outletId, status: "ACTIVE" } }) : null,
      input.shiftEntryId ? db.shiftEntry.findFirst({ where: { id: input.shiftEntryId, outletId, status: { not: "CANCELLED" } } }) : null,
    ]);
    if (input.customerId && !customer || input.vehicleId && !vehicle || input.nozzleId && !nozzle || input.shiftEntryId && !shiftEntry) return { ok: false, error: "One of the selected customer, vehicle, nozzle or shift values is not valid for this outlet" };
    if (!product.isFuel) return { ok: false, error: "Running-short credit can only be issued for fuel" };
    if (shiftEntry!.businessDate.toISOString().slice(0, 10) !== input.businessDate) return { ok: false, error: "The selected shift does not belong to the slip date" };
    if (nozzle && nozzle.productId !== product.id) return { ok: false, error: "The selected nozzle does not dispense this product" };
    const assignedReading = await db.nozzleReading.findFirst({ where: { shiftEntryId: shiftEntry!.id, nozzleId: nozzle!.id, salesmanEmployeeId: salesman.id, productId: product.id }, select: { id: true, saleLitres: true } });
    if (!assignedReading) return { ok: false, error: "This nozzle is not assigned to the selected salesman in that shift" };
    const [priorBills, priorShorts] = await Promise.all([
      db.billLine.aggregate({ where: { productId: product.id, bill: { outletId, shiftEntryId: shiftEntry!.id, salesmanEmployeeId: salesman.id, nozzleId: nozzle!.id, status: "POSTED", type: { notIn: ["COUNTER", "CONSOLIDATED", "CREDIT_NOTE"] }, convertedShortCredit: { is: null } } }, _sum: { quantity: true } }),
      db.shortCredit.aggregate({ where: { outletId, shiftEntryId: shiftEntry!.id, salesmanEmployeeId: salesman.id, nozzleId: nozzle!.id, productId: product.id }, _sum: { quantity: true } }),
    ]);
    const allocatedLitres = new Decimal(priorBills._sum.quantity?.toString() ?? "0").plus(priorShorts._sum.quantity?.toString() ?? "0").plus(input.quantity);
    if (allocatedLitres.gt(assignedReading.saleLitres.toString())) return { ok: false, error: "This slip exceeds the unallocated metered litres for the selected nozzle and salesman" };
    const price = await getRateAt(product.id, issuedAt);
    if (!price) return { ok: false, error: `${product.name} has no price effective at the issue time` };
    const quantity = new Decimal(input.quantity);
    const amount = round2(quantity.mul(price.rate.toString()));
    const result = await withAudit({ outletId, tableName: "short_credits", recordId: "new", action: "CREATE", businessDate, newValue: auditJson(input) }, async (tx) => {
      const settings = await loadSettings(outletId, tx);
      const number = await issueNumber(tx, outletId, "RUNNING_SHORT", businessDate, settings.number("org.financialYearStartMonth"));
      const short = await tx.shortCredit.create({ data: { outletId, customerId: input.customerId, vehicleId: input.vehicleId, shiftEntryId: input.shiftEntryId, salesmanEmployeeId: salesman.id, nozzleId: input.nozzleId, productId: product.id, seriesCode: number.seriesCode, seriesNumber: number.seriesNumber, docNumber: number.docNumber, businessDate, issuedAt, customerName: input.customerName, mobile: input.mobile, vehicleNo: input.vehicleNo, driverName: input.driverName, quantity, rate: price.rate, amount, remarks: input.remarks, createdById: session.user.id } });
      const receivable = await accountBySystemOrCode(tx, outletId, "SHORT_CREDIT_RECEIVABLE", "SHORT_CREDIT");
      const sales = await accountBySystemOrCode(tx, outletId, "SALES_MS", "SALES_MS");
      await postVoucher(tx, { outletId, type: "SALES", businessDate, narration: `Running short ${number.docNumber}`, createdById: session.user.id, lines: [{ accountId: receivable.id, debit: amount }, { accountId: sales.id, credit: amount, productId: product.id, quantity }] });
      if (short.shiftEntryId) {
        const settlement = await tx.shiftSettlement.findFirst({ where: { shiftEntryId: short.shiftEntryId, employeeId: salesman.id, status: { not: "CANCELLED" } } });
        if (settlement) await postSettlementVoucher(tx, settlement.id, { createdById: session.user.id, financialYearStartMonth: settings.number("org.financialYearStartMonth") });
      }
      return { id: short.id, docNumber: short.docNumber };
    });
    revalidatePath("/billing/running-short");
    return { ok: true, ...result };
  } catch (error) { return fail(error); }
}

export async function resolveShortCredit(payload: unknown): Promise<BillingActionResult> {
  const parsed = resolveShortCreditSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the resolution details" };
  try {
    const action = parsed.data.resolution === "WRITE_OFF" ? "approve" : "modify";
    await requirePermission("BILLING", action);
    const short = await db.shortCredit.findUniqueOrThrow({ where: { id: parsed.data.id }, include: { customer: true, product: true } });
    const { outletId, session } = await requireUnlockedDate(short.businessDate);
    if (short.outletId !== outletId || short.status !== "ISSUED") return { ok: false, error: "This running short is no longer open in the selected outlet" };
    const resultId = await withAudit({ outletId, tableName: "short_credits", recordId: short.id, action: parsed.data.resolution === "WRITE_OFF" ? "APPROVE" : "UPDATE", businessDate: short.businessDate, oldValue: auditJson(short), newValue: auditJson(parsed.data), reason: parsed.data.reason }, async (tx) => {
      const receivable = await accountBySystemOrCode(tx, outletId, "SHORT_CREDIT_RECEIVABLE", "SHORT_CREDIT");
      if (parsed.data.resolution === "CONVERT") {
        if (!short.customer) throw new Error("Attach a registered customer before converting this slip");
        const settings = await loadSettings(outletId, tx);
        const number = await issueNumber(tx, outletId, "BILL_CREDIT", short.businessDate, settings.number("org.financialYearStartMonth"));
        const customerLedger = await ensureCustomerLedger(tx, outletId, short.customer.id);
        const bill = await tx.bill.create({ data: { outletId, customerId: short.customer.id, shiftEntryId: short.shiftEntryId, salesmanEmployeeId: short.salesmanEmployeeId, nozzleId: short.nozzleId, seriesCode: number.seriesCode, seriesNumber: number.seriesNumber, docNumber: number.docNumber, businessDate: short.businessDate, billedAt: new Date(), dueDate: addDays(short.businessDate, short.customer.creditDays), type: "CREDIT", invoiceKind: "BILL_OF_SUPPLY", customerName: short.customer.name, vehicleNo: short.vehicleNo, driverName: short.driverName, subTotal: short.amount, taxableValue: short.amount, totalAmount: short.amount, amountInWords: amountInIndianWords(short.amount.toString()), remarks: `Converted from ${short.docNumber}`, createdById: session.user.id, lines: { create: { productId: short.productId, quantity: short.quantity, rate: short.rate, unit: short.product.type, hsnCode: short.product.hsnCode, taxableValue: short.amount, amount: short.amount, lineNo: 1 } } } });
        await postVoucher(tx, { outletId, type: "JOURNAL", businessDate: short.businessDate, narration: `Convert ${short.docNumber} to ${bill.docNumber}`, billId: bill.id, createdById: session.user.id, lines: [{ accountId: customerLedger.id, debit: short.amount }, { accountId: receivable.id, credit: short.amount }] });
        await tx.shortCredit.update({ where: { id: short.id }, data: { status: "CONVERTED", convertedBillId: bill.id, resolvedAt: new Date(), resolvedById: session.user.id, resolutionReason: parsed.data.reason } });
        return bill.id;
      }
      if (parsed.data.resolution === "RECOVER") {
        const mode = await tx.paymentMode.findFirstOrThrow({ where: { id: parsed.data.paymentModeId, outletId }, include: { account: true } });
        if (!mode.account) throw new Error(`${mode.name} is not mapped to a ledger`);
        await postVoucher(tx, { outletId, type: "RECEIPT", businessDate: short.businessDate, narration: `Recovered ${short.docNumber}`, createdById: session.user.id, lines: [{ accountId: mode.account.id, debit: short.amount }, { accountId: receivable.id, credit: short.amount }] });
        await tx.shortCredit.update({ where: { id: short.id }, data: { status: "RECOVERED", recoveredAmount: short.amount, resolvedAt: new Date(), resolvedById: session.user.id, resolutionReason: parsed.data.reason } });
        return short.id;
      }
      const badDebt = await accountBySystemOrCode(tx, outletId, "BAD_DEBTS", "BAD_DEBTS");
      await postVoucher(tx, { outletId, type: "JOURNAL", businessDate: short.businessDate, narration: `Write off ${short.docNumber}`, createdById: session.user.id, lines: [{ accountId: badDebt.id, debit: short.amount }, { accountId: receivable.id, credit: short.amount }] });
      await tx.shortCredit.update({ where: { id: short.id }, data: { status: "WRITTEN_OFF", resolvedAt: new Date(), resolvedById: session.user.id, resolutionReason: parsed.data.reason } });
      return short.id;
    });
    revalidatePath("/billing/running-short");
    return { ok: true, id: resultId };
  } catch (error) { return fail(error); }
}

export async function requestBillCancellation(payload: unknown): Promise<BillingActionResult> {
  const parsed = cancellationSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "A cancellation reason is required" };
  try {
    const session = await requirePermission("BILLING", "modify");
    const bill = await db.bill.findUniqueOrThrow({ where: { id: parsed.data.billId } });
    const { outletId } = await requireUnlockedDate(bill.businessDate);
    if (bill.outletId !== outletId || bill.status !== "POSTED") return { ok: false, error: "Only posted bills in this outlet can be cancelled" };
    await withAudit({ outletId, tableName: "bills", recordId: bill.id, action: "UPDATE", businessDate: bill.businessDate, reason: parsed.data.reason }, (tx) => tx.bill.update({ where: { id: bill.id }, data: { cancellationRequestedById: session.user.id, cancellationRequestedAt: new Date(), cancellationRequestReason: parsed.data.reason } }));
    revalidatePath("/billing/bills"); return { ok: true, id: bill.id };
  } catch (error) { return fail(error); }
}

export async function approveBillCancellation(payload: unknown): Promise<BillingActionResult> {
  const parsed = cancellationApprovalSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Approval details are incomplete" };
  try {
    const session = await requirePermission("BILLING", "approve");
    const bill = await db.bill.findUniqueOrThrow({ where: { id: parsed.data.billId }, include: { voucher: { include: { lines: true } }, lines: { include: { product: true } } } });
    const { outletId } = await requireUnlockedDate(bill.businessDate);
    if (bill.outletId !== outletId || !bill.cancellationRequestedAt || bill.status !== "POSTED") return { ok: false, error: "This bill has no pending cancellation request" };
    if (!parsed.data.approve) {
      await withAudit({ outletId, tableName: "bills", recordId: bill.id, action: "REJECT", businessDate: bill.businessDate, reason: parsed.data.reason }, (tx) => tx.bill.update({ where: { id: bill.id }, data: { cancellationRequestedAt: null, cancellationRequestedById: null, cancellationRequestReason: null } }));
      return { ok: true, id: bill.id };
    }
    await withAudit({ outletId, tableName: "bills", recordId: bill.id, action: "CANCEL", businessDate: bill.businessDate, oldValue: auditJson(bill), reason: parsed.data.reason }, async (tx) => {
      if (bill.voucher) await postVoucher(tx, { outletId, type: "CREDIT_NOTE", businessDate: bill.businessDate, narration: `Cancellation reversal for ${bill.docNumber}`, createdById: session.user.id, lines: bill.voucher.lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, productId: line.productId ?? undefined, narration: `Reverse ${bill.docNumber}` })) });
      if (bill.type === "COUNTER") for (const line of bill.lines.filter((entry) => !entry.product.isFuel)) await recordStockMovement(tx, { outletId, productId: line.productId, businessDate: bill.businessDate, type: "ADJUSTMENT", quantity: line.quantity, rate: line.costAtSale?.toString() ?? "0", sourceType: "bill_cancellations", sourceId: bill.id, remarks: `Cancelled ${bill.docNumber}`, createdById: session.user.id });
      await tx.stockMovement.updateMany({ where: { sourceType: "bills", sourceId: bill.id }, data: { isCancelled: true } });
      await tx.bill.update({ where: { id: bill.id }, data: { status: "CANCELLED", cancelledById: session.user.id, cancelledAt: new Date(), cancelReason: bill.cancellationRequestReason, cancellationApprovedById: session.user.id, cancellationApprovedAt: new Date() } });
      if (bill.shiftEntryId && bill.salesmanEmployeeId) {
        const settlement = await tx.shiftSettlement.findFirst({ where: { shiftEntryId: bill.shiftEntryId, employeeId: bill.salesmanEmployeeId, status: { not: "CANCELLED" } } });
        if (settlement) await postSettlementVoucher(tx, settlement.id, { createdById: session.user.id });
      }
    });
    revalidatePath("/billing/bills"); return { ok: true, id: bill.id };
  } catch (error) { return fail(error); }
}

export async function generateConsolidatedBill(payload: unknown): Promise<BillingActionResult<{ id: string; docNumber: string }>> {
  const parsed = consolidatedBillingSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the consolidation details", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;
  try {
    await requirePermission("BILLING", "add");
    const businessDate = businessDateFromInput(input.toDate);
    const fromDate = businessDateFromInput(input.fromDate);
    const { outletId, session } = await requireUnlockedDate(businessDate);
    const customer = await db.customer.findFirstOrThrow({ where: { id: input.customerId, outletId, isActive: true } });
    const slips = await db.creditSlip.findMany({ where: { outletId, customerId: customer.id, isBilled: false, status: "POSTED", businessDate: { gte: fromDate, lte: businessDate } }, include: { product: true, vehicle: true }, orderBy: [{ businessDate: "asc" }, { docNumber: "asc" }] });
    if (!slips.length) return { ok: false, error: "No unbilled credit slips fall in that period" };
    const result = await withAudit({ outletId, tableName: "bills", recordId: "new", action: "CREATE", businessDate, newValue: auditJson(input) }, async (tx) => {
      const settings = await loadSettings(outletId, tx); const number = await issueNumber(tx, outletId, "BILL_CONSOLIDATED", businessDate, settings.number("org.financialYearStartMonth"));
      const grouped = new Map<string, { product: (typeof slips)[number]["product"]; quantity: Decimal; taxable: Decimal; description: string }>();
      for (const slip of slips) {
        const date = slip.businessDate.toISOString().slice(0, 10);
        const label = input.format === "DATE_WISE" ? date : input.format === "VEHICLE_WISE" ? slip.vehicle?.vehicleNo ?? "No vehicle" : input.format === "SLIP_WISE" ? `${date} · ${slip.docNumber}${slip.vehicle?.vehicleNo ? ` · ${slip.vehicle.vehicleNo}` : ""}` : slip.product.name;
        const key = input.format === "SLIP_WISE" ? slip.id : input.format === "DATE_WISE" ? `${date}:${slip.productId}` : input.format === "VEHICLE_WISE" ? `${slip.vehicleId ?? "none"}:${slip.productId}` : slip.productId;
        const bucket = grouped.get(key) ?? { product: slip.product, quantity: new Decimal(0), taxable: new Decimal(0), description: label };
        bucket.quantity = bucket.quantity.plus(slip.quantity.toString()); bucket.taxable = bucket.taxable.plus(slip.amount.toString()); grouped.set(key, bucket);
      }
      const total = round2(slips.reduce((sum, slip) => sum.plus(slip.amount.toString()), new Decimal(0)));
      const bill = await tx.bill.create({ data: { outletId, customerId: customer.id, seriesCode: number.seriesCode, seriesNumber: number.seriesNumber, docNumber: number.docNumber, businessDate, billedAt: new Date(), dueDate: addDays(businessDate, customer.creditDays), type: "CONSOLIDATED", invoiceKind: input.invoiceKind, channel: "CONSOLIDATED", customerName: customer.name, consolidationFrom: fromDate, consolidationTo: businessDate, consolidationFormat: input.format, subTotal: total, taxableValue: total, totalAmount: total, amountInWords: amountInIndianWords(total), remarks: input.remarks, createdById: session.user.id, lines: { create: [...grouped.values()].map((entry, index) => ({ productId: entry.product.id, description: entry.description, quantity: round2(entry.quantity), rate: round2(entry.taxable.div(entry.quantity)), unit: entry.product.type, hsnCode: entry.product.hsnCode, taxableValue: round2(entry.taxable), amount: round2(entry.taxable), lineNo: index + 1 })) } } });
      await tx.creditSlip.updateMany({ where: { id: { in: slips.map((slip) => slip.id) } }, data: { isBilled: true, billId: bill.id } });
      return { id: bill.id, docNumber: bill.docNumber };
    });
    revalidatePath("/billing/consolidated"); return { ok: true, ...result };
  } catch (error) { return fail(error); }
}

export async function saveEInvoiceResponse(payload: unknown): Promise<BillingActionResult> {
  const parsed = eInvoiceUpdateSchema.safeParse(payload); if (!parsed.success) return { ok: false, error: "IRN response details are incomplete" };
  try {
    await requirePermission("BILLING", "modify"); const bill = await db.bill.findUniqueOrThrow({ where: { id: parsed.data.billId } }); const { outletId } = await requireUnlockedDate(bill.businessDate); if (bill.outletId !== outletId) return { ok: false, error: "Bill belongs to another outlet" };
    const generated = await buildEInvoice(outletId, bill.id); if (generated.missing.length) return { ok: false, error: `Complete mandatory fields first: ${generated.missing.join(", ")}` };
    await withAudit({ outletId, tableName: "bills", recordId: bill.id, action: "UPDATE", businessDate: bill.businessDate, newValue: auditJson(parsed.data) }, (tx) => tx.bill.update({ where: { id: bill.id }, data: { irn: parsed.data.irn, acknowledgementNo: parsed.data.acknowledgementNo, acknowledgementAt: new Date(parsed.data.acknowledgementAt), signedQr: parsed.data.signedQr, eInvoicePayload: generated.payload as unknown as object } }));
    revalidatePath("/billing/e-invoice"); return { ok: true, id: bill.id };
  } catch (error) { return fail(error); }
}

export async function markBillsPrinted(payload: unknown): Promise<BillingActionResult<{ count: number }>> {
  const parsed = markPrintedSchema.safeParse(payload); if (!parsed.success) return { ok: false, error: "Choose at least one bill" };
  try {
    await requirePermission("BILLING", "modify"); const first = await db.bill.findUniqueOrThrow({ where: { id: parsed.data.billIds[0] } }); const { outletId, session } = await requireUnlockedDate(first.businessDate); const bills = await db.bill.findMany({ where: { id: { in: parsed.data.billIds }, outletId } }); if (bills.length !== parsed.data.billIds.length) return { ok: false, error: "One or more bills belong to another outlet" }; for (const bill of bills) await requireUnlockedDate(bill.businessDate);
    await withAudit({ outletId, tableName: "bills", recordId: parsed.data.billIds.join(","), action: "UPDATE", businessDate: first.businessDate, newValue: auditJson({ printed: parsed.data.billIds, layout: parsed.data.layout }) }, (tx) => tx.bill.updateMany({ where: { id: { in: parsed.data.billIds } }, data: { printedAt: new Date(), printedById: session.user.id, printCount: { increment: 1 } } }));
    revalidatePath("/billing/bills"); return { ok: true, count: bills.length };
  } catch (error) { return fail(error); }
}

export async function saveBillingSettings(payload: unknown): Promise<BillingActionResult> {
  const parsed = billingSettingsSchema.safeParse(payload); if (!parsed.success) return { ok: false, error: "Correct the billing settings", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  try {
    const session = await requirePermission("SETTINGS", "modify"); const { outletId } = await requireUnlockedDate();
    const values: Record<string, string | undefined> = {
      "credit.blockOnLimitBreach": String(parsed.data.blockOnLimitBreach), "credit.blockOnOverdue": String(parsed.data.blockOnOverdue), "billing.autoRoundOff": String(parsed.data.autoRoundOff), "billing.defaultPrintLayout": parsed.data.defaultPrintLayout,
      "notification.sms.provider": parsed.data.smsProvider, "notification.sms.endpoint": parsed.data.smsEndpoint ?? "", "notification.sms.apiKey": parsed.data.smsApiKey,
      "notification.sms.sender": parsed.data.smsSender, "notification.email.provider": parsed.data.emailProvider, "notification.email.endpoint": parsed.data.emailEndpoint ?? "", "notification.email.apiKey": parsed.data.emailApiKey, "notification.email.from": parsed.data.emailFrom,
    };
    const oldRows = await db.setting.findMany({ where: { outletId, key: { in: Object.keys(values) } }, select: { key: true, value: true } });
    const maskedOld = oldRows.map((row) => ({ ...row, value: row.key.endsWith(".apiKey") && row.value ? "***" : row.value }));
    await withAudit({ outletId, tableName: "settings", recordId: "billing", action: "UPDATE", oldValue: auditJson(maskedOld), newValue: auditJson({ ...values, "notification.sms.apiKey": values["notification.sms.apiKey"] ? "***" : undefined, "notification.email.apiKey": values["notification.email.apiKey"] ? "***" : undefined }) }, async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        const definition = settingDefinition(key);
        await tx.setting.upsert({ where: { outletId_key: { outletId, key } }, create: { outletId, key, value, defaultValue: definition.defaultValue, valueType: definition.valueType, label: definition.label, description: definition.description, group: definition.group, unit: definition.unit, updatedById: session.user.id }, update: { value, updatedById: session.user.id } });
      }
    });
    revalidatePath("/billing/settings"); return { ok: true, id: outletId };
  } catch (error) { return fail(error); }
}
