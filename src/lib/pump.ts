/**
 * Every number the business depends on. Pure functions only — no database,
 * no I/O, no clock — so each formula in PROJECT_SPEC § 4 is directly testable.
 *
 * Decimal throughout. A float never touches a litre or a rupee.
 */
import { Decimal, decimal, round2, round4 } from "@/lib/money";

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

// decimal.js stores zero with a positive sign, so `isPositive()` is true for 0
// and `isNegative()` is false for it. Every "strictly greater/less than zero"
// guard below therefore uses lt/gt/lte explicitly — using isPositive() here
// would report a perfectly balanced shift as a cash excess.

/** Litres carry 2 dp. */
export const roundLitres = (value: Decimal.Value): Decimal => round2(value);
/** Percentages carry 4 dp so a 0.0001 % drift is visible rather than rounded away. */
export const roundPct = (value: Decimal.Value): Decimal => decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
/** Density is reported to 1 dp in kg/m3. */
export const roundDensity = (value: Decimal.Value): Decimal => decimal(value).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);

// ---------------------------------------------------------------------------
// 1. Nozzle sale — PROJECT_SPEC § 4.1
// ---------------------------------------------------------------------------

export type NozzleSaleInput = {
  openingReading: Decimal.Value;
  closingReading: Decimal.Value;
  /** Dispensed into the 5-litre test measure and poured back into the tank. */
  testingLitres?: Decimal.Value;
  rate: Decimal.Value;
  /** Totaliser digit count, e.g. 8 for a meter that reads up to 99999999. */
  meterDigits?: number;
  /** User ticked "Meter rolled over"; only then may closing be below opening. */
  meterRollover?: boolean;
};

export type NozzleSale = {
  saleLitres: Decimal;
  saleAmount: Decimal;
  meterRollover: boolean;
  /** A rollover is never self-service — a manager signs it off. */
  needsApproval: boolean;
};

export class PumpArithmeticError extends Error {}

/**
 * Sale Litres = Closing − Opening − Testing.
 *
 * When the totaliser wraps past its digit limit the meter restarts from zero,
 * so the litres delivered before the wrap are (10^digits − Opening) and the
 * litres after it are Closing:
 *
 *     Sale = (10^digits − Opening) + Closing − Testing
 *
 * Testing litres come off the sale in both branches: they turned the meter but
 * they were poured back into the tank, so they were never sold.
 */
export function computeNozzleSale(input: NozzleSaleInput): NozzleSale {
  const opening = decimal(input.openingReading);
  const closing = decimal(input.closingReading);
  const testing = decimal(input.testingLitres ?? 0);
  const rate = decimal(input.rate);
  const rollover = Boolean(input.meterRollover);

  if (testing.lt(0)) throw new PumpArithmeticError("Testing litres cannot be negative");
  if (rate.lt(0)) throw new PumpArithmeticError("Rate cannot be negative");

  if (!rollover && closing.lt(opening)) {
    throw new PumpArithmeticError(
      `Closing reading ${closing.toFixed(2)} is below the opening reading ${opening.toFixed(2)}. ` +
        "If the meter rolled past its last digit, tick “Meter rolled over” — a manager must then approve the shift.",
    );
  }

  let gross: Decimal;
  if (rollover) {
    const digits = input.meterDigits ?? 8;
    if (!Number.isInteger(digits) || digits < 1) throw new PumpArithmeticError("Meter digits must be a whole number of at least 1");
    const wrapAt = new Decimal(10).pow(digits);
    if (opening.gt(wrapAt)) throw new PumpArithmeticError("Opening reading exceeds the meter's digit capacity");
    gross = wrapAt.minus(opening).plus(closing);
  } else {
    gross = closing.minus(opening);
  }

  const saleLitres = roundLitres(gross.minus(testing));
  if (saleLitres.lt(0)) throw new PumpArithmeticError("Testing litres exceed the litres the meter recorded for this shift");

  return {
    saleLitres,
    saleAmount: round2(saleLitres.mul(rate)),
    meterRollover: rollover,
    needsApproval: rollover,
  };
}

