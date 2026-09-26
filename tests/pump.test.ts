import { describe, expect, it } from "vitest";
import { Decimal } from "../src/lib/money";
import { interpolateDip } from "../src/lib/dip";
import {
  PumpArithmeticError,
  checkDensityAgainstInvoice,
  computeBookStock,
  computeDecantation,
  computeNozzleSale,
  computeSettlement,
  computeStockVariation,
  correctVolumeTo15C,
  denominationTotal,
  densityAt15C,
  flagSaleVariance,
  isWaterDipAlarming,
  reconcileBilledShift,
  splitShiftIntoRateSegments,
  volumeCorrectionFactor,
} from "../src/lib/pump";

const at = (iso: string) => new Date(iso);

// ---------------------------------------------------------------------------

describe("dipToLitres interpolation", () => {
  // A real calibration chart is not linear: the litres per mm change with the
  // curve of the tank shell, so interpolation must respect each interval.
  const chart = [
    { dipMm: new Decimal("0"), litres: new Decimal("0") },
    { dipMm: new Decimal("100"), litres: new Decimal("2500") },
    { dipMm: new Decimal("200"), litres: new Decimal("5100") },
    { dipMm: new Decimal("300"), litres: new Decimal("7700") },
    { dipMm: new Decimal("1000"), litres: new Decimal("30000") },
  ];

  it("returns the charted volume on an exact chart row", () => {
    expect(interpolateDip(chart, "200").toString()).toBe("5100");
  });

  it("interpolates linearly inside an interval", () => {
    // Halfway from 100mm (2500 L) to 200mm (5100 L) is 3800 L.
    expect(interpolateDip(chart, "150").toString()).toBe("3800");
  });

  it("uses the surrounding interval, not the overall chart slope", () => {
    // 250mm sits in the 200->300 band: 5100 + 0.5 * 2600 = 6400 L.
    // A naive global slope would give 7500 L — a 1,100 L error.
    expect(interpolateDip(chart, "250").toString()).toBe("6400");
  });

  it("keeps sub-millimetre precision before rounding to 2 dp", () => {
    // 100 -> 200mm is 26 L/mm, so 100.5mm is 2500 + 13 = 2513 L.
    expect(interpolateDip(chart, "100.5").toString()).toBe("2513");
  });

  it("interpolates across a wide sparse interval", () => {
    // 300 -> 1000mm spans 22300 L over 700mm; 650mm is 350mm in.
    expect(interpolateDip(chart, "650").toString()).toBe("18850");
  });

  it("refuses to guess a dip outside the certified range", () => {
    expect(() => interpolateDip(chart, "1200")).toThrow("outside");
  });

  it("refuses when no chart is loaded rather than returning zero", () => {
    expect(() => interpolateDip([], "100")).toThrow("No active calibration");
  });

  it("net stock deducts the water dip through the same chart", () => {
    const fuel = interpolateDip(chart, "150"); // 3800 L
    const water = interpolateDip(chart, "20"); // 500 L
    expect(fuel.minus(water).toString()).toBe("3300");
  });
});

// ---------------------------------------------------------------------------

