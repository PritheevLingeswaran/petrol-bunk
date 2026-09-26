import type { CashFlowCategory, ScheduleIIIHead } from "@prisma/client";
import { Decimal, round2 } from "@/lib/money";
import { businessDateFromInput, businessDateToday } from "@/lib/date";
import {
  AGEING_LABELS,
  ageingBucket,
  computeCashFlow,
  computeProfit,
  creditExposure,
  daysBetween,
  marginPerLitre,
  naturalBalance,
  reconcileBank,
  toTrialBalanceColumns,
  type AgeingLabel,
} from "@/lib/accounts";
import { getOutletScope, requirePermission } from "@/server/guard";
import { db } from "@/server/db";

export type DateRange = { from: string; to: string };
export type Option = { value: string; label: string };

const dec = (value: { toString(): string } | null | undefined): Decimal => new Decimal(value?.toString() ?? "0");
const iso = (value: Date | null | undefined): string => (value ? value.toISOString().slice(0, 10) : "");
const f2 = (value: Decimal): string => value.toFixed(2);

export const defaultRange = (): DateRange => {
  const today = businessDateToday();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { from: iso(from), to: iso(today) };
};

/** Financial year to date, which is what most of these reports default to. */
export const financialYearRange = (asOn = businessDateToday(), startMonth = 4): DateRange => {
  const year = asOn.getUTCMonth() + 1 >= startMonth ? asOn.getUTCFullYear() : asOn.getUTCFullYear() - 1;
  return { from: iso(new Date(Date.UTC(year, startMonth - 1, 1))), to: iso(asOn) };
};

/** The period of equal length immediately before this one. */
export function previousPeriod(range: DateRange): DateRange {
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);
  const span = Math.max(1, daysBetween(from, to) + 1);
  const previousTo = new Date(from.getTime() - 86_400_000);
  return { from: iso(new Date(previousTo.getTime() - (span - 1) * 86_400_000)), to: iso(previousTo) };
}

/**
 * Outlet scope for a report. Defaults to the signed-in user's outlet; an
 * explicit list lets the verification harness call the same functions.
 */
export type ReportScope = string[] | undefined;

async function scope(override?: ReportScope) {
  if (override && override.length > 0) return { outletIds: override, outletId: override[0] };
  await requirePermission("ACCOUNTS", "view");
  const current = await getOutletScope();
  return { outletIds: current.outletIds, outletId: current.outletIds[0] };
}

const postedLine = (outletIds: string[]) => ({ outletId: { in: outletIds }, voucher: { status: "POSTED" as const } });

// ===========================================================================
// Chart of accounts
// ===========================================================================

export type AccountOption = Option & { code: string; groupId: string; groupName: string; isBank: boolean; nature: string };

export async function getAccountOptions(only?: ReportScope): Promise<AccountOption[]> {
  const { outletIds } = await scope(only);
  const rows = await db.account.findMany({
    where: { outletId: { in: outletIds }, isActive: true },
    include: { group: { select: { id: true, name: true } } },
    orderBy: [{ group: { sortOrder: "asc" } }, { code: "asc" }],
  });
  return rows.map((row) => ({
    value: row.id,
    label: `${row.code} · ${row.name}`,
    code: row.code,
    groupId: row.groupId,
    groupName: row.group.name,
    isBank: row.isBankAccount,
    nature: row.nature,
  }));
}

// ===========================================================================
// 2. Ledger — any account, any period, with a running balance
// ===========================================================================

export type LedgerEntry = {
  id: string;
  date: string;
  voucherId: string;
  docNumber: string;
  type: string;
  narration: string;
  particulars: string;
  instrument: string;
  debit: string;
  credit: string;
  runningBalance: string;
  /** Where "drill through" goes. */
  sourceKind: "bill" | "purchase" | "receipt" | "payment" | "shift" | "voucher";
  sourceId: string;
};

export type LedgerReport = {
  account: { id: string; code: string; name: string; nature: string; normalBalance: string; groupName: string };
  range: DateRange;
  openingBalance: string;
  openingSide: "Dr" | "Cr";
  closingBalance: string;
  closingSide: "Dr" | "Cr";
  totalDebit: string;
  totalCredit: string;
  entries: LedgerEntry[];
};

export async function getLedger(accountId: string, range: DateRange, only?: ReportScope): Promise<LedgerReport | null> {
  const { outletIds } = await scope(only);
  const account = await db.account.findFirst({ where: { id: accountId, outletId: { in: outletIds } }, include: { group: true } });
  if (!account) return null;

  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);

  const openingTotals = await db.voucherLine.aggregate({
    where: { ...postedLine(outletIds), accountId, businessDate: { lt: from } },
    _sum: { debit: true, credit: true },
  });
  let running = round2(dec(openingTotals._sum.debit).minus(dec(openingTotals._sum.credit)));
  const openingBalance = running;

  const lines = await db.voucherLine.findMany({
    where: { ...postedLine(outletIds), accountId, businessDate: { gte: from, lte: to } },
    include: {
      voucher: {
        select: {
          id: true, docNumber: true, type: true, narration: true, instrumentType: true, instrumentNo: true, instrumentDate: true,
          billId: true, purchaseId: true, receiptId: true, paymentId: true, shiftEntryId: true,
          lines: { select: { accountId: true, debit: true, credit: true, account: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ businessDate: "asc" }, { voucher: { docNumber: "asc" } }, { lineNo: "asc" }],
  });

  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);
  const entries: LedgerEntry[] = lines.map((line) => {
    const debit = dec(line.debit);
    const credit = dec(line.credit);
    running = round2(running.plus(debit).minus(credit));
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);

    // "Particulars" is the other side of the entry, the way a ledger reads.
    const counterparts = line.voucher.lines
      .filter((other) => other.accountId !== accountId && (debit.gt(0) ? dec(other.credit).gt(0) : dec(other.debit).gt(0)))
      .map((other) => other.account.name);
    const unique = [...new Set(counterparts)];

    const voucher = line.voucher;
    const sourceKind: LedgerEntry["sourceKind"] = voucher.billId ? "bill" : voucher.purchaseId ? "purchase" : voucher.receiptId ? "receipt" : voucher.paymentId ? "payment" : voucher.shiftEntryId ? "shift" : "voucher";
    const sourceId = voucher.billId ?? voucher.purchaseId ?? voucher.receiptId ?? voucher.paymentId ?? voucher.shiftEntryId ?? voucher.id;

    return {
      id: line.id,
      date: iso(line.businessDate),
      voucherId: voucher.id,
      docNumber: voucher.docNumber,
      type: voucher.type,
      narration: line.narration ?? voucher.narration ?? "",
      particulars: unique.length === 0 ? "—" : unique.length <= 2 ? unique.join(", ") : `${unique[0]} and ${unique.length - 1} more`,
      instrument: voucher.instrumentNo ? `${voucher.instrumentType} ${voucher.instrumentNo}${voucher.instrumentDate ? ` · ${iso(voucher.instrumentDate)}` : ""}` : "",
      debit: f2(debit),
      credit: f2(credit),
      runningBalance: f2(running.abs()),
      sourceKind,
      sourceId,
    };
  });

  return {
    account: { id: account.id, code: account.code, name: account.name, nature: account.nature, normalBalance: account.normalBalance, groupName: account.group.name },
    range,
    openingBalance: f2(openingBalance.abs()),
    openingSide: openingBalance.gte(0) ? "Dr" : "Cr",
    closingBalance: f2(running.abs()),
    closingSide: running.gte(0) ? "Dr" : "Cr",
    totalDebit: f2(round2(totalDebit)),
    totalCredit: f2(round2(totalCredit)),
    entries,
  };
}

