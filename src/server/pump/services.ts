import { Prisma, type CalibrationChartType, type StockMovementType } from "@prisma/client";
import { Decimal, round2 } from "@/lib/money";
import { interpolateDip } from "@/lib/dip";
import { splitShiftIntoRateSegments, type PriceChange, type RateSegment } from "@/lib/pump";
import { db } from "@/server/db";

type Tx = Prisma.TransactionClient;

export { issueNumber, type IssuedNumber } from "@/server/numbering";

// Double-entry posting moved to the accounting engine in Phase 5. Re-exported
// so existing call sites keep working, but there is only one implementation.
export { postVoucher, systemAccount, UnbalancedVoucherError, type JournalLine, type PostVoucherInput } from "@/server/accounts/posting";

// ---------------------------------------------------------------------------
// Derived balances
// ---------------------------------------------------------------------------

/**
 * A salesman's recoverable balance is the debit balance on their own ledger —
 * derived from voucher lines, never stored on the employee row.
 */
export async function salesmanRecoverable(outletId: string, employeeId: string, upto?: Date): Promise<Decimal> {
  const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { accountId: true } });
  if (!employee?.accountId) return new Decimal(0);
  const totals = await db.voucherLine.aggregate({
    where: { outletId, accountId: employee.accountId, voucher: { status: "POSTED" }, ...(upto ? { businessDate: { lte: upto } } : {}) },
    _sum: { debit: true, credit: true },
  });
  return round2(new Decimal(totals._sum.debit?.toString() ?? "0").minus(new Decimal(totals._sum.credit?.toString() ?? "0")));
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export type StockMovementInput = {
  outletId: string;
  productId: string;
  businessDate: Date;
  type: StockMovementType;
  /** Signed: positive into stock, negative out of stock. */
  quantity: Decimal.Value;
  rate?: Decimal.Value;
  fromTankId?: string;
  toTankId?: string;
  shiftEntryId?: string;
  batchId?: string;
  sourceType?: string;
  sourceId?: string;
  remarks?: string;
  createdById?: string;
};

export async function recordStockMovement(tx: Tx, input: StockMovementInput) {
  const quantity = new Decimal(input.quantity);
  const rate = new Decimal(input.rate ?? 0);
  const movement = await tx.stockMovement.create({
    data: {
      outletId: input.outletId,
      productId: input.productId,
      businessDate: input.businessDate,
      type: input.type,
      quantity,
      rate,
      value: round2(quantity.mul(rate)),
      fromTankId: input.fromTankId,
      toTankId: input.toTankId,
      shiftEntryId: input.shiftEntryId,
      batchId: input.batchId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      remarks: input.remarks,
      createdById: input.createdById,
    },
  });

  for (const tankId of [input.fromTankId, input.toTankId].filter((value): value is string => Boolean(value))) {
    const [tank, balance] = await Promise.all([
      tx.tank.findUniqueOrThrow({ where: { id: tankId }, include: { product: { select: { name: true, reorderLevel: true } } } }),
      tx.stockMovement.aggregate({ where: { isCancelled: false, OR: [{ fromTankId: tankId }, { toTankId: tankId }] }, _sum: { quantity: true } }),
    ]);
    const stock = new Decimal(balance._sum.quantity?.toString() ?? "0");
    const reorder = new Decimal(tank.lowLevelAlert?.toString() ?? tank.product.reorderLevel?.toString() ?? "0");
    const referenceNo = `LOWSTOCK:${tankId}`;
    const reminder = await tx.reminder.findFirst({ where: { outletId: input.outletId, referenceNo, status: { in: ["OPEN", "SNOOZED"] } } });
    if (reorder.gt(0) && stock.lte(reorder)) {
      const data = { title: `Low stock · ${tank.code} · ${tank.product.name}`, notes: `${stock.toFixed(2)} L available; reorder level ${reorder.toFixed(2)} L`, dueDate: input.businessDate, alertBefore: 0, referenceNo, type: "OTHER" as const, status: "OPEN" as const };
      if (reminder) await tx.reminder.update({ where: { id: reminder.id }, data }); else await tx.reminder.create({ data: { outletId: input.outletId, ...data, createdById: input.createdById } });
    } else if (reminder) {
      await tx.reminder.update({ where: { id: reminder.id }, data: { status: "DONE", completedAt: new Date(), completedNote: "Stock restored above reorder level" } });
    }
  }
  return movement;
}

