"use server";

import { AssetStatus, ModuleName, ProductType, UnitOfMeasure } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { Decimal } from "@/lib/money";
import { INDIA_TIMEZONE, businessDateFromInput, businessDateToday } from "@/lib/date";
import { withAudit } from "@/server/audit";
import { requirePermission, requireUnlockedDate } from "@/server/guard";
import { db } from "@/server/db";
import { auditJson } from "@/server/master/services";
import { accountGroupSchema, accountSchema, calibrationSchema, customerSchema, dispensingUnitSchema, employeeSchema, expenseHeadSchema, firmSchema, masterSchemas, nozzleSchema, outletSchema, paymentModeSchema, priceSchema, productSchema, shiftSchema, supplierSchema, tankSchema, type MasterEntity, type MasterPayload } from "@/server/master/schemas";

type ActionResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const moduleFor: Record<MasterEntity, ModuleName> = {
  outlet: "SETTINGS", product: "INVENTORY", price: "INVENTORY", tank: "PUMP_OPERATIONS", dispensingUnit: "PUMP_OPERATIONS", nozzle: "PUMP_OPERATIONS", employee: "PAYROLL", shift: "PUMP_OPERATIONS", customer: "CUSTOMERS", supplier: "PURCHASES", paymentMode: "ACCOUNTS", expenseHead: "ACCOUNTS", accountGroup: "ACCOUNTS", account: "ACCOUNTS", calibration: "INVENTORY", firm: "SETTINGS",
};

const entityTable: Record<MasterEntity, string> = { outlet: "outlets", product: "products", price: "price_history", tank: "tanks", dispensingUnit: "dispensing_units", nozzle: "nozzles", employee: "employees", shift: "shifts", customer: "customers", supplier: "suppliers", paymentMode: "payment_modes", expenseHead: "expense_heads", accountGroup: "account_groups", account: "accounts", calibration: "tank_calibration", firm: "firms" };

const decimal = (value: string | undefined): Decimal | undefined => value === undefined ? undefined : new Decimal(value);
const blankToNull = <T>(value: T | undefined): T | null => value ?? null;

async function assertRecordInScope(entity: MasterEntity, id: string, outletId: string, allowedOutletIds: string[]) {
  if (entity === "firm") return;
  const found = await (async (): Promise<boolean> => {
    switch (entity) {
      case "outlet": return allowedOutletIds.includes(id);
      case "product": return Boolean(await db.product.findFirst({ where: { id, outletId } }));
      case "price": return Boolean(await db.priceHistory.findFirst({ where: { id, outletId } }));
      case "tank": return Boolean(await db.tank.findFirst({ where: { id, outletId } }));
      case "dispensingUnit": return Boolean(await db.dispensingUnit.findFirst({ where: { id, outletId } }));
      case "nozzle": return Boolean(await db.nozzle.findFirst({ where: { id, outletId } }));
      case "employee": return Boolean(await db.employee.findFirst({ where: { id, outletId } }));
      case "shift": return Boolean(await db.shift.findFirst({ where: { id, outletId } }));
      case "customer": return Boolean(await db.customer.findFirst({ where: { id, outletId } }));
      case "supplier": return Boolean(await db.supplier.findFirst({ where: { id, outletId } }));
      case "paymentMode": return Boolean(await db.paymentMode.findFirst({ where: { id, outletId } }));
      case "expenseHead": return Boolean(await db.expenseHead.findFirst({ where: { id, outletId } }));
      case "accountGroup": return Boolean(await db.accountGroup.findFirst({ where: { id, outletId } }));
      case "account": return Boolean(await db.account.findFirst({ where: { id, outletId } }));
      case "calibration": return Boolean(await db.tankCalibration.findFirst({ where: { id, tank: { outletId } } }));
    }
  })();
  if (!found) throw new Error("Record is not available in the selected outlet");
}