// ===========================================================================
// 3. Trial balance
// ===========================================================================

export type TrialBalanceAccount = { accountId: string; code: string; name: string; debit: string; credit: string };
export type TrialBalanceGroup = { groupId: string; code: string; name: string; nature: string; debit: string; credit: string; accounts: TrialBalanceAccount[] };
export type TrialBalance = {
  asOn: string;
  groups: TrialBalanceGroup[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  isBalanced: boolean;
  /** Vouchers whose own lines do not balance — the cause, if there ever is one. */
  unbalancedVouchers: { id: string; docNumber: string; date: string; debit: string; credit: string }[];
};

export async function getTrialBalance(asOn: string, only?: ReportScope): Promise<TrialBalance> {
  const { outletIds } = await scope(only);
  const date = businessDateFromInput(asOn);

  const [totals, accounts, unbalanced] = await Promise.all([
    db.voucherLine.groupBy({
      by: ["accountId"],
      where: { ...postedLine(outletIds), businessDate: { lte: date } },
      _sum: { debit: true, credit: true },
    }),
    db.account.findMany({ where: { outletId: { in: outletIds } }, include: { group: true } }),
    // Belt and braces: postVoucher cannot write an unbalanced voucher, but if
    // one ever existed the report must name it rather than quietly absorb it.
    db.$queryRaw<{ id: string; docNumber: string; businessDate: Date; debit: string; credit: string }[]>`
      SELECT v.id, v."docNumber", v."businessDate",
             SUM(l.debit)::text AS debit, SUM(l.credit)::text AS credit
      FROM vouchers v JOIN voucher_lines l ON l."voucherId" = v.id
      WHERE v.status = 'POSTED' AND v."businessDate" <= ${date}
      GROUP BY v.id, v."docNumber", v."businessDate"
      HAVING ROUND(SUM(l.debit), 2) <> ROUND(SUM(l.credit), 2)
      LIMIT 50`,
  ]);

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const groups = new Map<string, TrialBalanceGroup>();
  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (const row of totals) {
    const account = accountById.get(row.accountId);
    if (!account) continue;
    const columns = toTrialBalanceColumns({ debit: dec(row._sum.debit), credit: dec(row._sum.credit) });
    if (columns.debit.isZero() && columns.credit.isZero()) continue;

    const group = groups.get(account.groupId) ?? {
      groupId: account.groupId,
      code: account.group.code,
      name: account.group.name,
      nature: account.group.nature,
      debit: "0",
      credit: "0",
      accounts: [],
    };
    group.accounts.push({ accountId: account.id, code: account.code, name: account.name, debit: f2(columns.debit), credit: f2(columns.credit) });
    group.debit = f2(dec(group.debit).plus(columns.debit));
    group.credit = f2(dec(group.credit).plus(columns.credit));
    groups.set(account.groupId, group);

    totalDebit = totalDebit.plus(columns.debit);
    totalCredit = totalCredit.plus(columns.credit);
  }

  for (const group of groups.values()) group.accounts.sort((left, right) => left.code.localeCompare(right.code));
  const difference = round2(totalDebit.minus(totalCredit));

  return {
    asOn,
    groups: [...groups.values()].sort((left, right) => left.nature.localeCompare(right.nature) || left.code.localeCompare(right.code)),
    totalDebit: f2(round2(totalDebit)),
    totalCredit: f2(round2(totalCredit)),
    difference: f2(difference),
    isBalanced: difference.isZero(),
    unbalancedVouchers: unbalanced.map((row) => ({ id: row.id, docNumber: row.docNumber, date: iso(row.businessDate), debit: row.debit, credit: row.credit })),
  };
}

// ===========================================================================
// 4. Profit & loss
// ===========================================================================

export type ProfitLine = { accountId: string; code: string; name: string; amount: string; previous: string; change: string };
export type ProfitSection = { title: string; lines: ProfitLine[]; total: string; previousTotal: string };
export type ProductMargin = { productId: string; name: string; litres: string; revenue: string; cost: string; grossProfit: string; marginPerLitre: string; marginPct: string };

export type ProfitAndLoss = {
  range: DateRange;
  comparative: DateRange;
  revenue: ProfitSection;
  otherIncome: ProfitSection;
  directCost: ProfitSection;
  expenses: ProfitSection;
  grossProfit: string;
  grossProfitPrevious: string;
  grossMarginPct: string;
  netProfit: string;
  netProfitPrevious: string;
  netMarginPct: string;
  totalLitres: string;
  grossMarginPerLitre: string;
  byProduct: ProductMargin[];
};

type GroupedAmount = Map<string, Decimal>;

async function amountsByAccount(outletIds: string[], range: DateRange): Promise<GroupedAmount> {
  const rows = await db.voucherLine.groupBy({
    by: ["accountId"],
    where: { ...postedLine(outletIds), businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) } },
    _sum: { debit: true, credit: true },
  });
  // Income is naturally a credit, expense a debit; store each in its own
  // direction so a section total is always a positive number.
  return new Map(rows.map((row) => [row.accountId, round2(dec(row._sum.debit).minus(dec(row._sum.credit)))]));
}

