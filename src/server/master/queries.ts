import { type MasterEntity } from "@/server/master/schemas";
import { getOutletScope } from "@/server/guard";
import { db } from "@/server/db";

export type MasterRecord = { id: string; values: Record<string, string | boolean | string[]>; inactive: boolean };
export type SelectOption = { value: string; label: string };
export type MasterOptions = { products: SelectOption[]; tanks: SelectOption[]; dispensingUnits: SelectOption[]; accounts: SelectOption[]; accountGroups: SelectOption[] };

const decimal = (value: { toString(): string } | null | undefined): string => value?.toString() ?? "";
const date = (value: Date | null | undefined): string => value ? value.toISOString().slice(0, 10) : "";
const dateTime = (value: Date): string => value.toISOString().slice(0, 16);

export async function getMasterOptions(): Promise<MasterOptions> {
  const scope = await getOutletScope();
  const where = { outletId: { in: scope.outletIds } };
  const [products, tanks, dispensingUnits, accounts, accountGroups] = await Promise.all([
    db.product.findMany({ where: { ...where, isActive: true }, orderBy: { code: "asc" } }),
    db.tank.findMany({ where: { ...where, status: "ACTIVE" }, orderBy: { code: "asc" } }),
    db.dispensingUnit.findMany({ where: { ...where, status: "ACTIVE" }, orderBy: { code: "asc" } }),
    db.account.findMany({ where: { ...where, isActive: true }, orderBy: { code: "asc" } }),
    db.accountGroup.findMany({ where: { ...where, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return {
    products: products.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    tanks: tanks.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    dispensingUnits: dispensingUnits.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    accounts: accounts.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    accountGroups: accountGroups.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
  };
}

export async function listMaster(entity: MasterEntity): Promise<MasterRecord[]> {
  const scope = await getOutletScope();
  const where = { outletId: { in: scope.outletIds } };
  switch (entity) {
    case "outlet": return (await db.outlet.findMany({ where: { id: { in: scope.outletIds } }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, legalName: row.legalName ?? "", omc: row.omc ?? "", dealerCode: row.dealerCode ?? "", addressLine1: row.addressLine1 ?? "", city: row.city ?? "", state: row.state ?? "", pincode: row.pincode ?? "", phone: row.phone ?? "", email: row.email ?? "", gstin: row.gstin ?? "" } }));
    case "product": return (await db.product.findMany({ where, include: { priceHistory: { where: { isActive: true }, orderBy: { effectiveFrom: "desc" }, take: 1 } }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, productType: row.productType, type: row.type, hsnCode: row.hsnCode ?? "", gstPct: decimal(row.gstPct), isFuel: row.isFuel, isDensityTracked: row.isDensityTracked, currentPurchaseRate: decimal(row.priceHistory[0]?.purchaseRate), currentSellingRate: decimal(row.priceHistory[0]?.rate), reorderLevel: decimal(row.reorderLevel) } }));
    case "price": return (await db.priceHistory.findMany({ where: { ...where }, include: { product: true }, orderBy: { effectiveFrom: "desc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { productId: row.productId, product: row.product.name, rate: decimal(row.rate), purchaseRate: decimal(row.purchaseRate), effectiveFrom: dateTime(row.effectiveFrom), reason: row.reason ?? "", enteredBy: row.createdById ?? "" } }));
    case "tank": return (await db.tank.findMany({ where, include: { product: true }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: row.status !== "ACTIVE", values: { code: row.code, name: row.name, productId: row.productId, product: row.product.name, capacity: decimal(row.capacity), deadStock: decimal(row.deadStock), status: row.status } }));
    case "dispensingUnit": return (await db.dispensingUnit.findMany({ where, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: row.status !== "ACTIVE", values: { code: row.code, name: row.name, make: row.make ?? "", model: row.model ?? "", serialNo: row.serialNo ?? "", status: row.status } }));
    case "nozzle": return (await db.nozzle.findMany({ where, include: { tank: true, product: true, dispensingUnit: true }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: row.status !== "ACTIVE", values: { code: row.code, name: row.name, dispensingUnitId: row.dispensingUnitId, dispensingUnit: row.dispensingUnit.code, tankId: row.tankId, tank: row.tank.code, productId: row.productId, product: row.product.name, initialReading: decimal(row.initialReading), currentReading: decimal(row.currentReading), meterDigits: String(row.meterDigits), status: row.status } }));
    case "employee": return (await db.employee.findMany({ where, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: row.status !== "ACTIVE", values: { code: row.code, name: row.name, photoUrl: row.photoUrl ?? "", phone: row.phone ?? "", addressLine1: row.addressLine1 ?? "", aadhaarLast4: row.aadhaarLast4 ?? "", joinedOn: date(row.joinedOn), designation: row.designation ?? "", bankName: row.bankName ?? "", accountNumber: row.accountNumber ?? "", ifsc: row.ifsc ?? "", status: row.status } }));
    case "shift": return (await db.shift.findMany({ where, orderBy: { sequence: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, startTime: row.startTime, endTime: row.endTime, sequence: String(row.sequence) } }));
    case "customer": return (await db.customer.findMany({ where, include: { vehicles: { where: { isActive: true } } }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, gstin: row.gstin ?? "", pan: row.pan ?? "", addressLine1: row.addressLine1 ?? "", contactPerson: row.contactPerson ?? "", phone: row.phone ?? "", creditLimit: decimal(row.creditLimit), creditDays: String(row.creditDays), openingBalance: decimal(row.openingBalance), openingBalanceType: row.openingBalanceType, discountPerLitre: decimal(row.discountPerLitre), statementEmail: row.statementEmail ?? "", statementMobile: row.statementMobile ?? "", vehicles: JSON.stringify(row.vehicles.map((vehicle) => ({ vehicleNo: vehicle.vehicleNo, driverName: vehicle.driverName ?? "", allowedProductCodes: vehicle.allowedProductCodes, monthlyLimit: decimal(vehicle.monthlyLimit) }))) } }));
    case "supplier": return (await db.supplier.findMany({ where, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, type: row.type, contactPerson: row.contactPerson ?? "", phone: row.phone ?? "", addressLine1: row.addressLine1 ?? "", gstin: row.gstin ?? "", pan: row.pan ?? "", creditDays: String(row.creditDays) } }));
    case "paymentMode": return (await db.paymentMode.findMany({ where, orderBy: { sortOrder: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, type: row.type, accountId: row.accountId ?? "", mdrPct: decimal(row.mdrPct), settlementDays: String(row.settlementDays), requiresReference: row.requiresReference } }));
    case "expenseHead": return (await db.expenseHead.findMany({ where, include: { account: true }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, accountId: row.accountId ?? "", account: row.account?.name ?? "", description: row.description ?? "" } }));
    case "accountGroup": return (await db.accountGroup.findMany({ where, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, nature: row.nature, parentId: row.parentId ?? "", isBalanceSheet: row.isBalanceSheet, sortOrder: String(row.sortOrder) } }));
    case "account": return (await db.account.findMany({ where, include: { group: true }, orderBy: { code: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { code: row.code, name: row.name, groupId: row.groupId, group: row.group.name, nature: row.nature, normalBalance: row.normalBalance, openingBalance: decimal(row.openingBalance), openingBalanceType: row.openingBalanceType, isBankAccount: row.isBankAccount, bankName: row.bankName ?? "", accountNumber: row.accountNumber ?? "", ifsc: row.ifsc ?? "" } }));
    case "calibration": return (await db.tankCalibration.findMany({ where: { tank: { outletId: { in: scope.outletIds } } }, include: { tank: true }, orderBy: [{ tank: { code: "asc" } }, { chartType: "asc" }, { dipMm: "asc" }] })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { tankId: row.tankId, tank: row.tank.code, chartType: row.chartType, dipMm: decimal(row.dipMm), litres: decimal(row.litres) } }));
    case "firm": return (await db.firm.findMany({ where: { isActive: true }, include: { documentSeries: { orderBy: { documentType: "asc" } } }, orderBy: { createdAt: "asc" } })).map((row) => ({ id: row.id, inactive: !row.isActive, values: { name: row.name, legalName: row.legalName ?? "", addressLine1: row.addressLine1 ?? "", addressLine2: row.addressLine2 ?? "", city: row.city ?? "", state: row.state ?? "", stateCode: row.stateCode ?? "", pincode: row.pincode ?? "", gstin: row.gstin ?? "", pan: row.pan ?? "", logoUrl: row.logoUrl ?? "", bankName: row.bankName ?? "", bankAccountName: row.bankAccountName ?? "", bankAccountNumber: row.bankAccountNumber ?? "", bankIfsc: row.bankIfsc ?? "", invoiceTerms: row.invoiceTerms ?? "", declarationText: row.declarationText ?? "", signatureUrl: row.signatureUrl ?? "", documentSeries: JSON.stringify(row.documentSeries.map((series) => ({ documentType: series.documentType, prefix: series.prefix, suffix: series.suffix ?? "", padding: String(series.padding) }))) } }));
  }
}
