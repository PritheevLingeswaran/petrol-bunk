import { Prisma, type BillType, type PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { amountInIndianWords } from "../src/lib/billing";

const d = (value: Decimal.Value) => new Prisma.Decimal(new Decimal(value).toString());
const day = (daysBack: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
};
const plusDays = (date: Date, value: number): Date => new Date(date.getTime() + value * 86_400_000);

/** Seeded through real bills and balanced vouchers so ageing and ledgers are useful immediately. */
export async function seedBillingHistory(db: PrismaClient, outletId: string): Promise<void> {
  if (await db.bill.findFirst({ where: { outletId, clientRequestId: { startsWith: "seed-phase4-" } }, select: { id: true } })) return;

  const [customers, products, paymentModes, employees, nozzles, receivableGroup] = await Promise.all([
    db.customer.findMany({ where: { outletId, isActive: true }, include: { vehicles: { where: { isActive: true } } }, orderBy: { code: "asc" } }),
    db.product.findMany({ where: { outletId, isActive: true }, orderBy: { code: "asc" } }),
    db.paymentMode.findMany({ where: { outletId, isActive: true, accountId: { not: null } }, orderBy: { code: "asc" } }),
    db.employee.findMany({ where: { outletId, status: "ACTIVE" }, orderBy: { code: "asc" } }),
    db.nozzle.findMany({ where: { outletId, status: "ACTIVE" }, orderBy: { code: "asc" } }),
    db.accountGroup.findFirstOrThrow({ where: { outletId, code: "RECEIVABLE" } }),
  ]);
  if (!customers.length || !products.length || !paymentModes.length || !employees.length) throw new Error("Master data must be seeded before billing history");

  for (const customer of customers) {
    const account = await db.account.upsert({
      where: { outletId_code: { outletId, code: `CUST-${customer.code}` } },
      create: { outletId, groupId: receivableGroup.id, code: `CUST-${customer.code}`, name: customer.name, nature: "ASSET", normalBalance: "DEBIT", openingBalance: d(0), openingBalanceType: "DEBIT" },
      update: { name: customer.name, isActive: true },
    });
    if (customer.accountId !== account.id) await db.customer.update({ where: { id: customer.id }, data: { accountId: account.id } });
  }
  const refreshedCustomers = await db.customer.findMany({ where: { outletId, isActive: true }, include: { vehicles: { where: { isActive: true } } }, orderBy: { code: "asc" } });
  const immediateModes = paymentModes.filter((mode) => mode.type !== "CREDIT");
  const accountList = await db.account.findMany({ where: { outletId } });
  const systemAccount = (systemKey: string, code: string) => {
    const account = accountList.find((entry) => entry.systemKey === systemKey) ?? accountList.find((entry) => entry.code === code);
    if (!account) throw new Error(`Seed ledger ${code} is missing`);
    return account;
  };
  const fuelSales = systemAccount("SALES_MS", "SALES_MS");
  const lubeSales = systemAccount("SALES_LUBE", "LUBE_SALES");
  const gstPayable = systemAccount("GST_PAYABLE", "GST_PAY");
  const rateByCode = new Map<string, string>([["MS", "102.93"], ["HSD", "94.24"], ["XP95", "109.85"], ["PD", "98.30"], ["CNG", "90.50"], ["LUBE-5W30", "720.00"], ["2T", "185.00"], ["ADBLUE", "72.00"], ["COOLANT", "310.00"], ["MERCH", "199.00"]]);
  const counters: Record<BillType, number> = { CASH: 0, CREDIT: 0, CARD: 0, UPI: 0, MIXED: 0, COUNTER: 0, CONSOLIDATED: 0, CREDIT_NOTE: 0 };
  let voucherNumber = 0;
  let immediateModeIndex = 0;
  const billRefs: { id: string; date: Date; total: Decimal; debitAccountId: string; productId: string; type: BillType }[] = [];

  for (let daysBack = 89; daysBack >= 0; daysBack -= 1) {
    const businessDate = day(daysBack);
    for (let slot = 0; slot < 3; slot += 1) {
      const type: BillType = slot === 0 ? "CASH" : slot === 1 ? daysBack % 14 === 0 ? "CONSOLIDATED" : "CREDIT" : "COUNTER";
      const customer = type === "CREDIT" || type === "CONSOLIDATED" ? refreshedCustomers[(daysBack + slot) % refreshedCustomers.length] : null;
      const isCounter = type === "COUNTER";
      // Bills cover counter goods only. Fuel sold on credit is already
      // recognised at the pump by the shift settlement, which debits the
      // customer and credits fuel sales; billing it again here would book the
      // same litres twice and overstate both revenue and margin.
      const candidates = products.filter((product) => !product.isFuel);
      const product = candidates[(daysBack + slot) % candidates.length];
      const quantity = new Decimal(isCounter ? String(1 + daysBack % 3) : String(8 + daysBack % 31));
      const rate = new Decimal(rateByCode.get(product.code) ?? "100");
      const discountPerUnit = customer ? new Decimal(customer.discountPerLitre.toString()) : new Decimal(0);
      const discount = quantity.mul(discountPerUnit).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const taxable = quantity.mul(rate).minus(discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const gstPct = product.isFuel ? new Decimal(0) : new Decimal(product.gstPct?.toString() ?? "0");
      const gst = taxable.mul(gstPct).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const cgst = gst.div(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const sgst = gst.minus(cgst);
      const total = taxable.plus(gst).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
      const roundOff = total.minus(taxable.plus(gst)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const vehicle = customer?.vehicles[0];
      const mode = customer ? immediateModes[(daysBack + slot) % immediateModes.length] : immediateModes[immediateModeIndex++ % immediateModes.length];
      const seriesNumber = ++counters[type];
      const prefix = type === "CASH" ? "CSH" : type === "CREDIT" ? "CRD" : type === "COUNTER" ? "CTR" : "CON";
      const dueDate = customer ? plusDays(businessDate, customer.creditDays) : null;
      const promptPayer = customer ? Number(customer.code.slice(-3)) % 3 === 0 : false;
      const slowPayer = customer ? Number(customer.code.slice(-3)) % 3 === 1 : false;
      const paid = !customer || promptPayer || slowPayer && daysBack > 10;
      const debitAccountId = customer?.accountId ?? mode.accountId!;

      const bill = await db.bill.create({ data: {
        outletId, customerId: customer?.id, vehicleId: vehicle?.id, salesmanEmployeeId: employees[(daysBack + slot) % employees.length].id,
        nozzleId: product.isFuel && nozzles.length ? nozzles[(daysBack + slot) % nozzles.length].id : null,
        seriesCode: `SEED-${type}`, seriesNumber, docNumber: `${prefix}-${String(seriesNumber).padStart(5, "0")}`,
        businessDate, billedAt: new Date(businessDate.getTime() + (4 + slot) * 3_600_000 + 30 * 60_000), dueDate,
        type, invoiceKind: product.isFuel ? "BILL_OF_SUPPLY" : "GST_INVOICE", channel: daysBack % 5 === 0 ? "MOBILE" : type === "CONSOLIDATED" ? "CONSOLIDATED" : "DESKTOP",
        clientRequestId: `seed-phase4-${daysBack}-${slot}`, vehicleNo: vehicle?.vehicleNo, driverName: vehicle?.driverName, customerName: customer?.name ?? "Walk-in customer",
        subTotal: d(quantity.mul(rate)), discount: d(discount), taxableValue: d(taxable), gstAmount: d(gst), cgstAmount: d(cgst), sgstAmount: d(sgst), roundOff: d(roundOff), totalAmount: d(total), paidAmount: d(paid ? total : 0), amountInWords: amountInIndianWords(total),
        consolidationFrom: type === "CONSOLIDATED" ? plusDays(businessDate, -6) : null, consolidationTo: type === "CONSOLIDATED" ? businessDate : null, consolidationFormat: type === "CONSOLIDATED" ? ["DATE_WISE", "VEHICLE_WISE", "SLIP_WISE", "PRODUCT_WISE"][daysBack % 4] as "DATE_WISE" | "VEHICLE_WISE" | "SLIP_WISE" | "PRODUCT_WISE" : null,
        remarks: daysBack > 60 && customer && !paid ? "Seeded overdue account" : "Seeded Phase 4 billing history",
        lines: { create: { productId: product.id, quantity: d(quantity), rate: d(rate), unit: product.type, hsnCode: product.hsnCode, discountPerUnit: d(discountPerUnit), discount: d(discount), taxableValue: d(taxable), gstPct: d(gstPct), gstAmount: d(gst), cgstPct: d(gstPct.div(2)), cgstAmount: d(cgst), sgstPct: d(gstPct.div(2)), sgstAmount: d(sgst), amount: d(taxable.plus(gst)), costAtSale: product.weightedAvgCost, lineNo: 1 } },
        ...(customer ? {} : { settlements: { create: { paymentModeId: mode.id, amount: d(total), referenceNo: mode.requiresReference ? `SEED-${daysBack}-${slot}` : null } } }),
      } });

      // The revenue line carries its litres, so margin per litre is derivable
      // from the ledger without joining back to the bill.
      const credits = [{ accountId: product.isFuel ? fuelSales.id : lubeSales.id, amount: taxable, productId: product.id, quantity }, ...(gst.gt(0) ? [{ accountId: gstPayable.id, amount: gst, productId: undefined, quantity: undefined }] : [])];
      // Stock leaves for every bill, so the daily COGS posting picks it up.
      await db.stockMovement.create({ data: { outletId, productId: product.id, businessDate, type: "SALE", quantity: d(quantity.negated()), rate: product.weightedAvgCost, value: d(quantity.mul(new Decimal(product.weightedAvgCost.toString())).negated().toDecimalPlaces(2)), sourceType: "bills", sourceId: bill.id, remarks: bill.docNumber } });

      voucherNumber += 1;
      await db.voucher.create({ data: { outletId, seriesCode: "SEED-BILL-VCH", seriesNumber: voucherNumber, docNumber: `SBV-${String(voucherNumber).padStart(6, "0")}`, type: "SALES", businessDate, narration: `Seed bill ${bill.docNumber}`, totalDebit: d(total), totalCredit: d(total), billId: bill.id, lines: { create: [{ outletId, accountId: debitAccountId, businessDate, debit: d(total), credit: d(0), narration: bill.docNumber, lineNo: 1 }, ...credits.map((credit, index) => ({ outletId, accountId: credit.accountId, businessDate, debit: d(0), credit: d(credit.amount), productId: credit.productId, quantity: credit.quantity === undefined ? null : d(credit.quantity), narration: bill.docNumber, lineNo: index + 2 })), ...(roundOff.gt(0) ? [{ outletId, accountId: lubeSales.id, businessDate, debit: d(0), credit: d(roundOff), narration: "Round off", lineNo: credits.length + 2 }] : []), ...(roundOff.lt(0) ? [{ outletId, accountId: lubeSales.id, businessDate, debit: d(roundOff.abs()), credit: d(0), narration: "Round off", lineNo: credits.length + 2 }] : [])] } } });
      if (customer && paid) {
        voucherNumber += 1;
        await db.voucher.create({ data: { outletId, seriesCode: "SEED-BILL-VCH", seriesNumber: voucherNumber, docNumber: `SBV-${String(voucherNumber).padStart(6, "0")}`, type: "RECEIPT", businessDate: plusDays(businessDate, promptPayer ? 1 : 10), narration: `Seed receipt for ${bill.docNumber}`, totalDebit: d(total), totalCredit: d(total), lines: { create: [{ outletId, accountId: mode.accountId!, businessDate: plusDays(businessDate, promptPayer ? 1 : 10), debit: d(total), credit: d(0), lineNo: 1 }, { outletId, accountId: customer.accountId!, businessDate: plusDays(businessDate, promptPayer ? 1 : 10), debit: d(0), credit: d(total), lineNo: 2 }] } } });
      }
      billRefs.push({ id: bill.id, date: businessDate, total, debitAccountId, productId: product.id, type });
    }
  }

  for (let index = 0; index < 3; index += 1) {
    const original = billRefs[index * 30];
    const total = original.total.div(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const seriesNumber = ++counters.CREDIT_NOTE;
    const product = products.find((entry) => entry.id === original.productId)!;
    const note = await db.bill.create({ data: { outletId, originalBillId: original.id, seriesCode: "SEED-CREDIT_NOTE", seriesNumber, docNumber: `CN-${String(seriesNumber).padStart(5, "0")}`, businessDate: plusDays(original.date, 2), type: "CREDIT_NOTE", invoiceKind: product.isFuel ? "BILL_OF_SUPPLY" : "GST_INVOICE", customerName: "Credit note customer", subTotal: d(total), taxableValue: d(total), totalAmount: d(total), paidAmount: d(total), amountInWords: amountInIndianWords(total), clientRequestId: `seed-phase4-credit-note-${index}`, remarks: "Seeded correction by credit note", lines: { create: { productId: product.id, quantity: d(1), rate: d(total), unit: product.type, hsnCode: product.hsnCode, taxableValue: d(total), amount: d(total), lineNo: 1 } } } });
    voucherNumber += 1;
    await db.voucher.create({ data: { outletId, seriesCode: "SEED-BILL-VCH", seriesNumber: voucherNumber, docNumber: `SBV-${String(voucherNumber).padStart(6, "0")}`, type: "CREDIT_NOTE", businessDate: plusDays(original.date, 2), narration: `Seed credit note ${note.docNumber}`, totalDebit: d(total), totalCredit: d(total), billId: note.id, lines: { create: [{ outletId, accountId: product.isFuel ? fuelSales.id : lubeSales.id, businessDate: plusDays(original.date, 2), debit: d(total), credit: d(0), productId: product.id, lineNo: 1 }, { outletId, accountId: original.debitAccountId, businessDate: plusDays(original.date, 2), debit: d(0), credit: d(total), lineNo: 2 }] } } });
  }

  for (let index = 0; index < 18; index += 1) {
    const businessDate = day(index * 5);
    const product = products.find((entry) => entry.code === (index % 2 ? "HSD" : "MS"))!;
    const customer = refreshedCustomers[index % refreshedCustomers.length];
    const vehicle = customer.vehicles[0];
    const quantity = new Decimal(4 + index % 7);
    const rate = new Decimal(rateByCode.get(product.code)!);
    const amount = quantity.mul(rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const status = index % 4 === 0 ? "CONVERTED" : index % 4 === 1 ? "RECOVERED" : index % 4 === 2 ? "WRITTEN_OFF" : "ISSUED";
    const convertedBill = billRefs.filter((entry) => entry.type === "CREDIT")[index];
    await db.shortCredit.create({ data: { outletId, customerId: customer.id, vehicleId: vehicle?.id, salesmanEmployeeId: employees[index % employees.length].id, nozzleId: nozzles[index % Math.max(nozzles.length, 1)]?.id, productId: product.id, convertedBillId: status === "CONVERTED" ? convertedBill.id : null, seriesCode: "SEED-RUNNING-SHORT", seriesNumber: index + 1, docNumber: `RS-${String(index + 1).padStart(5, "0")}`, businessDate, issuedAt: new Date(businessDate.getTime() + 6 * 3_600_000), customerName: customer.name, mobile: customer.phone, vehicleNo: vehicle?.vehicleNo, driverName: vehicle?.driverName, quantity: d(quantity), rate: d(rate), amount: d(amount), recoveredAmount: d(status === "RECOVERED" ? amount : 0), status, resolvedAt: status === "ISSUED" ? null : plusDays(businessDate, 2), resolutionReason: status === "ISSUED" ? null : "Seeded resolution" } });
  }
  console.log("Phase 4 billing seeded: 90 days of invoices, payment behaviour, credit notes and running-short slips.");
}