export async function saveMaster(payload: MasterPayload): Promise<ActionResult> {
  const schema = masterSchemas[payload.entity];
  const parsed = schema.safeParse(payload.data);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await requirePermission(moduleFor[payload.entity], payload.id ? "modify" : "add");
    const effectiveDate = payload.entity === "price" ? businessDateFromInput(String(payload.data.effectiveFrom).slice(0, 10)) : businessDateToday();
    const { outletId, session } = await requireUnlockedDate(effectiveDate);
    if (payload.id) await assertRecordInScope(payload.entity, payload.id, outletId, session.user.outletIds);
    const id = await withAudit({ outletId: payload.entity === "firm" ? undefined : outletId, tableName: entityTable[payload.entity], recordId: payload.id ?? "new", action: payload.entity === "price" ? "PRICE_CHANGE" : payload.id ? "UPDATE" : "CREATE", businessDate: effectiveDate, newValue: auditJson(payload.data) }, async (tx) => {
      switch (payload.entity) {
        case "outlet": {
          const value = outletSchema.parse(payload.data);
          if (payload.id) return (await tx.outlet.update({ where: { id: payload.id }, data: value })).id;
          return (await tx.outlet.create({ data: value })).id;
        }
        case "product": {
          const value = productSchema.parse(payload.data);
          const { currentPurchaseRate, currentSellingRate, ...product } = value;
          const data = { ...product, productType: product.productType as ProductType, type: product.type as UnitOfMeasure, gstPct: decimal(product.gstPct), reorderLevel: decimal(product.reorderLevel) };
          const record = payload.id ? await tx.product.update({ where: { id: payload.id }, data }) : await tx.product.create({ data: { ...data, outletId } });
          if (currentSellingRate) await tx.priceHistory.create({ data: { outletId, productId: record.id, rate: new Decimal(currentSellingRate), purchaseRate: decimal(currentPurchaseRate), effectiveFrom: new Date(), effectiveDate, reason: "Product master rate update", createdById: session.user.id } });
          return record.id;
        }
        case "price": {
          if (payload.id) throw new Error("Price history is immutable; enter a new effective price instead");
          const value = priceSchema.parse(payload.data);
          const effectiveFrom = fromZonedTime(value.effectiveFrom, INDIA_TIMEZONE);
          await tx.priceHistory.updateMany({ where: { outletId, productId: value.productId, effectiveTo: null, effectiveFrom: { lt: effectiveFrom } }, data: { effectiveTo: effectiveFrom } });
          return (await tx.priceHistory.create({ data: { outletId, productId: value.productId, rate: new Decimal(value.rate), purchaseRate: decimal(value.purchaseRate), effectiveFrom, effectiveDate, reason: value.reason, createdById: session.user.id } })).id;
        }
        case "tank": {
          const value = tankSchema.parse(payload.data);
          const data = { ...value, capacity: new Decimal(value.capacity), deadStock: new Decimal(value.deadStock), status: value.status as AssetStatus };
          if (payload.id) return (await tx.tank.update({ where: { id: payload.id }, data })).id;
          return (await tx.tank.create({ data: { ...data, outletId } })).id;
        }
        case "dispensingUnit": {
          const value = dispensingUnitSchema.parse(payload.data);
          const data = { ...value, status: value.status as AssetStatus };
          if (payload.id) return (await tx.dispensingUnit.update({ where: { id: payload.id }, data })).id;
          return (await tx.dispensingUnit.create({ data: { ...data, outletId } })).id;
        }
        case "nozzle": {
          const value = nozzleSchema.parse(payload.data);
          const data = { ...value, initialReading: new Decimal(value.initialReading), currentReading: new Decimal(value.currentReading), meterDigits: Number(value.meterDigits), status: value.status as AssetStatus };
          if (payload.id) return (await tx.nozzle.update({ where: { id: payload.id }, data })).id;
          return (await tx.nozzle.create({ data: { ...data, outletId } })).id;
        }
        case "employee": {
          const value = employeeSchema.parse(payload.data);
          const data = { ...value, joinedOn: businessDateFromInput(value.joinedOn), aadhaarLast4: blankToNull(value.aadhaarLast4), status: value.status as "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED" };
          if (payload.id) return (await tx.employee.update({ where: { id: payload.id }, data })).id;
          return (await tx.employee.create({ data: { ...data, outletId, createdById: session.user.id } })).id;
        }
        case "shift": {
          const value = shiftSchema.parse(payload.data);
          const data = { ...value, sequence: Number(value.sequence) };
          if (payload.id) return (await tx.shift.update({ where: { id: payload.id }, data })).id;
          return (await tx.shift.create({ data: { ...data, outletId } })).id;
        }
        case "customer": {
          const value = customerSchema.parse(payload.data);
          const { vehicles, ...customer } = value;
          const data = { ...customer, creditLimit: new Decimal(customer.creditLimit), creditDays: Number(customer.creditDays), openingBalance: new Decimal(customer.openingBalance), discountPerLitre: new Decimal(customer.discountPerLitre) };
          if (payload.id) {
            const record = await tx.customer.update({ where: { id: payload.id }, data });
            await tx.customerVehicle.updateMany({ where: { customerId: payload.id }, data: { isActive: false } });
            for (const vehicle of vehicles) await tx.customerVehicle.upsert({ where: { customerId_vehicleNo: { customerId: payload.id, vehicleNo: vehicle.vehicleNo } }, create: { customerId: payload.id, ...vehicle, monthlyLimit: decimal(vehicle.monthlyLimit) }, update: { ...vehicle, monthlyLimit: decimal(vehicle.monthlyLimit), isActive: true } });
            return record.id;
          }
          const record = await tx.customer.create({ data: { ...data, outletId, createdById: session.user.id } });
          for (const vehicle of vehicles) await tx.customerVehicle.create({ data: { customerId: record.id, ...vehicle, monthlyLimit: decimal(vehicle.monthlyLimit) } });
          return record.id;
        }
        case "supplier": {
          const value = supplierSchema.parse(payload.data);
          const data = { ...value, creditDays: Number(value.creditDays) };
          if (payload.id) return (await tx.supplier.update({ where: { id: payload.id }, data })).id;
          return (await tx.supplier.create({ data: { ...data, outletId } })).id;
        }
        case "paymentMode": {
          const value = paymentModeSchema.parse(payload.data);
          const data = { ...value, mdrPct: decimal(value.mdrPct), settlementDays: Number(value.settlementDays), accountId: blankToNull(value.accountId), type: value.type as "CASH" | "CARD" | "UPI" | "WALLET" | "FLEET_CARD" | "BANK_TRANSFER" | "CHEQUE" | "CREDIT" | "OTHER" };
          if (payload.id) return (await tx.paymentMode.update({ where: { id: payload.id }, data })).id;
          return (await tx.paymentMode.create({ data: { ...data, outletId } })).id;
        }
        case "expenseHead": {
          const value = expenseHeadSchema.parse(payload.data);
          const data = { ...value, accountId: blankToNull(value.accountId) };
          if (payload.id) return (await tx.expenseHead.update({ where: { id: payload.id }, data })).id;
          return (await tx.expenseHead.create({ data: { ...data, outletId } })).id;
        }
        case "accountGroup": {
          const value = accountGroupSchema.parse(payload.data);
          const data = { ...value, parentId: blankToNull(value.parentId), sortOrder: Number(value.sortOrder) };
          if (payload.id) return (await tx.accountGroup.update({ where: { id: payload.id }, data })).id;
          return (await tx.accountGroup.create({ data: { ...data, outletId } })).id;
        }
        case "account": {
          const value = accountSchema.parse(payload.data);
          const data = { ...value, openingBalance: new Decimal(value.openingBalance) };
          if (payload.id) return (await tx.account.update({ where: { id: payload.id }, data })).id;
          return (await tx.account.create({ data: { ...data, outletId } })).id;
        }
        case "calibration": {
          const value = calibrationSchema.parse(payload.data);
          const data = { ...value, dipMm: new Decimal(value.dipMm), litres: new Decimal(value.litres) };
          if (payload.id) return (await tx.tankCalibration.update({ where: { id: payload.id }, data })).id;
          return (await tx.tankCalibration.create({ data })).id;
        }
        case "firm": {
          const value = firmSchema.parse(payload.data);
          const { documentSeries, ...firm } = value;
          const record = payload.id ? await tx.firm.update({ where: { id: payload.id }, data: firm }) : await tx.firm.create({ data: firm });
          for (const series of documentSeries) await tx.firmDocumentSeries.upsert({ where: { firmId_documentType: { firmId: record.id, documentType: series.documentType } }, create: { firmId: record.id, documentType: series.documentType, prefix: series.prefix, suffix: series.suffix, padding: Number(series.padding) }, update: { prefix: series.prefix, suffix: series.suffix, padding: Number(series.padding), isActive: true } });
          return record.id;
        }
      }
    });
    revalidatePath("/");
    return { ok: true, id };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Unable to save the record" };
  }
}