// ---------------------------------------------------------------------------
// 2. Mid-shift rate change — split the shift into rate segments
// ---------------------------------------------------------------------------

export type PriceChange = { effectiveFrom: Date; rate: Decimal.Value };
export type RateSegment = { segment: number; from: Date; to: Date; rate: Decimal };

/**
 * Splits a shift window into rate segments. The rate in force when the shift
 * opened governs segment 1; every price change strictly inside the window
 * starts a new segment. A change exactly at the shift start replaces the
 * opening rate rather than creating an empty segment.
 *
 * `changes` may arrive unsorted and may contain prices outside the window.
 */
export function splitShiftIntoRateSegments(shiftStart: Date, shiftEnd: Date, changes: PriceChange[]): RateSegment[] {
  if (shiftEnd.getTime() <= shiftStart.getTime()) throw new PumpArithmeticError("Shift end must be after shift start");

  const sorted = [...changes].sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  const opening = sorted.filter((change) => change.effectiveFrom.getTime() <= shiftStart.getTime()).at(-1);
  if (!opening) throw new PumpArithmeticError("No price is in force at the start of this shift");

  const inside = sorted.filter(
    (change) => change.effectiveFrom.getTime() > shiftStart.getTime() && change.effectiveFrom.getTime() < shiftEnd.getTime(),
  );

  const boundaries = [shiftStart, ...inside.map((change) => change.effectiveFrom), shiftEnd];
  const rates = [decimal(opening.rate), ...inside.map((change) => decimal(change.rate))];

  return rates.map((rate, index) => ({
    segment: index + 1,
    from: boundaries[index],
    to: boundaries[index + 1],
    rate,
  }));
}

// ---------------------------------------------------------------------------
// 3. Cash denomination and salesman settlement
// ---------------------------------------------------------------------------

/** Notes and coins offered in the counting grid. Overridable from settings. */
export const DEFAULT_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

/**
 * Sum of (denomination x count) plus loose coins entered as a rupee amount.
 * A count that is not a non-negative whole number is a data-entry fault, not
 * something to silently coerce.
 */
export function denominationTotal(counts: Record<string, number | string>, coinsAmount: Decimal.Value = 0): Decimal {
  let total = ZERO;
  for (const [face, count] of Object.entries(counts)) {
    const faceValue = decimal(face);
    const quantity = decimal(count === "" || count === null || count === undefined ? 0 : count);
    if (faceValue.lte(0)) throw new PumpArithmeticError(`Denomination ${face} is not a valid note or coin value`);
    if (quantity.lt(0) || !quantity.isInteger()) throw new PumpArithmeticError(`Count for ₹${face} must be a whole number of notes`);
    total = total.plus(faceValue.mul(quantity));
  }
  const coins = decimal(coinsAmount);
  if (coins.lt(0)) throw new PumpArithmeticError("Loose coin amount cannot be negative");
  return round2(total.plus(coins));
}

export type SettlementInput = {
  nozzleSaleAmount: Decimal.Value;
  counterSaleAmount?: Decimal.Value;
  cash: Decimal.Value;
  card?: Decimal.Value;
  upi?: Decimal.Value;
  wallet?: Decimal.Value;
  credit?: Decimal.Value;
  ownUse?: Decimal.Value;
  /** Expenses paid out of the salesman's shift cash — money they no longer hold. */
  expenses?: Decimal.Value;
  /** Below this the difference is noise, not a recovery. */
  toleranceAmount?: Decimal.Value;
};

export type Settlement = {
  totalSaleValue: Decimal;
  totalCollections: Decimal;
  /** Collections − Sale. Negative = SHORT and recoverable from the salesman. */
  shortExcess: Decimal;
  isShort: boolean;
  isExcess: boolean;
  withinTolerance: boolean;
};

/**
 *   Total Sale Value  = nozzle sale amounts + lube / counter sales
 *   Total Collections = Cash + Card + UPI + Wallets + Credit + Own Use
 *   Short / Excess    = Total Collections − Total Sale Value
 *
 * Expenses paid from shift cash are added to collections: the salesman is
 * accountable for that money and has evidenced where it went, so it counts as
 * accounted-for just like a credit slip does.
 */
