import { describe, expect, it } from "vitest";
import { Decimal } from "../src/lib/money";
import {
  AGEING_LABELS,
  UnbalancedVoucherError,
  ageingBucket,
  assertBalanced,
  compactLines,
  computeCashFlow,
  computeProfit,
  creditExposure,
  daysBetween,
  marginPerLitre,
  naturalBalance,
  openingBalanceLine,
  reconcileBank,
  reverseLines,
  summariseAgeing,
  toTrialBalanceColumns,
} from "../src/lib/accounts";
import { businessDateFromInput, businessDateToInput } from "../src/lib/date";

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ---------------------------------------------------------------------------

describe("double-entry validation", () => {
  it("accepts a balanced two-line voucher", () => {
    const totals = assertBalanced([
      { accountId: "cash", debit: "24500.00" },
      { accountId: "customer", credit: "24500.00" },
    ]);
    expect(totals.totalDebit.toFixed(2)).toBe("24500.00");
    expect(totals.totalCredit.toFixed(2)).toBe("24500.00");
  });

  it("accepts a many-legged voucher that still balances", () => {
    const totals = assertBalanced([
      { accountId: "cash", debit: "38000" },
      { accountId: "card", debit: "20000" },
      { accountId: "credit", debit: "25000" },
      { accountId: "sales", credit: "80000" },
      { accountId: "counter", credit: "3000" },
    ]);
    expect(totals.totalDebit.toFixed(2)).toBe("83000.00");
  });

  it("rejects a voucher that is out by a single paisa", () => {
    expect(() =>
      assertBalanced([
        { accountId: "cash", debit: "100.00" },
        { accountId: "sales", credit: "100.01" },
      ]),
    ).toThrow(UnbalancedVoucherError);
  });

  it("names the amount it is out by, so the entry can be corrected", () => {
    expect(() =>
      assertBalanced([
        { accountId: "cash", debit: "100.00" },
        { accountId: "sales", credit: "90.00" },
      ]),
    ).toThrow(/out by ₹10.00/);
  });

  it("rejects a single-line voucher", () => {
    expect(() => assertBalanced([{ accountId: "cash", debit: "100" }])).toThrow(/at least two lines/);
  });

  it("rejects a line that is both a debit and a credit", () => {
    expect(() =>
      assertBalanced([
        { accountId: "cash", debit: "100", credit: "100" },
        { accountId: "sales", credit: "100" },
      ]),
    ).toThrow(/both a debit and a credit/);
  });

  it("rejects a negative amount rather than silently flipping the side", () => {
    expect(() =>
      assertBalanced([
        { accountId: "cash", debit: "-100" },
        { accountId: "sales", credit: "-100" },
      ]),
    ).toThrow(/negative amount/);
  });

  it("rejects an empty line", () => {
    expect(() =>
      assertBalanced([
        { accountId: "cash", debit: "100" },
        { accountId: "sales", credit: "100" },
        { accountId: "stray" },
      ]),
    ).toThrow(/has no amount/);
  });

  it("keeps paise exact across many lines instead of drifting", () => {
    // 0.1 + 0.2 in float is 0.30000000000000004; in Decimal it is 0.30.
    const totals = assertBalanced([
      { accountId: "a", debit: "0.10" },
      { accountId: "b", debit: "0.20" },
      { accountId: "c", credit: "0.30" },
    ]);
    expect(totals.totalDebit.toFixed(2)).toBe("0.30");
  });

  it("drops zero-value legs before balancing, so optional lines can be inlined", () => {
    const lines = compactLines([
      { accountId: "cash", debit: "100" },
      { accountId: "tcs", debit: "0" },
      null,
      undefined,
      { accountId: "sales", credit: "100" },
    ]);
    expect(lines).toHaveLength(2);
    expect(() => assertBalanced(lines)).not.toThrow();
  });
});

