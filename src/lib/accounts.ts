/**
 * Pure double-entry arithmetic. No database, no clock — every rule here is
 * directly testable, and `tests/accounts.test.ts` does exactly that.
 *
 * The one invariant the whole system rests on: for any set of journal lines,
 * Σ debit = Σ credit. Everything else is presentation.
 */
import { Decimal, decimal, round2 } from "@/lib/money";

export type BalanceType = "DEBIT" | "CREDIT";
export type AccountNature = "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "EQUITY";

export class UnbalancedVoucherError extends Error {}

// ---------------------------------------------------------------------------
// 1. Journal lines
// ---------------------------------------------------------------------------

export type JournalLine = { accountId: string; debit?: Decimal.Value; credit?: Decimal.Value; narration?: string; productId?: string; employeeId?: string; quantity?: Decimal.Value };

export type BalancedTotals = { totalDebit: Decimal; totalCredit: Decimal };

/**
 * Validates a set of lines and returns the totals. Throws rather than
 * returning a flag: an unbalanced voucher must never reach the database, and
 * a caller that forgets to check a boolean would let it through.
 *
 * Rules:
 *  - at least two lines
 *  - no negative amounts (a negative debit is a credit; say so)
 *  - a line is a debit or a credit, never both
 *  - no empty lines
 *  - debits equal credits, compared at 2 dp
 */