export function computeSettlement(input: SettlementInput): Settlement {
  const totalSaleValue = round2(decimal(input.nozzleSaleAmount).plus(decimal(input.counterSaleAmount ?? 0)));
  const totalCollections = round2(
    decimal(input.cash)
      .plus(decimal(input.card ?? 0))
      .plus(decimal(input.upi ?? 0))
      .plus(decimal(input.wallet ?? 0))
      .plus(decimal(input.credit ?? 0))
      .plus(decimal(input.ownUse ?? 0))
      .plus(decimal(input.expenses ?? 0)),
  );
  const shortExcess = round2(totalCollections.minus(totalSaleValue));
  const tolerance = decimal(input.toleranceAmount ?? 0).abs();

  return {
    totalSaleValue,
    totalCollections,
    shortExcess,
    isShort: shortExcess.lt(0),
    isExcess: shortExcess.gt(0),
    withinTolerance: shortExcess.abs().lte(tolerance),
  };
}

export type BilledShiftReconciliationInput = {
  declaredCash: Decimal.Value;
  billedCash: Decimal.Value;
  nozzleSaleAmount: Decimal.Value;
  billedFuelAmount: Decimal.Value;
  runningShortAmount?: Decimal.Value;
  shortExcess: Decimal.Value;
  billedGrandTotal: Decimal.Value;
};

export type BilledShiftReconciliation = {
  unbilledCashDebit: Decimal;
  billedCashShort: Decimal;
  unbilledNozzleSale: Decimal;
  adjustedShortExcess: Decimal;
};

/**
 * Remove individually posted fuel bills from an aggregate shift settlement.
 *
 * The bill debits its grand total, but credits metered fuel value plus any
 * round-off. The shift remainder must therefore adjust short/excess by the
 * difference between the bill debit and fuel revenue. If billed cash is more
 * than cash handed over, the caller credits the difference back to cash and
 * the adjusted short debits the salesman. Running-short slips already debit
 * their own receivable, so they reduce both the unbilled meter sale and the
 * apparent attendant shortage.
 */
export function reconcileBilledShift(input: BilledShiftReconciliationInput): BilledShiftReconciliation {
  const declaredCash = round2(decimal(input.declaredCash));
  const billedCash = round2(decimal(input.billedCash));
  const billedFuelAmount = round2(decimal(input.billedFuelAmount));
  const runningShortAmount = round2(decimal(input.runningShortAmount ?? 0));
  const billedGrandTotal = round2(decimal(input.billedGrandTotal));

  return {
    unbilledCashDebit: round2(Decimal.max(declaredCash.minus(billedCash), 0)),
    billedCashShort: round2(Decimal.max(billedCash.minus(declaredCash), 0)),
    unbilledNozzleSale: round2(decimal(input.nozzleSaleAmount).minus(billedFuelAmount).minus(runningShortAmount)),
    adjustedShortExcess: round2(decimal(input.shortExcess).minus(billedGrandTotal.minus(billedFuelAmount)).plus(runningShortAmount)),
  };
}

// ---------------------------------------------------------------------------
// 4. Density and volume correction — PROJECT_SPEC § 4.6
// ---------------------------------------------------------------------------

/**
 * Observed density corrected to 15 °C.
 *
 *     density@15 = observed + k x (observed_temp − 15)
 *
 * `k` (kg/m3 per °C, default 0.65 from settings) is the calibration knob: a
 * real hydrometer and a real OMC conversion table disagree slightly with any
 * single coefficient, and the coefficient is what gets tuned to match them.
 */
export function densityAt15C(observedDensity: Decimal.Value, observedTempC: Decimal.Value, coefficient: Decimal.Value = "0.65"): Decimal {
  const density = decimal(observedDensity);
  if (density.lte(0)) throw new PumpArithmeticError("Observed density must be greater than zero");
  return roundDensity(density.plus(decimal(coefficient).mul(decimal(observedTempC).minus(15))));
}

