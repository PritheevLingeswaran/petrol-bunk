import { differenceInCalendarDays } from "date-fns";
import { businessDateToday } from "@/lib/date";
import { formatINR, formatLitres } from "@/lib/format";
import { db } from "@/server/db";
import { getOutletScope, requirePermission } from "@/server/guard";
import { buildEInvoice } from "@/server/billing/services";
import { loadSettings } from "@/server/settings";

const iso = (date: Date) => date.toISOString().slice(0, 10);

export async function getBillingOptions() {
  await requirePermission("BILLING", "view");
  const scope = await getOutletScope();
  if (scope.allOutlets) return { editable: false as const, outlet: null, products: [], customers: [], employees: [], nozzles: [], paymentModes: [], shiftEntries: [], originalBills: [] };
  const outletId = scope.outletIds[0];
  const now = new Date();
  const [outlet, products, customers, employees, nozzles, paymentModes, shiftEntries, originalBills] = await Promise.all([
    db.outlet.findUniqueOrThrow({ where: { id: outletId }, select: { id: true, name: true, gstin: true, state: true } }),
    db.product.findMany({ where: { outletId, isActive: true }, include: { priceHistory: { where: { effectiveFrom: { lte: now }, isActive: true }, orderBy: { effectiveFrom: "desc" }, take: 1 } }, orderBy: [{ isFuel: "desc" }, { name: "asc" }] }),
    db.customer.findMany({ where: { outletId, isActive: true }, include: { vehicles: { where: { isActive: true }, orderBy: { vehicleNo: "asc" } } }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { outletId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.nozzle.findMany({ where: { outletId, status: "ACTIVE" }, include: { product: { select: { name: true } }, dispensingUnit: { select: { code: true } } }, orderBy: { code: "asc" } }),
    db.paymentMode.findMany({ where: { outletId, isActive: true }, select: { id: true, code: true, name: true, type: true, requiresReference: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.shiftEntry.findMany({ where: { outletId, businessDate: { gte: new Date(Date.now() - 7 * 86_400_000) }, status: { not: "CANCELLED" } }, include: { shift: { select: { name: true } } }, orderBy: [{ businessDate: "desc" }, { openedAt: "desc" }], take: 30 }),
    db.bill.findMany({ where: { outletId, type: { not: "CREDIT_NOTE" }, status: "POSTED" }, select: { id: true, docNumber: true, businessDate: true, customerName: true, totalAmount: true }, orderBy: { billedAt: "desc" }, take: 100 }),
  ]);
  return {
    editable: true as const,
    outlet,
    products: products.map((product) => ({ id: product.id, code: product.code, name: product.name, unit: product.type, isFuel: product.isFuel, hsnCode: product.hsnCode, gstPct: product.gstPct?.toString() ?? "0", rate: product.priceHistory[0]?.rate.toString() ?? "" })),
    customers: customers.map((customer) => ({ id: customer.id, code: customer.code, name: customer.name, gstin: customer.gstin, phone: customer.phone, email: customer.email, discountPerLitre: customer.discountPerLitre.toString(), creditLimit: customer.creditLimit.toString(), creditDays: customer.creditDays, vehicles: customer.vehicles.map((vehicle) => ({ id: vehicle.id, vehicleNo: vehicle.vehicleNo, driverName: vehicle.driverName, allowedProductCodes: vehicle.allowedProductCodes, monthlyLimit: vehicle.monthlyLimit?.toString() ?? null })) })),
    employees,
    nozzles: nozzles.map((nozzle) => ({ id: nozzle.id, code: nozzle.code, name: nozzle.name, productId: nozzle.productId, label: `${nozzle.dispensingUnit.code} / ${nozzle.code} · ${nozzle.product.name}` })),
    paymentModes,
    shiftEntries: shiftEntries.map((entry) => ({ id: entry.id, label: `${iso(entry.businessDate)} · ${entry.shift.name}` })),
    originalBills: originalBills.map((bill) => ({ id: bill.id, label: `${bill.docNumber} · ${bill.customerName ?? "Walk-in"} · ${formatINR(bill.totalAmount)}` })),
  };
}

export async function listBills() {
  await requirePermission("BILLING", "view");
  const scope = await getOutletScope();
  const bills = await db.bill.findMany({ where: { outletId: { in: scope.outletIds } }, include: { outlet: { select: { name: true } }, customer: { select: { name: true, phone: true } }, settlements: { include: { paymentMode: { select: { name: true } } } } }, orderBy: [{ billedAt: "desc" }], take: 750 });
  return bills.map((bill) => ({ id: bill.id, outlet: bill.outlet.name, docNumber: bill.docNumber, date: iso(bill.businessDate), time: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(bill.billedAt), type: bill.type, channel: bill.channel, invoiceKind: bill.invoiceKind, customer: bill.customer?.name ?? bill.customerName ?? "Walk-in", mobile: bill.customer?.phone ?? null, vehicleNo: bill.vehicleNo, total: bill.totalAmount.toString(), totalDisplay: formatINR(bill.totalAmount), payment: bill.settlements.map((entry) => entry.paymentMode.name).join(" + ") || (bill.type === "CREDIT" || bill.type === "CONSOLIDATED" ? "Credit" : "—"), status: bill.status, printed: Boolean(bill.printedAt), printCount: bill.printCount, cancellationPending: Boolean(bill.cancellationRequestedAt), irn: bill.irn }));
}

export async function listShortCredits() {
  await requirePermission("BILLING", "view");
  const scope = await getOutletScope();
  const today = businessDateToday();
  const slips = await db.shortCredit.findMany({ where: { outletId: { in: scope.outletIds } }, include: { outlet: { select: { name: true } }, product: { select: { name: true } }, salesman: { select: { name: true } }, customer: { select: { name: true } } }, orderBy: [{ status: "asc" }, { issuedAt: "asc" }], take: 500 });
  return slips.map((slip) => ({ id: slip.id, outlet: slip.outlet.name, docNumber: slip.docNumber, date: iso(slip.businessDate), customer: slip.customer?.name ?? slip.customerName, vehicleNo: slip.vehicleNo, product: slip.product.name, salesman: slip.salesman.name, quantity: slip.quantity.toString(), quantityDisplay: formatLitres(slip.quantity), amount: slip.amount.toString(), amountDisplay: formatINR(slip.amount), status: slip.status, ageDays: Math.max(0, differenceInCalendarDays(today, slip.businessDate)) }));
}

export async function listConsolidationCandidates() {
  await requirePermission("BILLING", "view");
  const scope = await getOutletScope();
  if (scope.allOutlets) return [];
  const grouped = await db.creditSlip.groupBy({ by: ["customerId"], where: { outletId: scope.outletIds[0], isBilled: false, status: "POSTED" }, _count: { id: true }, _sum: { amount: true }, _min: { businessDate: true }, _max: { businessDate: true } });
  const customers = await db.customer.findMany({ where: { id: { in: grouped.map((entry) => entry.customerId) } }, select: { id: true, code: true, name: true } });
  return grouped.map((entry) => ({ customerId: entry.customerId, customer: customers.find((customer) => customer.id === entry.customerId)?.name ?? "Customer", code: customers.find((customer) => customer.id === entry.customerId)?.code ?? "", count: entry._count.id, amount: entry._sum.amount?.toString() ?? "0", amountDisplay: formatINR(entry._sum.amount ?? 0), from: entry._min.businessDate ? iso(entry._min.businessDate) : "", to: entry._max.businessDate ? iso(entry._max.businessDate) : "" }));
}

export async function listEInvoiceBills() {
  await requirePermission("BILLING", "view");
  const scope = await getOutletScope();
  const bills = await db.bill.findMany({ where: { outletId: { in: scope.outletIds }, status: "POSTED", invoiceKind: "GST_INVOICE" }, include: { outlet: { select: { name: true } }, customer: { select: { name: true, gstin: true } } }, orderBy: { billedAt: "desc" }, take: 150 });
  return Promise.all(bills.map(async (bill) => {
    const validation = await buildEInvoice(bill.outletId, bill.id);
    return { id: bill.id, docNumber: bill.docNumber, date: iso(bill.businessDate), outlet: bill.outlet.name, customer: bill.customer?.name ?? bill.customerName ?? "Walk-in", gstin: bill.customer?.gstin ?? "", total: formatINR(bill.totalAmount), missing: validation.missing, ready: validation.missing.length === 0, irn: bill.irn, acknowledgementNo: bill.acknowledgementNo };
  }));
}

export async function getPrintableBills(ids: string[]) {
  await requirePermission("BILLING", "view");
  const scope = await getOutletScope();
  return db.bill.findMany({ where: { id: { in: ids }, outletId: { in: scope.outletIds } }, include: { outlet: { include: { firm: true } }, customer: true, vehicle: true, salesman: true, nozzle: true, lines: { include: { product: true }, orderBy: { lineNo: "asc" } }, settlements: { include: { paymentMode: true } } }, orderBy: { billedAt: "asc" } });
}

export async function getBillingSettings() {
  await requirePermission("SETTINGS", "view"); const scope = await getOutletScope(); if (scope.allOutlets) return null; const outletId = scope.outletIds[0]; const settings = await loadSettings(outletId); const apiRows = await db.setting.findMany({ where: { outletId, key: { in: ["notification.sms.apiKey", "notification.email.apiKey"] } }, select: { key: true, value: true } }); const api = new Map(apiRows.map((row) => [row.key, Boolean(row.value)]));
  return { blockOnLimitBreach: settings.boolean("credit.blockOnLimitBreach"), blockOnOverdue: settings.boolean("credit.blockOnOverdue"), autoRoundOff: settings.boolean("billing.autoRoundOff"), defaultPrintLayout: settings.raw("billing.defaultPrintLayout"), smsProvider: settings.raw("notification.sms.provider"), smsEndpoint: settings.raw("notification.sms.endpoint"), smsApiKeySet: api.get("notification.sms.apiKey") ?? false, smsSender: settings.raw("notification.sms.sender"), emailProvider: settings.raw("notification.email.provider"), emailEndpoint: settings.raw("notification.email.endpoint"), emailApiKeySet: api.get("notification.email.apiKey") ?? false, emailFrom: settings.raw("notification.email.from") };
}
