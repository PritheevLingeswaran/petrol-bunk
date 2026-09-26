import { Decimal, round2 } from "./money";

export type CalibrationPoint = { dipMm: Decimal; litres: Decimal };

/** Linear interpolation; a dip outside the certified range is never guessed. */
export function interpolateDip(points: CalibrationPoint[], mm: Decimal.Value): Decimal {
  const dip = new Decimal(mm);
  const ordered = [...points].sort((left, right) => left.dipMm.comparedTo(right.dipMm));
  if (ordered.length === 0) throw new Error("No active calibration points are available");
  const exact = ordered.find((point) => point.dipMm.eq(dip));
  if (exact) return exact.litres;
  const lower = ordered.filter((point) => point.dipMm.lt(dip)).at(-1);
  const upper = ordered.find((point) => point.dipMm.gt(dip));
  if (!lower || !upper) throw new Error("Dip is outside the certified calibration range");
  return round2(lower.litres.plus(dip.minus(lower.dipMm).div(upper.dipMm.minus(lower.dipMm)).mul(upper.litres.minus(lower.litres))));
}