export function assertBalanced(lines: JournalLine[]): BalancedTotals {
  if (lines.length < 2) throw new UnbalancedVoucherError("A voucher needs at least two lines");

  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (const [index, line] of lines.entries()) {
    const debit = decimal(line.debit ?? 0);
    const credit = decimal(line.credit ?? 0);
    const position = index + 1;
    if (debit.lt(0) || credit.lt(0)) throw new UnbalancedVoucherError(`Line ${position} carries a negative amount. Put it on the other side instead.`);
    if (debit.gt(0) && credit.gt(0)) throw new UnbalancedVoucherError(`Line ${position} is both a debit and a credit`);
    if (debit.isZero() && credit.isZero()) throw new UnbalancedVoucherError(`Line ${position} has no amount`);
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  if (!totalDebit.eq(totalCredit)) {
    const difference = round2(totalDebit.minus(totalCredit));
    throw new UnbalancedVoucherError(
      `Debit ₹${totalDebit.toFixed(2)} does not equal credit ₹${totalCredit.toFixed(2)} — out by ₹${difference.toFixed(2)}`,
    );
  }
  return { totalDebit, totalCredit };
}

/** Drops zero-value lines before balancing, so optional legs can be built inline. */
export const compactLines = (lines: (JournalLine | null | undefined)[]): JournalLine[] =>
  lines.filter((line): line is JournalLine => {
    if (!line) return false;
    return !decimal(line.debit ?? 0).isZero() || !decimal(line.credit ?? 0).isZero();
  });

/** Reverses a set of lines — every debit becomes a credit and vice versa. */
export const reverseLines = (lines: JournalLine[], narration?: string): JournalLine[] =>
  lines.map((line) => ({
    accountId: line.accountId,
    debit: line.credit ?? 0,
    credit: line.debit ?? 0,
    productId: line.productId,
    employeeId: line.employeeId,
    quantity: line.quantity,
    narration: narration ?? line.narration,
  }));

// ---------------------------------------------------------------------------
// 2. Balances
// ---------------------------------------------------------------------------

export type LineTotals = { debit: Decimal.Value; credit: Decimal.Value };

/**
 * Signed balance in the account's own natural direction: positive means the
 * account holds what it is supposed to hold. A debtor with a positive balance
 * owes money; a creditor with a positive balance is owed money.
 */
export function naturalBalance(totals: LineTotals, normalBalance: BalanceType): Decimal {
  const debit = decimal(totals.debit);
  const credit = decimal(totals.credit);
  return round2(normalBalance === "DEBIT" ? debit.minus(credit) : credit.minus(debit));
}

/** Splits a net movement into the Dr / Cr columns a trial balance prints. */
export function toTrialBalanceColumns(totals: LineTotals): { debit: Decimal; credit: Decimal } {
  const net = round2(decimal(totals.debit).minus(decimal(totals.credit)));
  return net.gte(0) ? { debit: net, credit: new Decimal(0) } : { debit: new Decimal(0), credit: net.abs() };
}

/** An opening balance expressed as the journal line that would create it. */
export function openingBalanceLine(accountId: string, amount: Decimal.Value, type: BalanceType, narration = "Opening balance"): JournalLine | null {
  const value = round2(amount);
  if (value.isZero()) return null;
  // A negative opening balance is simply one on the other side.
  const onDebit = (type === "DEBIT") === value.gt(0);
  return onDebit ? { accountId, debit: value.abs(), narration } : { accountId, credit: value.abs(), narration };
}

// ---------------------------------------------------------------------------
// 3. Profit & loss
// ---------------------------------------------------------------------------

export type ProfitInput = {
  revenue: Decimal.Value;
  otherIncome?: Decimal.Value;
  /** Cost of goods sold — the direct cost that makes gross profit meaningful. */
  directCost: Decimal.Value;
  operatingExpense?: Decimal.Value;
  employeeCost?: Decimal.Value;
  financeCost?: Decimal.Value;
  depreciation?: Decimal.Value;
};

export type ProfitResult = {
  revenue: Decimal;
  directCost: Decimal;
  grossProfit: Decimal;
  grossMarginPct: Decimal;
  totalExpense: Decimal;
  netProfit: Decimal;
  netMarginPct: Decimal;
};

export function computeProfit(input: ProfitInput): ProfitResult {
  const revenue = round2(input.revenue);
  const directCost = round2(input.directCost);
  const grossProfit = round2(revenue.minus(directCost));
  const totalExpense = round2(
    decimal(input.operatingExpense ?? 0)
      .plus(decimal(input.employeeCost ?? 0))
      .plus(decimal(input.financeCost ?? 0))
      .plus(decimal(input.depreciation ?? 0)),
  );
  const netProfit = round2(grossProfit.plus(decimal(input.otherIncome ?? 0)).minus(totalExpense));
  const pct = (value: Decimal) => (revenue.isZero() ? new Decimal(0) : value.div(revenue).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  return { revenue, directCost, grossProfit, grossMarginPct: pct(grossProfit), totalExpense, netProfit, netMarginPct: pct(netProfit) };
}

/** Gross profit per litre — the number a fuel dealer actually watches. */
export function marginPerLitre(grossProfit: Decimal.Value, litres: Decimal.Value): Decimal {
  const quantity = decimal(litres);
  if (quantity.isZero()) return new Decimal(0);
  return decimal(grossProfit).div(quantity).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// 4. Ageing
// ---------------------------------------------------------------------------

/** Phase 5 buckets, in days. The last bucket is open-ended. */
export const AGEING_BUCKETS = [15, 30, 45, 60, 90] as const;
export const AGEING_LABELS = ["0-15", "16-30", "31-45", "46-60", "61-90", "90+"] as const;
export type AgeingLabel = (typeof AGEING_LABELS)[number];

/**
 * Places an invoice in its bucket by days overdue past the due date.
 * Not yet due (`daysOverdue <= 0`) still belongs in `0-15`: it is outstanding,
 * merely current — dropping it would understate the debtor total.
 */
export function ageingBucket(daysOverdue: number, buckets: readonly number[] = AGEING_BUCKETS): AgeingLabel {
  for (const [index, edge] of buckets.entries()) {
    if (daysOverdue <= edge) return AGEING_LABELS[index];
  }
  return AGEING_LABELS[AGEING_LABELS.length - 1];
}

export const daysBetween = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / 86_400_000);

export type AgeingRow = { dueDate: Date; amount: Decimal.Value };

export function summariseAgeing(rows: AgeingRow[], asOf: Date, buckets: readonly number[] = AGEING_BUCKETS): Record<AgeingLabel, Decimal> & { total: Decimal } {
  const totals = Object.fromEntries(AGEING_LABELS.map((label) => [label, new Decimal(0)])) as Record<AgeingLabel, Decimal>;
  let total = new Decimal(0);
  for (const row of rows) {
    const amount = decimal(row.amount);
    if (amount.isZero()) continue;
    const bucket = ageingBucket(daysBetween(row.dueDate, asOf), buckets);
    totals[bucket] = totals[bucket].plus(amount);
    total = total.plus(amount);
  }
  for (const label of AGEING_LABELS) totals[label] = round2(totals[label]);
  return { ...totals, total: round2(total) };
}

// ---------------------------------------------------------------------------
// 5. Credit control
// ---------------------------------------------------------------------------

export type CreditExposure = { outstanding: Decimal; creditLimit: Decimal; availableLimit: Decimal; utilisationPct: Decimal; overdue: Decimal };

export function creditExposure(outstanding: Decimal.Value, creditLimit: Decimal.Value, overdue: Decimal.Value = 0): CreditExposure {
  const used = round2(outstanding);
  const limit = round2(creditLimit);
  return {
    outstanding: used,
    creditLimit: limit,
    // An unlimited account (limit 0) shows no headroom rather than a fake one.
    availableLimit: limit.isZero() ? new Decimal(0) : round2(limit.minus(used)),
    utilisationPct: limit.isZero() ? new Decimal(0) : used.div(limit).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    overdue: round2(overdue),
  };
}

// ---------------------------------------------------------------------------
// 6. Bank reconciliation
// ---------------------------------------------------------------------------

export type ReconciliationInput = {
  /** Closing balance per the ledger. */
  bookBalance: Decimal.Value;
  /** Ledger debits (money in) not yet on the statement. */
  unclearedReceipts: Decimal.Value;
  /** Ledger credits (money out) not yet on the statement. */
  unclearedPayments: Decimal.Value;
};

export type ReconciliationResult = { bookBalance: Decimal; unclearedReceipts: Decimal; unclearedPayments: Decimal; reconciledBalance: Decimal; difference: Decimal };

/**
 * Book balance adjusted for items the bank has not yet processed:
 *
 *   reconciled = book − deposits not yet credited + cheques not yet presented
 *
 * A deposit we have recorded but the bank has not is money the bank does not
 * show yet, so it comes off; a cheque we have issued but nobody has banked is
 * money the bank still shows, so it goes back on.
 */
export function reconcileBank(input: ReconciliationInput, statementBalance?: Decimal.Value): ReconciliationResult {
  const bookBalance = round2(input.bookBalance);
  const unclearedReceipts = round2(input.unclearedReceipts);
  const unclearedPayments = round2(input.unclearedPayments);
  const reconciledBalance = round2(bookBalance.minus(unclearedReceipts).plus(unclearedPayments));
  return {
    bookBalance,
    unclearedReceipts,
    unclearedPayments,
    reconciledBalance,
    difference: statementBalance === undefined ? new Decimal(0) : round2(decimal(statementBalance).minus(reconciledBalance)),
  };
}

// ---------------------------------------------------------------------------
// 7. Cash flow
// ---------------------------------------------------------------------------

export type CashFlowInput = { opening: Decimal.Value; operating: Decimal.Value; investing: Decimal.Value; financing: Decimal.Value };
export type CashFlowResult = { opening: Decimal; operating: Decimal; investing: Decimal; financing: Decimal; netChange: Decimal; closing: Decimal };

export function computeCashFlow(input: CashFlowInput): CashFlowResult {
  const opening = round2(input.opening);
  const operating = round2(input.operating);
  const investing = round2(input.investing);
  const financing = round2(input.financing);
  const netChange = round2(operating.plus(investing).plus(financing));
  return { opening, operating, investing, financing, netChange, closing: round2(opening.plus(netChange)) };
}