export async function softDeleteMaster(entity: MasterEntity, id: string): Promise<ActionResult> {
  try {
    const session = await requirePermission(moduleFor[entity], "delete");
    const { outletId } = await requireUnlockedDate();
    await assertRecordInScope(entity, id, outletId, session.user.outletIds);
    const deletedId = await withAudit({ outletId: entity === "firm" ? undefined : outletId, tableName: entityTable[entity], recordId: id, action: "DELETE" }, async (tx) => {
      switch (entity) {
        case "outlet": return (await tx.outlet.update({ where: { id }, data: { isActive: false } })).id;
        case "product": return (await tx.product.update({ where: { id }, data: { isActive: false } })).id;
        case "price": return (await tx.priceHistory.update({ where: { id }, data: { isActive: false } })).id;
        case "tank": return (await tx.tank.update({ where: { id }, data: { status: "INACTIVE" } })).id;
        case "dispensingUnit": return (await tx.dispensingUnit.update({ where: { id }, data: { status: "INACTIVE" } })).id;
        case "nozzle": return (await tx.nozzle.update({ where: { id }, data: { status: "INACTIVE" } })).id;
        case "employee": return (await tx.employee.update({ where: { id }, data: { status: "RESIGNED" } })).id;
        case "shift": return (await tx.shift.update({ where: { id }, data: { isActive: false } })).id;
        case "customer": return (await tx.customer.update({ where: { id }, data: { isActive: false } })).id;
        case "supplier": return (await tx.supplier.update({ where: { id }, data: { isActive: false } })).id;
        case "paymentMode": return (await tx.paymentMode.update({ where: { id }, data: { isActive: false } })).id;
        case "expenseHead": return (await tx.expenseHead.update({ where: { id }, data: { isActive: false } })).id;
        case "accountGroup": return (await tx.accountGroup.update({ where: { id }, data: { isActive: false } })).id;
        case "account": return (await tx.account.update({ where: { id }, data: { isActive: false } })).id;
        case "calibration": return (await tx.tankCalibration.update({ where: { id }, data: { isActive: false } })).id;
        case "firm": return (await tx.firm.update({ where: { id }, data: { isActive: false } })).id;
      }
    });
    revalidatePath("/");
    return { ok: true, id: deletedId };
  } catch (caught) { return { ok: false, error: caught instanceof Error ? caught.message : "Unable to deactivate the record" }; }
}