describe("nozzle sale — testing litres", () => {
  it("subtracts testing litres from the sale", () => {
    const sale = computeNozzleSale({ openingReading: "125000.00", closingReading: "126000.00", testingLitres: "5", rate: "102.93" });
    expect(sale.saleLitres.toString()).toBe("995");
    expect(sale.saleAmount.toString()).toBe("102415.35");
  });

  it("charges nothing for the 5 litres returned to the tank", () => {
    const withTesting = computeNozzleSale({ openingReading: "1000", closingReading: "1500", testingLitres: "5", rate: "100" });
    const withoutTesting = computeNozzleSale({ openingReading: "1000", closingReading: "1500", testingLitres: "0", rate: "100" });
    // The meter moved 500 L either way; the customer is billed for 5 L less.
    expect(withoutTesting.saleLitres.minus(withTesting.saleLitres).toString()).toBe("5");
    expect(withoutTesting.saleAmount.minus(withTesting.saleAmount).toString()).toBe("500");
  });

  it("does NOT remove testing litres from tank stock — the critical distinction", () => {
    // The meter recorded 500 L leaving the pump; 5 L went back into the tank.
    const sale = computeNozzleSale({ openingReading: "1000", closingReading: "1500", testingLitres: "5", rate: "100" });
    const openingStock = "10000";

    // Stock falls by the 495 L actually sold, NOT by the 500 L the meter turned.
    const book = computeBookStock({ openingStock, sales: sale.saleLitres });
    expect(book.toString()).toBe("9505");

    // The wrong implementation — deducting metered litres — loses 5 L a shift,
    // which is 5,475 L a year across three shifts. Guard against it explicitly.
    const wrong = computeBookStock({ openingStock, sales: "500" });
    expect(book.minus(wrong).toString()).toBe("5");
  });

  it("rejects testing litres that exceed what the meter recorded", () => {
    expect(() => computeNozzleSale({ openingReading: "1000", closingReading: "1002", testingLitres: "5", rate: "100" })).toThrow(PumpArithmeticError);
  });

  it("rejects negative testing litres", () => {
    expect(() => computeNozzleSale({ openingReading: "1000", closingReading: "1500", testingLitres: "-1", rate: "100" })).toThrow("cannot be negative");
  });
});

describe("nozzle sale — closing below opening", () => {
  it("rejects a closing reading below the opening reading", () => {
    expect(() => computeNozzleSale({ openingReading: "1500", closingReading: "1400", rate: "100" })).toThrow(/below the opening reading/);
  });

  it("names the rollover tickbox in the rejection message", () => {
    expect(() => computeNozzleSale({ openingReading: "1500", closingReading: "1400", rate: "100" })).toThrow(/Meter rolled over/);
  });

  it("accepts an unchanged meter as a zero sale", () => {
    const sale = computeNozzleSale({ openingReading: "1500", closingReading: "1500", rate: "100" });
    expect(sale.saleLitres.toString()).toBe("0");
    expect(sale.saleAmount.toString()).toBe("0");
  });
});

describe("meter rollover", () => {
  it("applies (10^digits - opening) + closing", () => {
    // 8-digit meter wraps at 100000000. Opening 99999000, closing 500.
    const sale = computeNozzleSale({
      openingReading: "99999000",
      closingReading: "500",
      rate: "102.93",
      meterDigits: 8,
      meterRollover: true,
    });
    expect(sale.saleLitres.toString()).toBe("1500");
    expect(sale.saleAmount.toString()).toBe("154395");
  });

  it("subtracts testing litres across the wrap too", () => {
    const sale = computeNozzleSale({
      openingReading: "99999000",
      closingReading: "500",
      testingLitres: "10",
      rate: "100",
      meterDigits: 8,
      meterRollover: true,
    });
    expect(sale.saleLitres.toString()).toBe("1490");
  });

  it("honours a 6-digit meter's smaller wrap point", () => {
    // 6-digit meter wraps at 1000000, not 100000000.
    const sale = computeNozzleSale({ openingReading: "999500", closingReading: "200", rate: "100", meterDigits: 6, meterRollover: true });
    expect(sale.saleLitres.toString()).toBe("700");
  });

  it("flags every rollover for manager approval", () => {
    const sale = computeNozzleSale({ openingReading: "99999000", closingReading: "500", rate: "100", meterDigits: 8, meterRollover: true });
    expect(sale.needsApproval).toBe(true);
    expect(sale.meterRollover).toBe(true);
  });

  it("does not flag an ordinary shift for approval", () => {
    expect(computeNozzleSale({ openingReading: "1000", closingReading: "1500", rate: "100" }).needsApproval).toBe(false);
  });

  it("rejects an opening reading beyond the meter's capacity", () => {
    expect(() =>
      computeNozzleSale({ openingReading: "999999999", closingReading: "10", rate: "100", meterDigits: 6, meterRollover: true }),
    ).toThrow(/digit capacity/);
  });
});

