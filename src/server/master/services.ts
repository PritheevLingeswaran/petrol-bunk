import { CalibrationChartType, Prisma } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { interpolateDip } from "@/lib/dip";
import { db } from "@/server/db";

/** Returns the retail price effective at an exact timestamp. Price records are immutable. */
export async function getRateAt(productId: string, timestamp: Date) {
  return db.priceHistory.findFirst({
    where: { productId, isActive: true, effectiveFrom: { lte: timestamp }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: timestamp } }] },
    orderBy: { effectiveFrom: "desc" },
  });
}

export { interpolateDip, type CalibrationPoint } from "@/lib/dip";

export async function dipToLitres(tankId: string, mm: Decimal.Value, chartType: CalibrationChartType = "FUEL"): Promise<Decimal> {
  const rows = await db.tankCalibration.findMany({ where: { tankId, chartType, isActive: true }, orderBy: { dipMm: "asc" } });
  return interpolateDip(rows.map((row) => ({ dipMm: new Decimal(row.dipMm.toString()), litres: new Decimal(row.litres.toString()) })), mm);
}

export const auditJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