export async function getProfitAndLoss(range: DateRange, comparative?: DateRange, only?: ReportScope): Promise<ProfitAndLoss> {
  const { outletIds } = await scope(only);
  const previous = comparative ?? previousPeriod(range);

  const [accounts, current, prior] = await Promise.all([
    db.account.findMany({ where: { outletId: { in: outletIds } }, include: { group: true } }),
    amountsByAccount(outletIds, range),
    amountsByAccount(outletIds, previous),
  ]);

  const buildSection = (title: string, filter: (account: (typeof accounts)[number]) => boolean, sign: 1 | -1): ProfitSection => {
    const lines: ProfitLine[] = [];
    let total = new Decimal(0);
    let previousTotal = new Decimal(0);
    for (const account of accounts.filter(filter)) {
      const amount = round2((current.get(account.id) ?? new Decimal(0)).mul(sign));
      const before = round2((prior.get(account.id) ?? new Decimal(0)).mul(sign));
      if (amount.isZero() && before.isZero()) continue;
      lines.push({ accountId: account.id, code: account.code, name: account.name, amount: f2(amount), previous: f2(before), change: f2(round2(amount.minus(before))) });
      total = total.plus(amount);
      previousTotal = previousTotal.plus(before);
    }
    lines.sort((left, right) => Number(right.amount) - Number(left.amount));
    return { title, lines, total: f2(round2(total)), previousTotal: f2(round2(previousTotal)) };
  };

  const revenue = buildSection("Revenue from operations", (a) => a.nature === "INCOME" && a.group.scheduleIIIHead !== "OTHER_INCOME", -1);
  const otherIncome = buildSection("Other income", (a) => a.nature === "INCOME" && a.group.scheduleIIIHead === "OTHER_INCOME", -1);
  const directCost = buildSection("Direct costs", (a) => a.nature === "EXPENSE" && a.group.isDirectCost, 1);
  const expenses = buildSection("Operating and other expenses", (a) => a.nature === "EXPENSE" && !a.group.isDirectCost, 1);

  const profit = computeProfit({
    revenue: revenue.total,
    otherIncome: otherIncome.total,
    directCost: directCost.total,
    operatingExpense: expenses.total,
  });
  const previousProfit = computeProfit({
    revenue: revenue.previousTotal,
    otherIncome: otherIncome.previousTotal,
    directCost: directCost.previousTotal,
    operatingExpense: expenses.previousTotal,
  });

  // ---- Gross profit per product and per litre, straight from the ledger ----
  const [revenueByProduct, costByProduct, products] = await Promise.all([
    db.voucherLine.groupBy({
      by: ["productId"],
      where: { ...postedLine(outletIds), businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) }, productId: { not: null }, account: { nature: "INCOME" } },
      _sum: { credit: true, debit: true, quantity: true },
    }),
    db.voucherLine.groupBy({
      by: ["productId"],
      where: { ...postedLine(outletIds), businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) }, productId: { not: null }, account: { nature: "EXPENSE", group: { isDirectCost: true } } },
      _sum: { debit: true, credit: true, quantity: true },
    }),
    db.product.findMany({ where: { outletId: { in: outletIds } }, select: { id: true, name: true } }),
  ]);

  const nameById = new Map(products.map((product) => [product.id, product.name]));
  const costById = new Map(costByProduct.map((row) => [row.productId ?? "", round2(dec(row._sum.debit).minus(dec(row._sum.credit)))]));
  const litresById = new Map(revenueByProduct.map((row) => [row.productId ?? "", round2(dec(row._sum.quantity))]));

  let totalLitres = new Decimal(0);
  const byProduct: ProductMargin[] = revenueByProduct
    .map((row) => {
      const productId = row.productId ?? "";
      const income = round2(dec(row._sum.credit).minus(dec(row._sum.debit)));
      const cost = costById.get(productId) ?? new Decimal(0);
      const gross = round2(income.minus(cost));
      const litres = litresById.get(productId) ?? new Decimal(0);
      totalLitres = totalLitres.plus(litres);
      return {
        productId,
        name: nameById.get(productId) ?? "Unallocated",
        litres: f2(litres),
        revenue: f2(income),
        cost: f2(cost),
        grossProfit: f2(gross),
        marginPerLitre: marginPerLitre(gross, litres).toFixed(4),
        marginPct: income.isZero() ? "0.00" : gross.div(income).mul(100).toFixed(2),
      };
    })
    .filter((row) => !(dec(row.revenue).isZero() && dec(row.cost).isZero()))
    .sort((left, right) => Number(right.grossProfit) - Number(left.grossProfit));

  return {
    range,
    comparative: previous,
    revenue,
    otherIncome,
    directCost,
    expenses,
    grossProfit: f2(profit.grossProfit),
    grossProfitPrevious: f2(previousProfit.grossProfit),
    grossMarginPct: f2(profit.grossMarginPct),
    netProfit: f2(profit.netProfit),
    netProfitPrevious: f2(previousProfit.netProfit),
    netMarginPct: f2(profit.netMarginPct),
    totalLitres: f2(round2(totalLitres)),
    grossMarginPerLitre: marginPerLitre(profit.grossProfit, totalLitres).toFixed(4),
    byProduct,
  };
}

// ===========================================================================
// 5. Balance sheet — Schedule III
// ===========================================================================

export type BalanceSheetLine = { accountId: string; code: string; name: string; amount: string };
export type BalanceSheetHead = { head: ScheduleIIIHead; title: string; lines: BalanceSheetLine[]; total: string };
export type BalanceSheet = {
  asOn: string;
  equityAndLiabilities: BalanceSheetHead[];
  assets: BalanceSheetHead[];
  totalEquityAndLiabilities: string;
  totalAssets: string;
  difference: string;
  isBalanced: boolean;
  retainedEarnings: string;
};

const SCHEDULE_TITLES: Partial<Record<ScheduleIIIHead, string>> = {
  SHAREHOLDERS_FUNDS: "Shareholders' funds",
  NON_CURRENT_LIABILITIES: "Non-current liabilities",
  CURRENT_LIABILITIES: "Current liabilities",
  NON_CURRENT_ASSETS: "Non-current assets",
  CURRENT_ASSETS: "Current assets",
};