// ---------------------------------------------------------------------------

describe("mid-shift rate split", () => {
  const shiftStart = at("2026-03-15T00:30:00.000Z"); // 06:00 IST
  const shiftEnd = at("2026-03-15T08:30:00.000Z"); // 14:00 IST

  it("returns a single segment when no price changed inside the shift", () => {
    const segments = splitShiftIntoRateSegments(shiftStart, shiftEnd, [{ effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" }]);
    expect(segments).toHaveLength(1);
    expect(segments[0].rate.toFixed(2)).toBe("102.93");
    expect(segments[0].from).toEqual(shiftStart);
    expect(segments[0].to).toEqual(shiftEnd);
  });

  it("splits into two segments at the changeover", () => {
    const changeover = at("2026-03-15T04:00:00.000Z"); // 09:30 IST
    const segments = splitShiftIntoRateSegments(shiftStart, shiftEnd, [
      { effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: changeover, rate: "104.10" },
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ segment: 1, from: shiftStart, to: changeover });
    expect(segments[0].rate.toFixed(2)).toBe("102.93");
    expect(segments[1]).toMatchObject({ segment: 2, from: changeover, to: shiftEnd });
    expect(segments[1].rate.toFixed(2)).toBe("104.10");
  });

  it("values each segment at its own rate from the changeover meter reading", () => {
    const changeover = at("2026-03-15T04:00:00.000Z");
    const [first, second] = splitShiftIntoRateSegments(shiftStart, shiftEnd, [
      { effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: changeover, rate: "104.10" },
    ]);
    // Meter: 125000 at open, 125600 at the changeover, 126000 at close.
    const before = computeNozzleSale({ openingReading: "125000", closingReading: "125600", rate: first.rate });
    const after = computeNozzleSale({ openingReading: "125600", closingReading: "126000", rate: second.rate });

    expect(before.saleAmount.toString()).toBe("61758");
    expect(after.saleAmount.toString()).toBe("41640");
    expect(before.saleLitres.plus(after.saleLitres).toString()).toBe("1000");

    // Valuing the whole 1000 L at either single rate is wrong by hundreds.
    const flatAtOldRate = computeNozzleSale({ openingReading: "125000", closingReading: "126000", rate: first.rate });
    expect(before.saleAmount.plus(after.saleAmount).minus(flatAtOldRate.saleAmount).toString()).toBe("468");
  });

  it("handles three segments when the price moves twice", () => {
    const segments = splitShiftIntoRateSegments(shiftStart, shiftEnd, [
      { effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: at("2026-03-15T02:00:00.000Z"), rate: "104.10" },
      { effectiveFrom: at("2026-03-15T06:00:00.000Z"), rate: "103.50" },
    ]);
    expect(segments.map((segment) => segment.rate.toFixed(2))).toEqual(["102.93", "104.10", "103.50"]);
  });

  it("ignores price changes outside the shift window", () => {
    const segments = splitShiftIntoRateSegments(shiftStart, shiftEnd, [
      { effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: at("2026-03-15T12:00:00.000Z"), rate: "109.00" },
    ]);
    expect(segments).toHaveLength(1);
  });

  it("treats a change exactly at shift start as the opening rate, not a new segment", () => {
    const segments = splitShiftIntoRateSegments(shiftStart, shiftEnd, [
      { effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: shiftStart, rate: "104.10" },
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0].rate.toFixed(2)).toBe("104.10");
  });

  it("sorts unordered price history before splitting", () => {
    const segments = splitShiftIntoRateSegments(shiftStart, shiftEnd, [
      { effectiveFrom: at("2026-03-15T06:00:00.000Z"), rate: "103.50" },
      { effectiveFrom: at("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: at("2026-03-15T02:00:00.000Z"), rate: "104.10" },
    ]);
    expect(segments.map((segment) => segment.rate.toFixed(2))).toEqual(["102.93", "104.10", "103.50"]);
  });

  it("refuses to price a shift with no rate in force at its start", () => {
    expect(() => splitShiftIntoRateSegments(shiftStart, shiftEnd, [{ effectiveFrom: at("2026-04-01T00:00:00.000Z"), rate: "102.93" }])).toThrow(
      /No price is in force/,
    );
  });
});

// ---------------------------------------------------------------------------

describe("cash denomination grid", () => {
  it("totals notes and loose coins", () => {
    expect(denominationTotal({ "500": 12, "200": 4, "100": 9, "50": 3, "20": 5, "10": 11 }, "37.50").toString()).toBe("8097.5");
  });

  it("treats a blank count as zero", () => {
    expect(denominationTotal({ "500": 2, "200": "" }).toString()).toBe("1000");
  });

  it("rejects a fractional note count", () => {
    expect(() => denominationTotal({ "500": 2.5 })).toThrow(/whole number of notes/);
  });

  it("rejects a negative note count", () => {
    expect(() => denominationTotal({ "500": -1 })).toThrow(/whole number of notes/);
  });
});

describe("short / excess", () => {
  const base = { nozzleSaleAmount: "100000", counterSaleAmount: "5000", card: "20000", upi: "15000", wallet: "5000", credit: "25000", ownUse: "2000" };

  it("balances exactly when the salesman accounts for every rupee", () => {
    const result = computeSettlement({ ...base, cash: "38000" });
    expect(result.totalSaleValue.toString()).toBe("105000");
    expect(result.totalCollections.toString()).toBe("105000");
    expect(result.shortExcess.toString()).toBe("0");
    expect(result.isShort).toBe(false);
    expect(result.isExcess).toBe(false);
  });

  it("reports a shortfall as a negative number", () => {
    const result = computeSettlement({ ...base, cash: "37500" });
    expect(result.shortExcess.toString()).toBe("-500");
    expect(result.isShort).toBe(true);
  });

  it("reports an excess as a positive number", () => {
    const result = computeSettlement({ ...base, cash: "38250" });
    expect(result.shortExcess.toString()).toBe("250");
    expect(result.isExcess).toBe(true);
  });

  it("counts expenses paid from shift cash as accounted for", () => {
    // 1,200 spent on diesel for the genset: the cash is gone but evidenced.
    const withoutExpense = computeSettlement({ ...base, cash: "36800" });
    const withExpense = computeSettlement({ ...base, cash: "36800", expenses: "1200" });
    expect(withoutExpense.shortExcess.toString()).toBe("-1200");
    expect(withExpense.shortExcess.toString()).toBe("0");
  });

  it("applies the configured tolerance without hiding the number", () => {
    const result = computeSettlement({ ...base, cash: "37985", toleranceAmount: "20" });
    expect(result.shortExcess.toString()).toBe("-15");
    expect(result.withinTolerance).toBe(true);
    // Within tolerance still records the amount — it never silently disappears.
    expect(result.shortExcess.isZero()).toBe(false);
  });

  it("puts a difference beyond tolerance outside the tolerance band", () => {
    expect(computeSettlement({ ...base, cash: "37900", toleranceAmount: "20" }).withinTolerance).toBe(false);
  });

  it("keeps paise exact instead of drifting on float arithmetic", () => {
    const result = computeSettlement({ nozzleSaleAmount: "102415.35", cash: "102415.00" });
    expect(result.shortExcess.toString()).toBe("-0.35");
  });

  it("matches the counted denominations against the declared cash", () => {
    const counted = denominationTotal({ "500": 70, "200": 10, "100": 20 }, "0");
    const declared = new Decimal("38000");
    expect(counted.toString()).toBe("39000");
    expect(counted.minus(declared).toString()).toBe("1000");
  });
});

// ---------------------------------------------------------------------------

describe("density and volume correction", () => {
  it("corrects observed density to 15 C", () => {
    // 30 C observed, 15 degrees above reference, 0.65 kg/m3 per degree.
    expect(densityAt15C("730.0", "30").toString()).toBe("739.8");
  });

  it("returns the observed density unchanged at 15 C", () => {
    expect(densityAt15C("735.0", "15").toString()).toBe("735");
  });

  it("corrects downward below 15 C", () => {
    expect(densityAt15C("740.0", "10").toString()).toBe("736.8");
  });

  it("honours a recalibrated coefficient", () => {
    expect(densityAt15C("730.0", "30", "0.70").toString()).toBe("740.5");
  });

  it("shrinks volume above 15 C and expands it below", () => {
    expect(volumeCorrectionFactor("15").toString()).toBe("1");
    expect(volumeCorrectionFactor("35").toString()).toBe("0.979");
    expect(volumeCorrectionFactor("5").toString()).toBe("1.0105");
    expect(correctVolumeTo15C("12000", "35").toString()).toBe("11748");
  });

  it("passes a density inside the band", () => {
    const check = checkDensityAgainstInvoice("737.0", "735.0", "3.0");
    expect(check.deviation.toString()).toBe("2");
    expect(check.withinTolerance).toBe(true);
  });

  it("flags a density above the band", () => {
    const check = checkDensityAgainstInvoice("739.5", "735.0", "3.0");
    expect(check.deviation.toString()).toBe("4.5");
    expect(check.withinTolerance).toBe(false);
  });

  it("flags a density below the band — the adulteration signal", () => {
    const check = checkDensityAgainstInvoice("729.0", "735.0", "3.0");
    expect(check.deviation.toString()).toBe("-6");
    expect(check.withinTolerance).toBe(false);
  });

  it("treats the band edge as acceptable", () => {
    expect(checkDensityAgainstInvoice("738.0", "735.0", "3.0").withinTolerance).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("decantation and receipt loss", () => {
  it("computes decanted quantity, loss and loss percent", () => {
    const result = computeDecantation({ invoiceQty: "12000", dipBeforeLitres: "4200", dipAfterLitres: "16150", allowancePct: "0.20", costPerLitre: "91.80" });
    expect(result.decantedQty.toString()).toBe("11950");
    expect(result.transitLoss.toString()).toBe("50");
    expect(result.lossPct.toString()).toBe("0.4167");
    expect(result.allowedLoss.toString()).toBe("24");
    expect(result.excessLoss.toString()).toBe("26");
    expect(result.withinAllowance).toBe(false);
    expect(result.lossValue.toString()).toBe("4590");
  });

  it("passes a receipt inside the allowance", () => {
    const result = computeDecantation({ invoiceQty: "12000", dipBeforeLitres: "4200", dipAfterLitres: "16180", allowancePct: "0.20" });
    expect(result.transitLoss.toString()).toBe("20");
    expect(result.allowedLoss.toString()).toBe("24");
    expect(result.excessLoss.toString()).toBe("0");
    expect(result.withinAllowance).toBe(true);
  });

  it("reports a gain as a negative loss rather than hiding it", () => {
    const result = computeDecantation({ invoiceQty: "12000", dipBeforeLitres: "4200", dipAfterLitres: "16250", allowancePct: "0.20" });
    expect(result.transitLoss.toString()).toBe("-50");
    expect(result.lossPct.toString()).toBe("-0.4167");
    expect(result.withinAllowance).toBe(true);
  });

  it("rejects a zero invoice quantity instead of dividing by zero", () => {
    expect(() => computeDecantation({ invoiceQty: "0", dipBeforeLitres: "0", dipAfterLitres: "0" })).toThrow(/greater than zero/);
  });
});

// ---------------------------------------------------------------------------

describe("book vs physical reconciliation", () => {
  it("builds book stock from opening, purchases, sales, own use and returns", () => {
    expect(computeBookStock({ openingStock: "8000", purchases: "12000", sales: "9500", ownUse: "150", returns: "50" }).toString()).toBe("10300");
  });

  it("does not double-count nozzle-dispensed own use", () => {
    // Own use through a nozzle is already inside `sales`; only unmetered
    // issues (drum, generator) belong in `ownUse`.
    const metered = computeBookStock({ openingStock: "8000", sales: "9500" });
    const unmetered = computeBookStock({ openingStock: "8000", sales: "9500", ownUse: "150" });
    expect(metered.toString()).toBe("-1500");
    expect(unmetered.minus(metered).toString()).toBe("-150");
  });

  it("reconciles a clean day inside the permissible allowance", () => {
    const result = computeStockVariation({
      openingStock: "8000",
      purchases: "12000",
      sales: "9500",
      physicalStock: "10465",
      allowancePct: "0.50",
      costPerLitre: "91.80",
    });
    expect(result.bookStock.toString()).toBe("10500");
    expect(result.variationLitres.toString()).toBe("-35");
    expect(result.variationPct.toString()).toBe("-0.175");
    expect(result.permissibleLitres.toString()).toBe("47.5");
    expect(result.excessLossLitres.toString()).toBe("0");
    expect(result.withinAllowance).toBe(true);
    expect(result.variationValue.toString()).toBe("-3213");
  });

  it("surfaces an excess loss beyond the allowance — the theft signal", () => {
    const result = computeStockVariation({
      openingStock: "8000",
      purchases: "12000",
      sales: "9500",
      physicalStock: "10300",
      allowancePct: "0.50",
      costPerLitre: "91.80",
    });
    expect(result.variationLitres.toString()).toBe("-200");
    expect(result.permissibleLitres.toString()).toBe("47.5");
    expect(result.excessLossLitres.toString()).toBe("152.5");
    expect(result.excessLossValue.toString()).toBe("13999.5");
    expect(result.withinAllowance).toBe(false);
  });

  it("measures variation % against throughput but the allowance against sales", () => {
    // Deliberately different denominators — 20000 throughput vs 9500 sales.
    const result = computeStockVariation({ openingStock: "8000", purchases: "12000", sales: "9500", physicalStock: "10400", allowancePct: "0.50" });
    expect(result.variationPct.toString()).toBe("-0.5"); // -100 / 20000
    expect(result.permissibleLitres.toString()).toBe("47.5"); // 9500 * 0.5%
  });

  it("treats a gain beyond the allowance as out of limit too", () => {
    const result = computeStockVariation({ openingStock: "8000", purchases: "12000", sales: "9500", physicalStock: "10700", allowancePct: "0.50" });
    expect(result.variationLitres.toString()).toBe("200");
    expect(result.excessLossLitres.toString()).toBe("152.5");
    expect(result.withinAllowance).toBe(false);
  });

  it("uses the tighter MS allowance where it applies", () => {
    const hsd = computeStockVariation({ openingStock: "8000", purchases: "12000", sales: "9500", physicalStock: "10440", allowancePct: "0.50" });
    const ms = computeStockVariation({ openingStock: "8000", purchases: "12000", sales: "9500", physicalStock: "10440", allowancePct: "0.75" });
    expect(hsd.permissibleLitres.toString()).toBe("47.5");
    expect(ms.permissibleLitres.toString()).toBe("71.25");
    expect(hsd.withinAllowance).toBe(false);
    expect(ms.withinAllowance).toBe(true);
  });

  it("values the variation at purchase cost, not selling price", () => {
    const result = computeStockVariation({ openingStock: "8000", purchases: "12000", sales: "9500", physicalStock: "10400", allowancePct: "0.50", costPerLitre: "91.80" });
    expect(result.variationValue.toString()).toBe("-9180"); // 100 L x 91.80 cost
    expect(result.variationValue.toString()).not.toBe("-9424"); // not the 94.24 RSP
  });

  it("does not divide by zero on a tank with no opening and no receipts", () => {
    const result = computeStockVariation({ openingStock: "0", purchases: "0", sales: "0", physicalStock: "0", allowancePct: "0.50" });
    expect(result.variationPct.toString()).toBe("0");
  });

  it("closes the loop from dip chart to variation", () => {
    const chart = [
      { dipMm: new Decimal("0"), litres: new Decimal("0") },
      { dipMm: new Decimal("100"), litres: new Decimal("2500") },
      { dipMm: new Decimal("200"), litres: new Decimal("5100") },
    ];
    const physical = interpolateDip(chart, "150").minus(interpolateDip(chart, "10")); // 3800 - 250
    const result = computeStockVariation({ openingStock: "4000", purchases: "0", sales: "460", physicalStock: physical, allowancePct: "0.50" });
    expect(physical.toString()).toBe("3550");
    expect(result.bookStock.toString()).toBe("3540");
    expect(result.variationLitres.toString()).toBe("10");
  });
});

// ---------------------------------------------------------------------------

describe("fuel bill and shift reconciliation", () => {
  it("removes a rounded cash bill from the aggregate shift without duplicating revenue", () => {
    const result = reconcileBilledShift({
      declaredCash: "103.00",
      billedCash: "103.00",
      nozzleSaleAmount: "102.93",
      billedFuelAmount: "102.93",
      shortExcess: "0.07",
      billedGrandTotal: "103.00",
    });

    expect(result.unbilledCashDebit.toString()).toBe("0");
    expect(result.billedCashShort.toString()).toBe("0");
    expect(result.unbilledNozzleSale.toString()).toBe("0");
    expect(result.adjustedShortExcess.toString()).toBe("0");
  });

  it("credits over-posted bill cash and carries a real shortage to the salesman", () => {
    const result = reconcileBilledShift({
      declaredCash: "100.00",
      billedCash: "103.00",
      nozzleSaleAmount: "102.93",
      billedFuelAmount: "102.93",
      shortExcess: "-2.93",
      billedGrandTotal: "103.00",
    });

    expect(result.unbilledCashDebit.toString()).toBe("0");
    expect(result.billedCashShort.toString()).toBe("3");
    expect(result.adjustedShortExcess.toString()).toBe("-3");
  });

  it("keeps unbilled shift sales and collections as the remainder", () => {
    const result = reconcileBilledShift({
      declaredCash: "2500.00",
      billedCash: "1000.00",
      nozzleSaleAmount: "4000.00",
      billedFuelAmount: "1000.00",
      shortExcess: "0.00",
      billedGrandTotal: "1000.00",
    });

    expect(result.unbilledCashDebit.toString()).toBe("1500");
    expect(result.unbilledNozzleSale.toString()).toBe("3000");
    expect(result.adjustedShortExcess.toString()).toBe("0");
  });

  it("treats a running-short receivable as accounted collection, not salesman shortage", () => {
    const result = reconcileBilledShift({
      declaredCash: "900.00",
      billedCash: "0.00",
      nozzleSaleAmount: "1000.00",
      billedFuelAmount: "0.00",
      runningShortAmount: "100.00",
      shortExcess: "-100.00",
      billedGrandTotal: "0.00",
    });

    expect(result.unbilledCashDebit.toString()).toBe("900");
    expect(result.unbilledNozzleSale.toString()).toBe("900");
    expect(result.adjustedShortExcess.toString()).toBe("0");
  });
});

// ---------------------------------------------------------------------------

describe("advisory flags", () => {
  it("flags a sale above three times the 30-day average", () => {
    expect(flagSaleVariance("3100", "1000")).toBe("SPIKE");
  });

  it("leaves a sale at exactly three times unflagged", () => {
    expect(flagSaleVariance("3000", "1000")).toBeNull();
  });

  it("flags a nozzle that sold nothing when it normally sells", () => {
    expect(flagSaleVariance("0", "1000")).toBe("ZERO_SALE");
  });

  it("stays quiet for a nozzle with no history", () => {
    expect(flagSaleVariance("0", "0")).toBeNull();
  });

  it("honours a reconfigured spike multiple", () => {
    expect(flagSaleVariance("2100", "1000", "2")).toBe("SPIKE");
  });

  it("raises a water dip alert above the threshold", () => {
    expect(isWaterDipAlarming("30", "25")).toBe(true);
    expect(isWaterDipAlarming("25", "25")).toBe(false);
  });
});