/** Closing dip litres for a tank on a date, or null when no dip was taken. */
export async function closingStockFor(outletId: string, tankId: string, businessDate: Date): Promise<Decimal | null> {
  const dip = await db.dipReading.findFirst({
    where: { outletId, tankId, businessDate, readingType: "CLOSING" },
    orderBy: { readingAt: "desc" },
  });
  return dip ? new Decimal(dip.netLitres.toString()) : null;
}

/**
 * Opening stock for a tank: the previous day's closing dip when one exists,
 * otherwise the last dip taken before the date. Never assumes zero.
 */
export async function openingStockFor(outletId: string, tankId: string, businessDate: Date): Promise<Decimal> {
  const previous = await db.dipReading.findFirst({
    where: { outletId, tankId, businessDate: { lt: businessDate } },
    orderBy: [{ businessDate: "desc" }, { readingAt: "desc" }],
  });
  return previous ? new Decimal(previous.netLitres.toString()) : new Decimal(0);
}

// ---------------------------------------------------------------------------
// Calibration and pricing helpers
// ---------------------------------------------------------------------------

export async function dipToLitres(tankId: string, mm: Decimal.Value, chartType: CalibrationChartType = "FUEL", client: Tx | typeof db = db): Promise<Decimal> {
  const rows = await client.tankCalibration.findMany({ where: { tankId, chartType, isActive: true }, orderBy: { dipMm: "asc" } });
  return interpolateDip(rows.map((row) => ({ dipMm: new Decimal(row.dipMm.toString()), litres: new Decimal(row.litres.toString()) })), mm);
}

/** Net stock a dip represents: fuel volume less the water sitting under it. */
export async function dipToNetLitres(tankId: string, fuelMm: Decimal.Value, waterMm: Decimal.Value, client: Tx | typeof db = db) {
  const fuelLitres = await dipToLitres(tankId, fuelMm, "FUEL", client);
  const waterLitres = new Decimal(waterMm).isZero() ? new Decimal(0) : await dipToLitres(tankId, waterMm, "WATER", client);
  return { fuelLitres, waterLitres, netLitres: round2(fuelLitres.minus(waterLitres)) };
}

export async function getRateAt(productId: string, timestamp: Date, client: Tx | typeof db = db) {
  return client.priceHistory.findFirst({
    where: { productId, isActive: true, effectiveFrom: { lte: timestamp }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }] },
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * Rate segments for one product across a shift window. A price change inside
 * the window splits the shift, and the changeover meter reading is collected
 * from the user rather than interpolated.
 */
export async function rateSegmentsFor(productId: string, shiftStart: Date, shiftEnd: Date, client: Tx | typeof db = db): Promise<RateSegment[]> {
  const rows = await client.priceHistory.findMany({
    where: { productId, isActive: true, effectiveFrom: { lt: shiftEnd } },
    orderBy: { effectiveFrom: "asc" },
  });
  const changes: PriceChange[] = rows.map((row) => ({ effectiveFrom: row.effectiveFrom, rate: new Decimal(row.rate.toString()) }));
  return splitShiftIntoRateSegments(shiftStart, shiftEnd, changes);
}

/** Purchase cost per litre used to value losses: last landed cost, else weighted average. */
export async function costPerLitre(outletId: string, productId: string, client: Tx | typeof db = db): Promise<Decimal> {
  const product = await client.product.findUniqueOrThrow({ where: { id: productId }, select: { weightedAvgCost: true } });
  const weighted = new Decimal(product.weightedAvgCost.toString());
  if (weighted.gt(0)) return weighted;
  const price = await client.priceHistory.findFirst({
    where: { outletId, productId, isActive: true, purchaseRate: { not: null } },
    orderBy: { effectiveFrom: "desc" },
  });
  return price?.purchaseRate ? new Decimal(price.purchaseRate.toString()) : new Decimal(0);
}

/** 30-day average sale litres for a nozzle, for the spike / zero-sale warning. */
export async function thirtyDayAverage(nozzleId: string, businessDate: Date, client: Tx | typeof db = db): Promise<Decimal> {
  const from = new Date(businessDate);
  from.setUTCDate(from.getUTCDate() - 30);
  const rows = await client.nozzleReading.findMany({
    where: { nozzleId, businessDate: { gte: from, lt: businessDate } },
    select: { saleLitres: true, businessDate: true },
  });
  if (rows.length === 0) return new Decimal(0);
  const byDate = new Map<string, Decimal>();
  for (const row of rows) {
    const key = row.businessDate.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? new Decimal(0)).plus(new Decimal(row.saleLitres.toString())));
  }
  const total = [...byDate.values()].reduce((sum, value) => sum.plus(value), new Decimal(0));
  return round2(total.div(byDate.size));
}

export const auditJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