export async function getBalanceSheet(asOn: string, only?: ReportScope): Promise<BalanceSheet> {
  const { outletIds } = await scope(only);
  const date = businessDateFromInput(asOn);

  const [totals, accounts] = await Promise.all([
    db.voucherLine.groupBy({ by: ["accountId"], where: { ...postedLine(outletIds), businessDate: { lte: date } }, _sum: { debit: true, credit: true } }),
    db.account.findMany({ where: { outletId: { in: outletIds } }, include: { group: true } }),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  const heads = new Map<ScheduleIIIHead, BalanceSheetHead>();
  // Income less expense to date is the profit that has not been distributed;
  // without carrying it into equity the balance sheet cannot balance.
  let retained = new Decimal(0);

  for (const row of totals) {
    const account = accountById.get(row.accountId);
    if (!account) continue;
    const net = round2(dec(row._sum.debit).minus(dec(row._sum.credit)));
    if (net.isZero()) continue;

    if (!account.group.isBalanceSheet) {
      // Expenses are debits and income credits, so this accumulates profit.
      retained = retained.minus(net);
      continue;
    }

    const head = account.group.scheduleIIIHead === "NONE"
      ? account.nature === "ASSET" ? "CURRENT_ASSETS" : account.nature === "EQUITY" ? "SHAREHOLDERS_FUNDS" : "CURRENT_LIABILITIES"
      : account.group.scheduleIIIHead;
    const bucket = heads.get(head) ?? { head, title: SCHEDULE_TITLES[head] ?? head.replaceAll("_", " "), lines: [], total: "0" };
    const presented = naturalBalance({ debit: dec(row._sum.debit), credit: dec(row._sum.credit) }, account.normalBalance);
    bucket.lines.push({ accountId: account.id, code: account.code, name: account.name, amount: f2(presented) });
    bucket.total = f2(dec(bucket.total).plus(presented));
    heads.set(head, bucket);
  }

  retained = round2(retained);
  if (!retained.isZero()) {
    const equity = heads.get("SHAREHOLDERS_FUNDS") ?? { head: "SHAREHOLDERS_FUNDS" as ScheduleIIIHead, title: "Shareholders' funds", lines: [], total: "0" };
    equity.lines.push({ accountId: "retained", code: "RETAINED", name: "Profit for the period (reserves and surplus)", amount: f2(retained) });
    equity.total = f2(dec(equity.total).plus(retained));
    heads.set("SHAREHOLDERS_FUNDS", equity);
  }

  const liabilityHeads: ScheduleIIIHead[] = ["SHAREHOLDERS_FUNDS", "NON_CURRENT_LIABILITIES", "CURRENT_LIABILITIES"];
  const assetHeads: ScheduleIIIHead[] = ["NON_CURRENT_ASSETS", "CURRENT_ASSETS"];
  const pick = (wanted: ScheduleIIIHead[]) => wanted.map((head) => heads.get(head)).filter((bucket): bucket is BalanceSheetHead => Boolean(bucket));

  const equityAndLiabilities = pick(liabilityHeads);
  const assets = pick(assetHeads);
  const sum = (buckets: BalanceSheetHead[]) => buckets.reduce((total, bucket) => total.plus(dec(bucket.total)), new Decimal(0));
  const totalEquityAndLiabilities = round2(sum(equityAndLiabilities));
  const totalAssets = round2(sum(assets));
  const difference = round2(totalAssets.minus(totalEquityAndLiabilities));

  for (const bucket of [...equityAndLiabilities, ...assets]) bucket.lines.sort((left, right) => Number(right.amount) - Number(left.amount));

  return {
    asOn,
    equityAndLiabilities,
    assets,
    totalEquityAndLiabilities: f2(totalEquityAndLiabilities),
    totalAssets: f2(totalAssets),
    difference: f2(difference),
    isBalanced: difference.isZero(),
    retainedEarnings: f2(retained),
  };
}

// ===========================================================================
// 6. Cash flow
// ===========================================================================

export type CashFlowLine = { category: CashFlowCategory; title: string; rows: { name: string; amount: string }[]; total: string };
export type CashFlowReport = {
  range: DateRange;
  opening: string;
  operating: string;
  investing: string;
  financing: string;
  netChange: string;
  closing: string;
  closingPerLedger: string;
  difference: string;
  sections: CashFlowLine[];
};

/**
 * Direct-method cash flow driven by the ledger itself: every voucher line
 * that moves cash or bank is classified by what sat on the other side of the
 * entry. That keeps the statement tied to real movements instead of an
 * indirect reconstruction that can drift from the books.
 */
export async function getCashFlow(range: DateRange, only?: ReportScope): Promise<CashFlowReport> {
  const { outletIds } = await scope(only);
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);

  const cashAccounts = await db.account.findMany({ where: { outletId: { in: outletIds }, group: { cashFlowCategory: "CASH_EQUIVALENT" } }, select: { id: true } });
  const cashIds = cashAccounts.map((account) => account.id);
  if (cashIds.length === 0) {
    const empty = computeCashFlow({ opening: 0, operating: 0, investing: 0, financing: 0 });
    return { range, opening: f2(empty.opening), operating: f2(empty.operating), investing: f2(empty.investing), financing: f2(empty.financing), netChange: f2(empty.netChange), closing: f2(empty.closing), closingPerLedger: f2(empty.closing), difference: "0.00", sections: [] };
  }

  const openingTotals = await db.voucherLine.aggregate({ where: { ...postedLine(outletIds), accountId: { in: cashIds }, businessDate: { lt: from } }, _sum: { debit: true, credit: true } });
  const opening = round2(dec(openingTotals._sum.debit).minus(dec(openingTotals._sum.credit)));

  // Every voucher that touched cash in the window, with all of its lines.
  const vouchers = await db.voucher.findMany({
    where: { outletId: { in: outletIds }, status: "POSTED", businessDate: { gte: from, lte: to }, lines: { some: { accountId: { in: cashIds } } } },
    select: { id: true, lines: { select: { accountId: true, debit: true, credit: true, account: { select: { name: true, group: { select: { cashFlowCategory: true, name: true } } } } } } },
  });

  const cashIdSet = new Set(cashIds);
  const buckets = new Map<CashFlowCategory, Map<string, Decimal>>();
  const add = (category: CashFlowCategory, name: string, amount: Decimal) => {
    const bucket = buckets.get(category) ?? new Map<string, Decimal>();
    bucket.set(name, (bucket.get(name) ?? new Decimal(0)).plus(amount));
    buckets.set(category, bucket);
  };

  for (const voucher of vouchers) {
    const cashLines = voucher.lines.filter((line) => cashIdSet.has(line.accountId));
    const otherLines = voucher.lines.filter((line) => !cashIdSet.has(line.accountId));
    const cashMovement = cashLines.reduce((total, line) => total.plus(dec(line.debit)).minus(dec(line.credit)), new Decimal(0));
    if (cashMovement.isZero()) continue;

    const otherTotal = otherLines.reduce((total, line) => total.plus(dec(line.debit)).plus(dec(line.credit)), new Decimal(0));
    if (otherTotal.isZero()) {
      // Cash to bank and back: a contra, no effect on the total cash position.
      continue;
    }
    // Attribute the cash movement across the counterparties in proportion to
    // their share of the entry, so a mixed voucher is split honestly. The last
    // attributed line absorbs the rounding residue, so the statement ties to
    // the cash ledger to the paisa instead of drifting by a fraction a voucher.
    const attributable = otherLines.filter((line) => {
      const category = line.account.group.cashFlowCategory;
      return category !== "NONE" && !dec(line.debit).plus(dec(line.credit)).isZero();
    });
    let attributed = new Decimal(0);
    for (const [index, line] of attributable.entries()) {
      const weight = dec(line.debit).plus(dec(line.credit));
      const category = line.account.group.cashFlowCategory === "CASH_EQUIVALENT" ? "OPERATING" : line.account.group.cashFlowCategory;
      const share = index === attributable.length - 1 ? round2(cashMovement.minus(attributed)) : round2(cashMovement.mul(weight).div(otherTotal));
      attributed = attributed.plus(share);
      add(category, line.account.name, share);
    }
  }

  const titles: Record<string, string> = { OPERATING: "Cash flow from operating activities", INVESTING: "Cash flow from investing activities", FINANCING: "Cash flow from financing activities" };
  const order: CashFlowCategory[] = ["OPERATING", "INVESTING", "FINANCING"];
  const sections: CashFlowLine[] = order.map((category) => {
    const bucket = buckets.get(category) ?? new Map<string, Decimal>();
    const rows = [...bucket.entries()]
      .map(([name, amount]) => ({ name, amount: f2(round2(amount)) }))
      .filter((row) => !dec(row.amount).isZero())
      .sort((left, right) => Number(right.amount) - Number(left.amount));
    const total = rows.reduce((sum, row) => sum.plus(dec(row.amount)), new Decimal(0));
    return { category, title: titles[category], rows, total: f2(round2(total)) };
  });

  const result = computeCashFlow({
    opening,
    operating: sections[0].total,
    investing: sections[1].total,
    financing: sections[2].total,
  });

  const closingTotals = await db.voucherLine.aggregate({ where: { ...postedLine(outletIds), accountId: { in: cashIds }, businessDate: { lte: to } }, _sum: { debit: true, credit: true } });
  const closingPerLedger = round2(dec(closingTotals._sum.debit).minus(dec(closingTotals._sum.credit)));

  return {
    range,
    opening: f2(result.opening),
    operating: f2(result.operating),
    investing: f2(result.investing),
    financing: f2(result.financing),
    netChange: f2(result.netChange),
    closing: f2(result.closing),
    closingPerLedger: f2(closingPerLedger),
    difference: f2(round2(closingPerLedger.minus(result.closing))),
    sections,
  };
}

// ===========================================================================
// 7. Cash book, bank book and reconciliation
// ===========================================================================

export type BookRow = LedgerEntry & { isReconciled: boolean; clearedOn: string; bankRef: string };
export type BookReport = {
  account: { id: string; code: string; name: string; isBank: boolean };
  range: DateRange;
  opening: string;
  closing: string;
  totalDebit: string;
  totalCredit: string;
  rows: BookRow[];
  reconciliation: { bookBalance: string; unclearedReceipts: string; unclearedPayments: string; reconciledBalance: string; unclearedCount: number };
};

export async function getBook(accountId: string, range: DateRange, only?: ReportScope): Promise<BookReport | null> {
  const { outletIds } = await scope(only);
  const ledger = await getLedger(accountId, range, only);
  if (!ledger) return null;
  const account = await db.account.findFirstOrThrow({ where: { id: accountId, outletId: { in: outletIds } }, select: { id: true, code: true, name: true, isBankAccount: true } });

  const lines = await db.voucherLine.findMany({
    where: { ...postedLine(outletIds), accountId, businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) } },
    select: { id: true, isReconciled: true, clearedOn: true, bankRef: true },
  });
  const stateById = new Map(lines.map((line) => [line.id, line]));

  // Uncleared items are measured against the whole account, not the window:
  // a cheque issued last month that is still outstanding belongs here.
  const uncleared = await db.voucherLine.aggregate({
    where: { ...postedLine(outletIds), accountId, isReconciled: false, businessDate: { lte: businessDateFromInput(range.to) } },
    _sum: { debit: true, credit: true },
    _count: true,
  });

  const closing = new Decimal(ledger.closingSide === "Dr" ? ledger.closingBalance : `-${ledger.closingBalance}`);
  const reconciliation = reconcileBank({
    bookBalance: closing,
    unclearedReceipts: dec(uncleared._sum.debit),
    unclearedPayments: dec(uncleared._sum.credit),
  });

  return {
    account: { id: account.id, code: account.code, name: account.name, isBank: account.isBankAccount },
    range,
    opening: `${ledger.openingBalance} ${ledger.openingSide}`,
    closing: `${ledger.closingBalance} ${ledger.closingSide}`,
    totalDebit: ledger.totalDebit,
    totalCredit: ledger.totalCredit,
    rows: ledger.entries.map((entry) => {
      const state = stateById.get(entry.id);
      return { ...entry, isReconciled: state?.isReconciled ?? false, clearedOn: iso(state?.clearedOn), bankRef: state?.bankRef ?? "" };
    }),
    reconciliation: {
      bookBalance: f2(reconciliation.bookBalance),
      unclearedReceipts: f2(reconciliation.unclearedReceipts),
      unclearedPayments: f2(reconciliation.unclearedPayments),
      reconciledBalance: f2(reconciliation.reconciledBalance),
      unclearedCount: uncleared._count,
    },
  };
}