export async function importCalibrationCsv(tankId: string, chartType: "FUEL" | "WATER", csv: string): Promise<ActionResult> {
  try {
    await requirePermission("INVENTORY", "add");
    const { outletId } = await requireUnlockedDate();
    const tank = await (await import("@/server/db")).db.tank.findFirst({ where: { id: tankId, outletId }, select: { id: true } });
    if (!tank) return { ok: false, error: "Choose a tank from the active outlet" };
    const rows = csv.trim().split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim())).filter((cells) => cells.length >= 2 && /^-?\d+(\.\d+)?$/.test(cells[0]) && /^-?\d+(\.\d+)?$/.test(cells[1]));
    if (!rows.length) return { ok: false, error: "CSV needs numeric dip_mm,litres rows" };
    const ids = await withAudit({ outletId, tableName: "tank_calibration", recordId: tankId, action: "CREATE", newValue: auditJson(rows) }, async (tx) => {
      const result: string[] = [];
      for (const [dipMm, litres] of rows) {
        const point = await tx.tankCalibration.upsert({ where: { tankId_chartType_dipMm: { tankId, chartType, dipMm: new Decimal(dipMm) } }, create: { tankId, chartType, dipMm: new Decimal(dipMm), litres: new Decimal(litres) }, update: { litres: new Decimal(litres), isActive: true } });
        result.push(point.id);
      }
      return result;
    });
    revalidatePath("/");
    return { ok: true, id: ids[0] };
  } catch (caught) { return { ok: false, error: caught instanceof Error ? caught.message : "Calibration import failed" }; }
}