describe("reversal", () => {
  it("turns every debit into a credit and back", () => {
    const reversed = reverseLines([
      { accountId: "customer", debit: "24500" },
      { accountId: "sales", credit: "24500", productId: "ms", quantity: "240" },
    ]);
    expect(reversed[0]).toMatchObject({ accountId: "customer", credit: "24500" });
    expect(reversed[1]).toMatchObject({ accountId: "sales", debit: "24500", productId: "ms", quantity: "240" });
  });

  it("produces a voucher that still balances", () => {
    const original = [
      { accountId: "stock", debit: "1000" },
      { accountId: "loss", debit: "50" },
      { accountId: "supplier", credit: "1050" },
    ];
    expect(() => assertBalanced(reverseLines(original))).not.toThrow();
  });

  it("nets to nothing when applied to the original", () => {
    const original = [
      { accountId: "cash", debit: "500" },
      { accountId: "sales", credit: "500" },
    ];
    const both = [...original, ...reverseLines(original)];
    const totals = assertBalanced(both);
    // Each account now carries an equal debit and credit: the effect is gone.
    expect(totals.totalDebit.toFixed(2)).toBe("1000.00");
    expect(totals.totalDebit.eq(totals.totalCredit)).toBe(true);
  });
});

describe("balances", () => {
  it("reads a debtor's balance in its natural direction", () => {
    expect(naturalBalance({ debit: "50000", credit: "12000" }, "DEBIT").toFixed(2)).toBe("38000.00");
  });

  it("reads a creditor's balance in its natural direction", () => {
    expect(naturalBalance({ debit: "12000", credit: "50000" }, "CREDIT").toFixed(2)).toBe("38000.00");
  });

  it("shows a debtor in credit as a negative natural balance", () => {
    expect(naturalBalance({ debit: "1000", credit: "1500" }, "DEBIT").toFixed(2)).toBe("-500.00");
  });

  it("puts a net debit in the debit column of a trial balance", () => {
    const columns = toTrialBalanceColumns({ debit: "5000", credit: "2000" });
    expect(columns.debit.toFixed(2)).toBe("3000.00");
    expect(columns.credit.toFixed(2)).toBe("0.00");
  });

  it("puts a net credit in the credit column", () => {
    const columns = toTrialBalanceColumns({ debit: "2000", credit: "5000" });
    expect(columns.debit.toFixed(2)).toBe("0.00");
    expect(columns.credit.toFixed(2)).toBe("3000.00");
  });

  it("builds an opening balance as the journal line that would create it", () => {
    expect(openingBalanceLine("cash", "5000", "DEBIT")).toMatchObject({ accountId: "cash", debit: expect.anything() });
    expect(openingBalanceLine("capital", "5000", "CREDIT")).toMatchObject({ accountId: "capital", credit: expect.anything() });
  });

  it("puts a negative opening balance on the other side", () => {
    const line = openingBalanceLine("cash", "-500", "DEBIT");
    expect(line?.credit?.toString()).toBe("500");
  });

  it("emits no line for a zero opening balance", () => {
    expect(openingBalanceLine("cash", "0", "DEBIT")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("profit", () => {
  it("separates gross profit from net profit", () => {
    const result = computeProfit({ revenue: "4300000", directCost: "4070000", operatingExpense: "120000", otherIncome: "5000" });
    expect(result.grossProfit.toFixed(2)).toBe("230000.00");
    expect(result.netProfit.toFixed(2)).toBe("115000.00");
  });

  it("computes gross margin against revenue", () => {
    expect(computeProfit({ revenue: "1000", directCost: "900" }).grossMarginPct.toFixed(2)).toBe("10.00");
  });

  it("does not divide by zero when there is no revenue", () => {
    const result = computeProfit({ revenue: "0", directCost: "0" });
    expect(result.grossMarginPct.toFixed(2)).toBe("0.00");
    expect(result.netMarginPct.toFixed(2)).toBe("0.00");
  });

  it("reports a loss as a negative net profit", () => {
    expect(computeProfit({ revenue: "1000", directCost: "900", operatingExpense: "400" }).netProfit.toFixed(2)).toBe("-300.00");
  });

  it("computes margin per litre to four decimals — thin fuel margins need them", () => {
    expect(marginPerLitre("1556431.50", "427064.83").toFixed(4)).toBe("3.6445");
  });

  it("returns zero margin per litre when nothing was sold", () => {
    expect(marginPerLitre("100", "0").toFixed(4)).toBe("0.0000");
  });

  it("excludes stock losses from gross profit so margin per litre is honest", () => {
    // Same revenue and COGS; the loss belongs below gross profit.
    const withLossInCogs = computeProfit({ revenue: "1000", directCost: "900" });
    const withLossBelow = computeProfit({ revenue: "1000", directCost: "900", operatingExpense: "40" });
    expect(withLossInCogs.grossProfit.toFixed(2)).toBe(withLossBelow.grossProfit.toFixed(2));
    expect(withLossBelow.netProfit.toFixed(2)).toBe("60.00");
  });
});

// ---------------------------------------------------------------------------

describe("ageing buckets", () => {
  it("uses the Phase 5 boundaries", () => {
    expect(AGEING_LABELS).toEqual(["0-15", "16-30", "31-45", "46-60", "61-90", "90+"]);
  });

  it("places an invoice by days past its due date", () => {
    expect(ageingBucket(0)).toBe("0-15");
    expect(ageingBucket(15)).toBe("0-15");
    expect(ageingBucket(16)).toBe("16-30");
    expect(ageingBucket(31)).toBe("31-45");
    expect(ageingBucket(40)).toBe("31-45");
    expect(ageingBucket(46)).toBe("46-60");
    expect(ageingBucket(61)).toBe("61-90");
    expect(ageingBucket(91)).toBe("90+");
  });

  it("keeps a not-yet-due invoice in the first bucket rather than dropping it", () => {
    // Dropping it would understate the debtor total against the ledger.
    expect(ageingBucket(-10)).toBe("0-15");
  });

  it("treats each boundary as belonging to the lower bucket", () => {
    expect(ageingBucket(30)).toBe("16-30");
    expect(ageingBucket(45)).toBe("31-45");
    expect(ageingBucket(60)).toBe("46-60");
    expect(ageingBucket(90)).toBe("61-90");
  });

  it("sums a customer's invoices into buckets that total the outstanding", () => {
    const asOn = at("2026-09-20");
    const summary = summariseAgeing(
      [
        { dueDate: at("2026-09-15"), amount: "1000" },
        { dueDate: at("2026-08-25"), amount: "2000" },
        { dueDate: at("2026-08-05"), amount: "3000" },
        { dueDate: at("2026-05-01"), amount: "4000" },
      ],
      asOn,
    );
    expect(summary["0-15"].toFixed(2)).toBe("1000.00");
    expect(summary["16-30"].toFixed(2)).toBe("2000.00");
    expect(summary["46-60"].toFixed(2)).toBe("3000.00");
    expect(summary["90+"].toFixed(2)).toBe("4000.00");
    expect(summary.total.toFixed(2)).toBe("10000.00");
  });

  it("counts whole days between two dates", () => {
    expect(daysBetween(at("2026-08-11"), at("2026-09-20"))).toBe(40);
  });
});

describe("credit exposure", () => {
  it("computes headroom and utilisation", () => {
    const exposure = creditExposure("38000", "50000", "12000");
    expect(exposure.availableLimit.toFixed(2)).toBe("12000.00");
    expect(exposure.utilisationPct.toFixed(2)).toBe("76.00");
    expect(exposure.overdue.toFixed(2)).toBe("12000.00");
  });

  it("shows a negative headroom when the limit is breached", () => {
    expect(creditExposure("60000", "50000").availableLimit.toFixed(2)).toBe("-10000.00");
  });

  it("does not invent headroom for an account with no limit", () => {
    const exposure = creditExposure("38000", "0");
    expect(exposure.availableLimit.toFixed(2)).toBe("0.00");
    expect(exposure.utilisationPct.toFixed(2)).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------

describe("bank reconciliation", () => {
  it("deducts uncredited receipts and adds unpresented payments", () => {
    const result = reconcileBank({ bookBalance: "100000", unclearedReceipts: "15000", unclearedPayments: "8000" });
    expect(result.reconciledBalance.toFixed(2)).toBe("93000.00");
  });

  it("matches the book balance when everything has cleared", () => {
    expect(reconcileBank({ bookBalance: "100000", unclearedReceipts: "0", unclearedPayments: "0" }).reconciledBalance.toFixed(2)).toBe("100000.00");
  });

  it("reports the difference against a statement balance", () => {
    const result = reconcileBank({ bookBalance: "100000", unclearedReceipts: "15000", unclearedPayments: "8000" }, "93000");
    expect(result.difference.toFixed(2)).toBe("0.00");
  });

  it("surfaces a mismatch against the statement rather than hiding it", () => {
    const result = reconcileBank({ bookBalance: "100000", unclearedReceipts: "15000", unclearedPayments: "8000" }, "92500");
    expect(result.difference.toFixed(2)).toBe("-500.00");
  });
});

describe("cash flow", () => {
  it("adds the three activities to the opening balance", () => {
    const result = computeCashFlow({ opening: "500000", operating: "250000", investing: "-80000", financing: "-40000" });
    expect(result.netChange.toFixed(2)).toBe("130000.00");
    expect(result.closing.toFixed(2)).toBe("630000.00");
  });

  it("handles a net outflow", () => {
    expect(computeCashFlow({ opening: "100000", operating: "-60000", investing: "-20000", financing: "0" }).closing.toFixed(2)).toBe("20000.00");
  });
});

// ---------------------------------------------------------------------------

describe("business dates align with @db.Date columns", () => {
  // A business date is a calendar day. Building it with a timezone conversion
  // yields 18:30 UTC of the previous day, which makes every `lte` range filter
  // silently drop the final day and writes dated rows one day early.
  it("is UTC midnight of the calendar day", () => {
    expect(businessDateFromInput("2026-09-20").toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("compares equal to a date read back from the database", () => {
    const fromDatabase = new Date("2026-09-20T00:00:00.000Z");
    expect(fromDatabase <= businessDateFromInput("2026-09-20")).toBe(true);
    expect(fromDatabase >= businessDateFromInput("2026-09-20")).toBe(true);
  });

  it("includes the final day of an inclusive range", () => {
    const lastDay = new Date("2026-09-20T00:00:00.000Z");
    expect(lastDay <= businessDateFromInput("2026-09-20")).toBe(true);
  });

  it("round-trips through the date-input format", () => {
    expect(businessDateToInput(businessDateFromInput("2026-04-01"))).toBe("2026-04-01");
  });

  it("does not shift a date across the month boundary", () => {
    expect(businessDateToInput(businessDateFromInput("2026-04-01"))).not.toBe("2026-03-31");
  });
});

// ---------------------------------------------------------------------------

describe("a credit sale through to settlement", () => {
  it("raises the debtor, ages correctly, and is cleared exactly by a receipt", () => {
    const amount = new Decimal("24500.00");

    const sale = assertBalanced([
      { accountId: "customer", debit: amount },
      { accountId: "sales", credit: amount },
    ]);
    expect(sale.totalDebit.eq(amount)).toBe(true);

    // The customer owes it, and it is 40 days past due.
    const outstanding = naturalBalance({ debit: amount, credit: 0 }, "DEBIT");
    expect(outstanding.toFixed(2)).toBe("24500.00");
    expect(ageingBucket(daysBetween(at("2026-08-11"), at("2026-09-20")))).toBe("31-45");

    // A receipt for the same amount clears it exactly.
    assertBalanced([
      { accountId: "cash", debit: amount },
      { accountId: "customer", credit: amount },
    ]);
    const cleared = naturalBalance({ debit: amount, credit: amount }, "DEBIT");
    expect(cleared.toFixed(2)).toBe("0.00");
  });
});