export async function getCashAndBankAccounts(only?: ReportScope): Promise<AccountOption[]> {
  const { outletIds } = await scope(only);
  const rows = await db.account.findMany({
    where: { outletId: { in: outletIds }, isActive: true, group: { cashFlowCategory: "CASH_EQUIVALENT" } },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { code: "asc" },
  });
  return rows.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}`, code: row.code, groupId: row.groupId, groupName: row.group.name, isBank: row.isBankAccount, nature: row.nature }));
}

// ===========================================================================
// 8-10. Debtors, statements and ageing
// ===========================================================================

export type OpenInvoice = { billId: string; docNumber: string; date: string; dueDate: string; amount: string; paid: string; outstanding: string; daysOverdue: number; bucket: AgeingLabel };

export type DebtorRow = {
  customerId: string;
  code: string;
  name: string;
  phone: string;
  accountId: string | null;
  creditLimit: string;
  outstanding: string;
  availableLimit: string;
  utilisationPct: string;
  overdue: string;
  oldestDays: number;
  creditDays: number;
  lastPaymentDate: string;
  lastPaymentAmount: string;
  buckets: Record<AgeingLabel, string>;
  status: "OK" | "WARN" | "BLOCK";
};

export type DebtorsReport = {
  asOn: string;
  rows: DebtorRow[];
  totals: { outstanding: string; overdue: string; creditLimit: string; buckets: Record<AgeingLabel, string> };
};

/**
 * Open items for a customer at a date, aged oldest-first.
 *
 * Built from the customer's ledger rather than from `bills`, because fuel sold
 * on credit at the pump debits the ledger through the shift settlement and
 * never becomes a bill of its own. Receipts are applied FIFO against the
 * oldest debit, which is how a credit account is actually settled and what
 * makes the buckets sum to the outstanding balance.
 */
async function openItemsFor(
  outletIds: string[],
  customer: { id: string; accountId: string | null; creditDays: number },
  asOn: Date,
): Promise<OpenInvoice[]> {
  if (!customer.accountId) return [];

  const [lines, bills] = await Promise.all([
    db.voucherLine.findMany({
      where: { ...postedLine(outletIds), accountId: customer.accountId, businessDate: { lte: asOn } },
      select: { id: true, businessDate: true, debit: true, credit: true, voucher: { select: { docNumber: true, billId: true } } },
      orderBy: [{ businessDate: "asc" }, { lineNo: "asc" }],
    }),
    db.bill.findMany({
      where: { outletId: { in: outletIds }, customerId: customer.id, status: "POSTED" },
      select: { id: true, docNumber: true, dueDate: true },
    }),
  ]);

  const dueByBill = new Map(bills.map((bill) => [bill.id, bill.dueDate]));
  const open: { docNumber: string; date: Date; dueDate: Date; amount: Decimal; outstanding: Decimal; billId: string | null }[] = [];
  let credits = new Decimal(0);

  for (const line of lines) {
    const debit = dec(line.debit);
    const credit = dec(line.credit);
    if (debit.gt(0)) {
      const billDue = line.voucher.billId ? dueByBill.get(line.voucher.billId) ?? null : null;
      open.push({
        docNumber: line.voucher.docNumber,
        date: line.businessDate,
        // No bill means credit taken at the pump: it falls due by the
        // customer's own credit terms.
        dueDate: billDue ?? new Date(line.businessDate.getTime() + customer.creditDays * 86_400_000),
        amount: debit,
        outstanding: debit,
        billId: line.voucher.billId,
      });
    }
    if (credit.gt(0)) credits = credits.plus(credit);
  }

  // Apply every receipt against the oldest open item first.
  for (const item of open) {
    if (credits.lte(0)) break;
    const applied = Decimal.min(credits, item.outstanding);
    item.outstanding = round2(item.outstanding.minus(applied));
    credits = credits.minus(applied);
  }

  return open
    .filter((item) => item.outstanding.gt(0))
    .map((item) => {
      const daysOverdue = daysBetween(item.dueDate, asOn);
      return {
        billId: item.billId ?? "",
        docNumber: item.docNumber,
        date: iso(item.date),
        dueDate: iso(item.dueDate),
        amount: f2(item.amount),
        paid: f2(round2(item.amount.minus(item.outstanding))),
        outstanding: f2(item.outstanding),
        daysOverdue,
        bucket: ageingBucket(daysOverdue),
      };
    });
}

export async function getDebtors(asOn: string, only?: ReportScope): Promise<DebtorsReport> {
  const { outletIds } = await scope(only);
  const date = businessDateFromInput(asOn);

  const customers = await db.customer.findMany({
    where: { outletId: { in: outletIds }, isActive: true },
    select: { id: true, code: true, name: true, phone: true, accountId: true, creditLimit: true, creditDays: true },
    orderBy: { code: "asc" },
  });

  const accountIds = customers.map((customer) => customer.accountId).filter((id): id is string => Boolean(id));
  const [balances, lastReceipts] = await Promise.all([
    db.voucherLine.groupBy({ by: ["accountId"], where: { ...postedLine(outletIds), accountId: { in: accountIds }, businessDate: { lte: date } }, _sum: { debit: true, credit: true } }),
    db.voucherLine.findMany({
      where: { ...postedLine(outletIds), accountId: { in: accountIds }, businessDate: { lte: date }, credit: { gt: 0 }, voucher: { type: { in: ["RECEIPT", "SHIFT_CLOSE", "CONTRA"] } } },
      select: { accountId: true, credit: true, businessDate: true },
      orderBy: { businessDate: "desc" },
    }),
  ]);

  const balanceByAccount = new Map(balances.map((row) => [row.accountId, round2(dec(row._sum.debit).minus(dec(row._sum.credit)))]));
  const lastByAccount = new Map<string, { date: Date; amount: Decimal }>();
  for (const line of lastReceipts) {
    if (!lastByAccount.has(line.accountId)) lastByAccount.set(line.accountId, { date: line.businessDate, amount: dec(line.credit) });
  }

  const blankBuckets = () => Object.fromEntries(AGEING_LABELS.map((label) => [label, new Decimal(0)])) as Record<AgeingLabel, Decimal>;
  const totalBuckets = blankBuckets();
  let totalOutstanding = new Decimal(0);
  let totalOverdue = new Decimal(0);
  let totalLimit = new Decimal(0);

  const rows: DebtorRow[] = [];
  for (const customer of customers) {
    const outstanding = customer.accountId ? balanceByAccount.get(customer.accountId) ?? new Decimal(0) : new Decimal(0);
    const invoices = await openItemsFor(outletIds, customer, date);
    if (outstanding.isZero() && invoices.length === 0) continue;

    const buckets = blankBuckets();
    let overdue = new Decimal(0);
    let oldestDays = 0;
    for (const invoice of invoices) {
      buckets[invoice.bucket] = buckets[invoice.bucket].plus(dec(invoice.outstanding));
      totalBuckets[invoice.bucket] = totalBuckets[invoice.bucket].plus(dec(invoice.outstanding));
      if (invoice.daysOverdue > 0) {
        overdue = overdue.plus(dec(invoice.outstanding));
        oldestDays = Math.max(oldestDays, invoice.daysOverdue);
      }
    }

    const exposure = creditExposure(outstanding, dec(customer.creditLimit), overdue);
    const last = customer.accountId ? lastByAccount.get(customer.accountId) : undefined;

    totalOutstanding = totalOutstanding.plus(outstanding);
    totalOverdue = totalOverdue.plus(overdue);
    totalLimit = totalLimit.plus(dec(customer.creditLimit));

    rows.push({
      customerId: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.phone ?? "",
      accountId: customer.accountId,
      creditLimit: f2(exposure.creditLimit),
      outstanding: f2(exposure.outstanding),
      availableLimit: f2(exposure.availableLimit),
      utilisationPct: f2(exposure.utilisationPct),
      overdue: f2(exposure.overdue),
      oldestDays,
      creditDays: customer.creditDays,
      lastPaymentDate: last ? iso(last.date) : "",
      lastPaymentAmount: last ? f2(last.amount) : "",
      buckets: Object.fromEntries(AGEING_LABELS.map((label) => [label, f2(round2(buckets[label]))])) as Record<AgeingLabel, string>,
      // Drives the warn/block logic the billing screen already honours.
      status: exposure.creditLimit.gt(0) && exposure.outstanding.gt(exposure.creditLimit) ? "BLOCK" : overdue.gt(0) || exposure.utilisationPct.gte(80) ? "WARN" : "OK",
    });
  }

  rows.sort((left, right) => Number(right.outstanding) - Number(left.outstanding));

  return {
    asOn,
    rows,
    totals: {
      outstanding: f2(round2(totalOutstanding)),
      overdue: f2(round2(totalOverdue)),
      creditLimit: f2(round2(totalLimit)),
      buckets: Object.fromEntries(AGEING_LABELS.map((label) => [label, f2(round2(totalBuckets[label]))])) as Record<AgeingLabel, string>,
    },
  };
}

export type CustomerStatement = {
  customer: { id: string; code: string; name: string; phone: string; email: string; gstin: string; creditLimit: string; creditDays: number; address: string };
  outlet: { name: string; address: string; gstin: string };
  range: DateRange;
  opening: string;
  openingSide: "Dr" | "Cr";
  closing: string;
  closingSide: "Dr" | "Cr";
  totalDebit: string;
  totalCredit: string;
  entries: LedgerEntry[];
  ageing: { buckets: Record<AgeingLabel, string>; total: string };
  openInvoices: OpenInvoice[];
};

export async function getCustomerStatement(customerId: string, range: DateRange, only?: ReportScope): Promise<CustomerStatement | null> {
  const { outletIds, outletId } = await scope(only);
  const customer = await db.customer.findFirst({ where: { id: customerId, outletId: { in: outletIds } } });
  if (!customer?.accountId) return null;

  const [ledger, outlet, invoices] = await Promise.all([
    getLedger(customer.accountId, range, only),
    db.outlet.findUnique({ where: { id: outletId }, select: { name: true, addressLine1: true, city: true, gstin: true } }),
    openItemsFor(outletIds, customer, businessDateFromInput(range.to)),
  ]);
  if (!ledger) return null;

  const buckets = Object.fromEntries(AGEING_LABELS.map((label) => [label, new Decimal(0)])) as Record<AgeingLabel, Decimal>;
  let total = new Decimal(0);
  for (const invoice of invoices) {
    buckets[invoice.bucket] = buckets[invoice.bucket].plus(dec(invoice.outstanding));
    total = total.plus(dec(invoice.outstanding));
  }

  return {
    customer: {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      phone: customer.statementMobile ?? customer.phone ?? "",
      email: customer.statementEmail ?? customer.email ?? "",
      gstin: customer.gstin ?? "",
      creditLimit: f2(dec(customer.creditLimit)),
      creditDays: customer.creditDays,
      address: [customer.addressLine1, customer.city].filter(Boolean).join(", "),
    },
    outlet: { name: outlet?.name ?? "", address: [outlet?.addressLine1, outlet?.city].filter(Boolean).join(", "), gstin: outlet?.gstin ?? "" },
    range,
    opening: ledger.openingBalance,
    openingSide: ledger.openingSide,
    closing: ledger.closingBalance,
    closingSide: ledger.closingSide,
    totalDebit: ledger.totalDebit,
    totalCredit: ledger.totalCredit,
    entries: ledger.entries,
    ageing: { buckets: Object.fromEntries(AGEING_LABELS.map((label) => [label, f2(round2(buckets[label]))])) as Record<AgeingLabel, string>, total: f2(round2(total)) },
    openInvoices: invoices,
  };
}

export type AgeingReport = {
  asOn: string;
  labels: readonly string[];
  rows: { customerId: string; code: string; name: string; buckets: Record<AgeingLabel, string>; total: string; oldestDays: number }[];
  totals: Record<AgeingLabel, string> & { total: string };
};

export async function getAgeing(asOn: string, only?: ReportScope): Promise<AgeingReport> {
  const debtors = await getDebtors(asOn, only);
  const rows = debtors.rows
    .map((row) => ({
      customerId: row.customerId,
      code: row.code,
      name: row.name,
      buckets: row.buckets,
      total: f2(AGEING_LABELS.reduce((sum, label) => sum.plus(dec(row.buckets[label])), new Decimal(0))),
      oldestDays: row.oldestDays,
    }))
    .filter((row) => !dec(row.total).isZero())
    .sort((left, right) => Number(right.total) - Number(left.total));

  const totals = Object.fromEntries(AGEING_LABELS.map((label) => [label, debtors.totals.buckets[label]])) as Record<AgeingLabel, string>;
  return {
    asOn,
    labels: AGEING_LABELS,
    rows,
    totals: { ...totals, total: f2(AGEING_LABELS.reduce((sum, label) => sum.plus(dec(totals[label])), new Decimal(0))) },
  };
}

// ===========================================================================
// 11. Month-wise periodicals
// ===========================================================================

export type PeriodicalMonth = { month: string; label: string; sale: string; purchase: string; expense: string; grossProfit: string; netProfit: string; collection: string; litres: string };
export type PeriodicalReport = { months: PeriodicalMonth[]; totals: Omit<PeriodicalMonth, "month" | "label"> };

export async function getPeriodicals(monthCount = 12, only?: ReportScope): Promise<PeriodicalReport> {
  const { outletIds } = await scope(only);
  const today = businessDateToday();
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (monthCount - 1), 1));

  const rows = await db.$queryRaw<{
    month: string; sale: string; purchase: string; directcost: string; expense: string; collection: string; litres: string;
  }[]>`
    SELECT to_char(l."businessDate", 'YYYY-MM') AS month,
      COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS sale,
      COALESCE(SUM(CASE WHEN a."systemKey" = 'STOCK_IN_TRADE' THEN l.debit - l.credit END), 0)::text AS purchase,
      COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS directcost,
      COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND NOT g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS expense,
      COALESCE(SUM(CASE WHEN g."cashFlowCategory" = 'CASH_EQUIVALENT' THEN l.debit - l.credit END), 0)::text AS collection,
      COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.quantity END), 0)::text AS litres
    FROM voucher_lines l
    JOIN accounts a ON a.id = l."accountId"
    JOIN account_groups g ON g.id = a."groupId"
    JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
    WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" >= ${first}
    GROUP BY 1 ORDER BY 1`;

  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const months: PeriodicalMonth[] = [];
  const totals = { sale: new Decimal(0), purchase: new Decimal(0), expense: new Decimal(0), grossProfit: new Decimal(0), netProfit: new Decimal(0), collection: new Decimal(0), litres: new Decimal(0) };

  for (let index = 0; index < monthCount; index += 1) {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key);
    const sale = dec(row?.sale);
    const directCost = dec(row?.directcost);
    const expense = dec(row?.expense);
    const grossProfit = round2(sale.minus(directCost));
    const netProfit = round2(grossProfit.minus(expense));
    const purchase = dec(row?.purchase);
    const collection = dec(row?.collection);
    const litres = dec(row?.litres);

    months.push({
      month: key,
      label: date.toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
      sale: f2(round2(sale)),
      purchase: f2(round2(purchase)),
      expense: f2(round2(expense)),
      grossProfit: f2(grossProfit),
      netProfit: f2(netProfit),
      collection: f2(round2(collection)),
      litres: f2(round2(litres)),
    });
    totals.sale = totals.sale.plus(sale);
    totals.purchase = totals.purchase.plus(purchase);
    totals.expense = totals.expense.plus(expense);
    totals.grossProfit = totals.grossProfit.plus(grossProfit);
    totals.netProfit = totals.netProfit.plus(netProfit);
    totals.collection = totals.collection.plus(collection);
    totals.litres = totals.litres.plus(litres);
  }

  return {
    months,
    totals: {
      sale: f2(round2(totals.sale)),
      purchase: f2(round2(totals.purchase)),
      expense: f2(round2(totals.expense)),
      grossProfit: f2(round2(totals.grossProfit)),
      netProfit: f2(round2(totals.netProfit)),
      collection: f2(round2(totals.collection)),
      litres: f2(round2(totals.litres)),
    },
  };
}

// ===========================================================================
// 12. GST returns
// ===========================================================================

export type Gstr1B2B = { gstin: string; customer: string; invoiceNo: string; date: string; value: string; place: string; rate: string; taxable: string; cgst: string; sgst: string; igst: string; cess: string; type: string };
export type Gstr1B2C = { type: string; place: string; rate: string; taxable: string; cgst: string; sgst: string; igst: string; cess: string; invoices: number };
export type GstrHsn = { hsn: string; description: string; uqc: string; quantity: string; value: string; taxable: string; cgst: string; sgst: string; igst: string; cess: string };

export type Gstr1Report = {
  range: DateRange;
  b2b: Gstr1B2B[];
  b2c: Gstr1B2C[];
  hsn: GstrHsn[];
  totals: { taxable: string; cgst: string; sgst: string; igst: string; cess: string; invoiceValue: string };
};

export async function getGstr1(range: DateRange, only?: ReportScope): Promise<Gstr1Report> {
  const { outletIds } = await scope(only);
  const bills = await db.bill.findMany({
    where: { outletId: { in: outletIds }, status: "POSTED", businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) } },
    include: { customer: { select: { name: true, gstin: true, state: true } }, lines: { include: { product: { select: { name: true, hsnCode: true, type: true } } } } },
    orderBy: { businessDate: "asc" },
  });

  const b2b: Gstr1B2B[] = [];
  const b2cByKey = new Map<string, Gstr1B2C>();
  const hsnByKey = new Map<string, GstrHsn>();
  const totals = { taxable: new Decimal(0), cgst: new Decimal(0), sgst: new Decimal(0), igst: new Decimal(0), cess: new Decimal(0), invoiceValue: new Decimal(0) };

  for (const bill of bills) {
    const isCreditNote = bill.type === "CREDIT_NOTE";
    const sign = isCreditNote ? -1 : 1;
    const place = bill.customer?.gstin?.slice(0, 2) ?? "33";

    for (const line of bill.lines) {
      const taxable = round2(dec(line.taxableValue).mul(sign));
      const cgst = round2(dec(line.cgstAmount).mul(sign));
      const sgst = round2(dec(line.sgstAmount).mul(sign));
      const igst = round2(dec(line.igstAmount).mul(sign));
      const cess = round2(dec(line.cessAmount).mul(sign));
      const rate = dec(line.gstPct).toFixed(2);

      totals.taxable = totals.taxable.plus(taxable);
      totals.cgst = totals.cgst.plus(cgst);
      totals.sgst = totals.sgst.plus(sgst);
      totals.igst = totals.igst.plus(igst);
      totals.cess = totals.cess.plus(cess);

      if (bill.customer?.gstin) {
        b2b.push({
          gstin: bill.customer.gstin,
          customer: bill.customer.name,
          invoiceNo: bill.docNumber,
          date: iso(bill.businessDate),
          value: f2(round2(dec(bill.totalAmount).mul(sign))),
          place,
          rate,
          taxable: f2(taxable),
          cgst: f2(cgst),
          sgst: f2(sgst),
          igst: f2(igst),
          cess: f2(cess),
          type: isCreditNote ? "Credit note" : "Regular",
        });
      } else {
        // Unregistered buyers are reported in summary, by place and rate.
        const key = `${place}|${rate}`;
        const bucket = b2cByKey.get(key) ?? { type: "B2C (Others)", place, rate, taxable: "0", cgst: "0", sgst: "0", igst: "0", cess: "0", invoices: 0 };
        bucket.taxable = f2(dec(bucket.taxable).plus(taxable));
        bucket.cgst = f2(dec(bucket.cgst).plus(cgst));
        bucket.sgst = f2(dec(bucket.sgst).plus(sgst));
        bucket.igst = f2(dec(bucket.igst).plus(igst));
        bucket.cess = f2(dec(bucket.cess).plus(cess));
        bucket.invoices += 1;
        b2cByKey.set(key, bucket);
      }

      const hsn = line.hsnCode ?? line.product.hsnCode ?? "UNSPECIFIED";
      const uqc = line.product.type === "LITRE" ? "LTR" : line.product.type === "KILOGRAM" ? "KGS" : "NOS";
      const summary = hsnByKey.get(hsn) ?? { hsn, description: line.product.name, uqc, quantity: "0", value: "0", taxable: "0", cgst: "0", sgst: "0", igst: "0", cess: "0" };
      summary.quantity = f2(dec(summary.quantity).plus(round2(dec(line.quantity).mul(sign))));
      summary.value = f2(dec(summary.value).plus(round2(dec(line.amount).mul(sign))));
      summary.taxable = f2(dec(summary.taxable).plus(taxable));
      summary.cgst = f2(dec(summary.cgst).plus(cgst));
      summary.sgst = f2(dec(summary.sgst).plus(sgst));
      summary.igst = f2(dec(summary.igst).plus(igst));
      summary.cess = f2(dec(summary.cess).plus(cess));
      hsnByKey.set(hsn, summary);
    }
    totals.invoiceValue = totals.invoiceValue.plus(round2(dec(bill.totalAmount).mul(sign)));
  }

  return {
    range,
    b2b,
    b2c: [...b2cByKey.values()],
    hsn: [...hsnByKey.values()].sort((left, right) => left.hsn.localeCompare(right.hsn)),
    totals: {
      taxable: f2(round2(totals.taxable)),
      cgst: f2(round2(totals.cgst)),
      sgst: f2(round2(totals.sgst)),
      igst: f2(round2(totals.igst)),
      cess: f2(round2(totals.cess)),
      invoiceValue: f2(round2(totals.invoiceValue)),
    },
  };
}

export type Gstr3bReport = {
  range: DateRange;
  outward: { description: string; taxable: string; igst: string; cgst: string; sgst: string; cess: string }[];
  inward: { description: string; taxable: string; igst: string; cgst: string; sgst: string; cess: string }[];
  netPayable: string;
  note: string;
};

export async function getGstr3b(range: DateRange, only?: ReportScope): Promise<Gstr3bReport> {
  const { outletIds } = await scope(only);
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);

  const [taxable, exempt, purchases] = await Promise.all([
    db.bill.aggregate({
      where: { outletId: { in: outletIds }, status: "POSTED", businessDate: { gte: from, lte: to }, invoiceKind: "GST_INVOICE" },
      _sum: { taxableValue: true, cgstAmount: true, sgstAmount: true, igstAmount: true, cessAmount: true },
    }),
    // Petrol and diesel sit outside GST; they are reported as non-GST supply.
    db.bill.aggregate({
      where: { outletId: { in: outletIds }, status: "POSTED", businessDate: { gte: from, lte: to }, invoiceKind: "BILL_OF_SUPPLY" },
      _sum: { totalAmount: true },
    }),
    db.purchase.aggregate({
      where: { outletId: { in: outletIds }, status: "POSTED", businessDate: { gte: from, lte: to } },
      _sum: { subTotal: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
    }),
  ]);

  const outwardTax = round2(dec(taxable._sum.cgstAmount).plus(dec(taxable._sum.sgstAmount)).plus(dec(taxable._sum.igstAmount)));
  const inputTax = round2(dec(purchases._sum.cgstAmount).plus(dec(purchases._sum.sgstAmount)).plus(dec(purchases._sum.igstAmount)));

  return {
    range,
    outward: [
      { description: "3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)", taxable: f2(round2(dec(taxable._sum.taxableValue))), igst: f2(round2(dec(taxable._sum.igstAmount))), cgst: f2(round2(dec(taxable._sum.cgstAmount))), sgst: f2(round2(dec(taxable._sum.sgstAmount))), cess: f2(round2(dec(taxable._sum.cessAmount))) },
      { description: "3.1(c) Other outward supplies (nil rated, exempted)", taxable: "0.00", igst: "0.00", cgst: "0.00", sgst: "0.00", cess: "0.00" },
      { description: "Non-GST outward supplies (petrol and diesel)", taxable: f2(round2(dec(exempt._sum.totalAmount))), igst: "0.00", cgst: "0.00", sgst: "0.00", cess: "0.00" },
    ],
    inward: [
      { description: "4(A)(5) All other ITC", taxable: f2(round2(dec(purchases._sum.subTotal))), igst: f2(round2(dec(purchases._sum.igstAmount))), cgst: f2(round2(dec(purchases._sum.cgstAmount))), sgst: f2(round2(dec(purchases._sum.sgstAmount))), cess: "0.00" },
    ],
    netPayable: f2(round2(outwardTax.minus(inputTax))),
    note: "Petrol and diesel are outside GST. Their turnover is reported as a non-GST outward supply and carries no input credit.",
  };
}

// ===========================================================================
// Voucher register
// ===========================================================================

export type VoucherRow = {
  id: string;
  date: string;
  docNumber: string;
  type: string;
  narration: string;
  party: string;
  instrument: string;
  amount: string;
  status: string;
  attachments: number;
  lines: { accountId: string; account: string; debit: string; credit: string; narration: string }[];
};

export async function getVouchers(range: DateRange, type?: string, only?: ReportScope): Promise<{ rows: VoucherRow[]; total: string }> {
  const { outletIds } = await scope(only);
  const rows = await db.voucher.findMany({
    where: {
      outletId: { in: outletIds },
      businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) },
      ...(type && type !== "ALL" ? { type: type as never } : {}),
    },
    include: {
      partyAccount: { select: { name: true } },
      lines: { include: { account: { select: { name: true } } }, orderBy: { lineNo: "asc" } },
      _count: { select: { attachments: true } },
    },
    orderBy: [{ businessDate: "desc" }, { docNumber: "desc" }],
    take: 500,
  });

  let total = new Decimal(0);
  const mapped = rows.map((voucher) => {
    if (voucher.status === "POSTED") total = total.plus(dec(voucher.totalDebit));
    return {
      id: voucher.id,
      date: iso(voucher.businessDate),
      docNumber: voucher.docNumber,
      type: voucher.type,
      narration: voucher.narration ?? "",
      party: voucher.partyAccount?.name ?? "",
      instrument: voucher.instrumentNo ? `${voucher.instrumentType} ${voucher.instrumentNo}` : voucher.instrumentType,
      amount: f2(dec(voucher.totalDebit)),
      status: voucher.status,
      attachments: voucher._count.attachments,
      lines: voucher.lines.map((line) => ({
        accountId: line.accountId,
        account: line.account.name,
        debit: f2(dec(line.debit)),
        credit: f2(dec(line.credit)),
        narration: line.narration ?? "",
      })),
    };
  });

  return { rows: mapped, total: f2(round2(total)) };
}

export async function getCustomerOptions(only?: ReportScope): Promise<Option[]> {
  const { outletIds } = await scope(only);
  const rows = await db.customer.findMany({ where: { outletId: { in: outletIds }, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  return rows.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` }));
}