/**
 * Volume correction factor to 15 °C.
 *
 *     vcf = 1 − c x (observed_temp − 15)
 *
 * Linear approximation of ASTM D1250 / IS 1448 Table 54B, with `c` configurable
 * (`quality.vcfLinearCoefficient`, default 0.00105). Flagged in the UI as an
 * approximation until the full table is loaded.
 */
export function volumeCorrectionFactor(observedTempC: Decimal.Value, coefficient: Decimal.Value = "0.00105"): Decimal {
  return round4(new Decimal(1).minus(decimal(coefficient).mul(decimal(observedTempC).minus(15))));
}

export const correctVolumeTo15C = (observedLitres: Decimal.Value, observedTempC: Decimal.Value, coefficient?: Decimal.Value): Decimal =>
  roundLitres(decimal(observedLitres).mul(volumeCorrectionFactor(observedTempC, coefficient)));

export type DensityCheck = { deviation: Decimal; withinTolerance: boolean };

/**
 * Receipt density against the density on the last invoice received for that
 * product. Outside the band is how wrong supply and adulteration get caught.
 */
export function checkDensityAgainstInvoice(
  receiptDensityAt15C: Decimal.Value,
  invoiceDensityAt15C: Decimal.Value,
  toleranceKgM3: Decimal.Value = "3.0",
): DensityCheck {
  const deviation = roundDensity(decimal(receiptDensityAt15C).minus(decimal(invoiceDensityAt15C)));
  return { deviation, withinTolerance: deviation.abs().lte(decimal(toleranceKgM3).abs()) };
}

// ---------------------------------------------------------------------------
// 5. Decantation and transit loss
// ---------------------------------------------------------------------------

export type DecantationInput = {
  invoiceQty: Decimal.Value;
  dipBeforeLitres: Decimal.Value;
  dipAfterLitres: Decimal.Value;
  /** Configurable receipt-loss threshold, % of invoice quantity. */
  allowancePct?: Decimal.Value;
  /** Purchase cost per litre, for valuing the loss. */
  costPerLitre?: Decimal.Value;
};

export type DecantationResult = {
  decantedQty: Decimal;
  transitLoss: Decimal;
  lossPct: Decimal;
  allowedLoss: Decimal;
  excessLoss: Decimal;
  lossValue: Decimal;
  withinAllowance: boolean;
};

/**
 *   Decanted Quantity = Dip-after litres − Dip-before litres
 *   Transit Loss      = Invoice Quantity − Decanted Quantity
 *   Loss %            = Loss / Invoice Quantity x 100
 */
export function computeDecantation(input: DecantationInput): DecantationResult {
  const invoiceQty = decimal(input.invoiceQty);
  if (invoiceQty.lte(0)) throw new PumpArithmeticError("Invoice quantity must be greater than zero");

  const decantedQty = roundLitres(decimal(input.dipAfterLitres).minus(decimal(input.dipBeforeLitres)));
  const transitLoss = roundLitres(invoiceQty.minus(decantedQty));
  const lossPct = roundPct(transitLoss.div(invoiceQty).mul(HUNDRED));
  const allowedLoss = roundLitres(invoiceQty.mul(decimal(input.allowancePct ?? 0)).div(HUNDRED));
  const excessLoss = transitLoss.gt(allowedLoss) ? roundLitres(transitLoss.minus(allowedLoss)) : ZERO;

  return {
    decantedQty,
    transitLoss,
    lossPct,
    allowedLoss,
    excessLoss,
    lossValue: round2(transitLoss.mul(decimal(input.costPerLitre ?? 0))),
    withinAllowance: transitLoss.lte(allowedLoss),
  };
}

// ---------------------------------------------------------------------------
// 6. Book stock, physical stock and variation — PROJECT_SPEC § 4.5
// ---------------------------------------------------------------------------

export type BookStockInput = {
  openingStock: Decimal.Value;
  /** Decanted receipts, not invoice quantity. */
  purchases?: Decimal.Value;
  /** Metered nozzle sale litres. Testing litres are already excluded. */
  sales?: Decimal.Value;
  /**
   * Issued free of charge and NOT through a metered nozzle — drum issues,
   * the generator, a washdown. Own use dispensed through a nozzle already sits
   * inside `sales` and must not be counted here a second time.
   */
  ownUse?: Decimal.Value;
  returns?: Decimal.Value;
};

