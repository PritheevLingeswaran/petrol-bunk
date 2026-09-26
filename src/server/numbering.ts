/**
 * Document numbering. Lives on its own so the accounting engine and the
 * operational modules can both use it without importing each other.
 *
 * Every numbered document is unique on (outlet, series, number).
 */
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type IssuedNumber = { seriesCode: string; seriesNumber: number; docNumber: string };

const financialYearOf = (businessDate: Date, startMonth: number): string => {
  const year = businessDate.getUTCFullYear();
  const month = businessDate.getUTCMonth() + 1;
  const start = month >= startMonth ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

/**
 * Draws the next number in a series, creating the series on first use.
 * The counter is bumped inside the caller's transaction so two concurrent
 * shift closes can never be handed the same slip number.
 */
export async function issueNumber(tx: Tx, outletId: string, code: string, businessDate: Date, financialYearStartMonth = 4): Promise<IssuedNumber> {
  const financialYear = financialYearOf(businessDate, financialYearStartMonth);
  const existing = await tx.numberSeries.findUnique({ where: { outletId_code_financialYear: { outletId, code, financialYear } } });
  const configured = existing ? null : await tx.firmDocumentSeries.findFirst({ where: { documentType: code, isActive: true, firm: { outlets: { some: { id: outletId } } } } });
  const series =
    existing ??
    (await tx.numberSeries.create({
      data: { outletId, code, financialYear, name: code.replaceAll("_", " "), prefix: configured?.prefix ?? `${code.slice(0, 3)}/${financialYear}/`, suffix: configured?.suffix ?? "", padding: configured?.padding ?? 5 },
    }));

  const updated = await tx.numberSeries.update({ where: { id: series.id }, data: { currentNumber: { increment: 1 } } });
  const seriesNumber = Math.max(updated.currentNumber, updated.startNumber);
  return {
    seriesCode: code,
    seriesNumber,
    docNumber: `${series.prefix}${String(seriesNumber).padStart(series.padding, "0")}${series.suffix}`,
  };
}