/** Book Stock = Opening + Purchases − Sales − Own Use − Returns */
export function computeBookStock(input: BookStockInput): Decimal {
  return roundLitres(
    decimal(input.openingStock)
      .plus(decimal(input.purchases ?? 0))
      .minus(decimal(input.sales ?? 0))
      .minus(decimal(input.ownUse ?? 0))
      .minus(decimal(input.returns ?? 0)),
  );
}

export type StockVariationInput = BookStockInput & {
  /** Closing dip converted through the calibration chart, net of water. */
  physicalStock: Decimal.Value;
  /** Permissible evaporation %, per product, from settings. */
  allowancePct: Decimal.Value;
  /** Purchase cost per litre. A loss is a loss of cost, not of margin. */
  costPerLitre?: Decimal.Value;
};

export type StockVariationResult = {
  bookStock: Decimal;
  physicalStock: Decimal;
  /** Physical − Book. Negative = loss. */
  variationLitres: Decimal;
  variationPct: Decimal;
  permissibleLitres: Decimal;
  excessLossLitres: Decimal;
  variationValue: Decimal;
  excessLossValue: Decimal;
  withinAllowance: boolean;
};

/**
 *   Variation    = Physical − Book              (negative = loss)
 *   Variation %  = Variation / (Opening + Purchases) x 100
 *   Permissible  = Sales x allowable %
 *   Excess Loss  = |Variation| − Permissible
 *
 * Note the two different denominators: the percentage is measured against
 * throughput handled, the allowance against litres actually pumped.
 */
export function computeStockVariation(input: StockVariationInput): StockVariationResult {
  const bookStock = computeBookStock(input);
  const physicalStock = roundLitres(input.physicalStock);
  const variationLitres = roundLitres(physicalStock.minus(bookStock));

  const throughput = decimal(input.openingStock).plus(decimal(input.purchases ?? 0));
  const variationPct = throughput.isZero() ? ZERO : roundPct(variationLitres.div(throughput).mul(HUNDRED));

  const permissibleLitres = roundLitres(decimal(input.sales ?? 0).mul(decimal(input.allowancePct)).div(HUNDRED));
  const excess = variationLitres.abs().minus(permissibleLitres);
  const excessLossLitres = excess.gt(0) ? roundLitres(excess) : ZERO;

  const costPerLitre = decimal(input.costPerLitre ?? 0);

  return {
    bookStock,
    physicalStock,
    variationLitres,
    variationPct,
    permissibleLitres,
    excessLossLitres,
    variationValue: round2(variationLitres.mul(costPerLitre)),
    excessLossValue: round2(excessLossLitres.mul(costPerLitre)),
    withinAllowance: variationLitres.abs().lte(permissibleLitres),
  };
}

// ---------------------------------------------------------------------------
// 7. Advisory checks — warn, never block
// ---------------------------------------------------------------------------

export type SaleVarianceFlag = "SPIKE" | "ZERO_SALE" | null;

/**
 * Flags a nozzle whose sale looks wrong against its own recent history:
 * more than `spikeMultiple`x its 30-day average, or nothing at all when it
 * normally sells. Advisory — the shift still saves.
 */
export function flagSaleVariance(saleLitres: Decimal.Value, thirtyDayAverage: Decimal.Value, spikeMultiple: Decimal.Value = 3): SaleVarianceFlag {
  const sale = decimal(saleLitres);
  const average = decimal(thirtyDayAverage);
  if (average.lte(0)) return null;
  if (sale.isZero()) return "ZERO_SALE";
  if (sale.gt(average.mul(decimal(spikeMultiple)))) return "SPIKE";
  return null;
}

/** Water in the tank above the configured threshold is a dashboard alert. */
export const isWaterDipAlarming = (waterDipMm: Decimal.Value, thresholdMm: Decimal.Value = 25): boolean =>
  decimal(waterDipMm).gt(decimal(thresholdMm));
