/**
 * The five-second dashboard (PROJECT_SPEC § 1.1).
 *
 * Everything the owner sees on opening the app, gathered in one pass. The
 * whole page must render in under two seconds on a mid-range Android with 90
 * days of data, so the rules here are:
 *
 *   - one aggregate query per panel, never a query per row;
 *   - grouped SQL over the indexed `(outletId, businessDate)` columns;
 *   - every panel independent, so `Promise.all` fans them out in parallel.
 */
import { Decimal, round2 } from "@/lib/money";
import { businessDateFromInput, businessDateToday } from "@/lib/date";
import { getOutletScope } from "@/server/guard";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";

export type DateRange = { from: string; to: string };

/**
 * Who is looking. A salesman sees litres and his own settlement; the outlet's
 * money never leaves the server for him — not in a card, and not in the
 * payload behind one (CLAUDE.md § 6: hiding a control is a courtesy, the
 * server is the control).
 */
export type Viewer = {
  canSeeMoney: boolean;
  /** When set, league tables and settlements are limited to this employee. */
  employeeId?: string | null;
};

export const OWNER_VIEW: Viewer = { canSeeMoney: true };

const dec = (value: { toString(): string } | null | undefined): Decimal => new Decimal(value?.toString() ?? "0");
const iso = (value: Date): string => value.toISOString().slice(0, 10);
const f2 = (value: Decimal): string => value.toFixed(2);
const addDays = (value: Date, days: number) => new Date(value.getTime() + days * 86_400_000);

export const dashboardDefaultRange = (): DateRange => {
  const today = businessDateToday();
  return { from: iso(today), to: iso(today) };
};

async function scope(only?: string[]) {
  if (only && only.length > 0) return { outletIds: only, outletId: only[0] };
  const current = await getOutletScope();
  return { outletIds: current.outletIds, outletId: current.outletIds[0] };
}

// ===========================================================================
// Row 1 — KPI cards
// ===========================================================================

export type Kpi = {
  key: string;
  label: string;
  value: string;
  unit: "INR" | "L" | "COUNT";
  /** Change against the comparable previous window. */
  delta: string;
  deltaPct: string;
  deltaLabel: string;
  /** Daily series for the sparkline, oldest first. */
  spark: number[];
  href: string;
  tone: "neutral" | "loss" | "gain";
};

type DailySeries = Map<string, Decimal>;

/** Fills every date in the window, so a sparkline has no gaps. */
function seriesFor(range: DateRange, byDate: DailySeries): number[] {
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);
  const points: number[] = [];
  for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
    points.push((byDate.get(iso(day)) ?? new Decimal(0)).toNumber());
  }
  return points;
}

const pct = (current: Decimal, previous: Decimal): Decimal =>
  previous.isZero() ? new Decimal(0) : round2(current.minus(previous).div(previous.abs()).mul(100));

export async function getKpis(range: DateRange, only?: string[], viewer: Viewer = OWNER_VIEW): Promise<Kpi[]> {
  const { outletIds } = await scope(only);
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const priorTo = addDays(from, -1);
  const priorFrom = addDays(priorTo, -(span - 1));
  // A single-day window compares with yesterday; anything longer compares with
  // the equivalent window immediately before it.
  const deltaLabel = span === 1 ? "vs yesterday" : `vs previous ${span} days`;

  // Sparkline window: always 30 days ending at `to`, whatever the range.
  const sparkFrom = addDays(to, -29);

  const [saleRows, sparkRows, cashRows, outstandingRows, stockRows, priorSale] = await Promise.all([
    // Sale litres, sale value and gross profit per day, from the ledger.
    db.$queryRaw<{ d: Date; litres: string; revenue: string; cogs: string }[]>`
      SELECT l."businessDate" AS d,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.quantity END), 0)::text AS litres,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS revenue,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS cogs
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" BETWEEN ${from} AND ${to}
      GROUP BY 1`,
    db.$queryRaw<{ d: Date; litres: string; revenue: string; cogs: string }[]>`
      SELECT l."businessDate" AS d,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.quantity END), 0)::text AS litres,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS revenue,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS cogs
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" BETWEEN ${sparkFrom} AND ${to}
      GROUP BY 1`,
    // Cash and bank: a running position, so the sparkline is a balance curve.
    db.$queryRaw<{ d: Date; movement: string }[]>`
      SELECT l."businessDate" AS d, COALESCE(SUM(l.debit - l.credit), 0)::text AS movement
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND g."cashFlowCategory" = 'CASH_EQUIVALENT'
        AND l."businessDate" <= ${to}
      GROUP BY 1 ORDER BY 1`,
    // Customer receivables, as a running balance.
    db.$queryRaw<{ d: Date; movement: string }[]>`
      SELECT l."businessDate" AS d, COALESCE(SUM(l.debit - l.credit), 0)::text AS movement
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN customers c ON c."accountId" = a.id
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" <= ${to}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ d: Date; movement: string }[]>`
      SELECT l."businessDate" AS d, COALESCE(SUM(l.debit - l.credit), 0)::text AS movement
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND a."systemKey" = 'STOCK_IN_TRADE'
        AND l."businessDate" <= ${to}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ litres: string; revenue: string; cogs: string }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.quantity END), 0)::text AS litres,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS revenue,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS cogs
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" BETWEEN ${priorFrom} AND ${priorTo}`,
  ]);

  const sum = (rows: { litres: string; revenue: string; cogs: string }[]) =>
    rows.reduce(
      (total, row) => ({
        litres: total.litres.plus(dec(row.litres)),
        revenue: total.revenue.plus(dec(row.revenue)),
        cogs: total.cogs.plus(dec(row.cogs)),
      }),
      { litres: new Decimal(0), revenue: new Decimal(0), cogs: new Decimal(0) },
    );

  const current = sum(saleRows);
  const prior = sum(priorSale);
  const grossProfit = round2(current.revenue.minus(current.cogs));
  const priorGross = round2(prior.revenue.minus(prior.cogs));

  const litreSpark: DailySeries = new Map(sparkRows.map((row) => [iso(row.d), dec(row.litres)]));
  const valueSpark: DailySeries = new Map(sparkRows.map((row) => [iso(row.d), dec(row.revenue)]));
  const profitSpark: DailySeries = new Map(sparkRows.map((row) => [iso(row.d), round2(dec(row.revenue).minus(dec(row.cogs)))]));
  const sparkRange = { from: iso(sparkFrom), to: iso(to) };

  /**
   * Turns daily movements into a closing-balance curve.
   *
   * `prior` is the balance as at the day before the window opened, which is
   * what the delta compares against. It is accumulated from the rows directly
   * rather than read out of the sparkline, because the comparison date sits
   * outside the 30-day sparkline window on any range longer than a day.
   */
  const runningBalance = (rows: { d: Date; movement: string }[]) => {
    let balance = new Decimal(0);
    let prior = new Decimal(0);
    let carry = new Decimal(0);
    const byDate: DailySeries = new Map();
    for (const row of rows) {
      balance = balance.plus(dec(row.movement));
      byDate.set(iso(row.d), balance);
      if (row.d <= priorTo) prior = balance;
      if (row.d < sparkFrom) carry = balance;
    }
    // Carry the last known balance across days with no movement.
    const filled: DailySeries = new Map();
    for (let day = new Date(sparkFrom); day <= to; day = addDays(day, 1)) {
      carry = byDate.get(iso(day)) ?? carry;
      filled.set(iso(day), carry);
    }
    return { closing: balance, series: filled, prior };
  };

  const cash = runningBalance(cashRows);
  const outstanding = runningBalance(outstandingRows);
  const stock = runningBalance(stockRows);

  const cards: Kpi[] = [
    {
      key: "saleLitres",
      label: "Today's sale",
      value: f2(round2(current.litres)),
      unit: "L",
      delta: f2(round2(current.litres.minus(prior.litres))),
      deltaPct: f2(pct(current.litres, prior.litres)),
      deltaLabel,
      spark: seriesFor(sparkRange, litreSpark),
      href: "/pump/shift-entry",
      tone: current.litres.gte(prior.litres) ? "gain" : "loss",
    },
    {
      key: "saleValue",
      label: "Today's sale",
      value: f2(round2(current.revenue)),
      unit: "INR",
      delta: f2(round2(current.revenue.minus(prior.revenue))),
      deltaPct: f2(pct(current.revenue, prior.revenue)),
      deltaLabel,
      spark: seriesFor(sparkRange, valueSpark),
      href: "/accounts/profit-loss",
      tone: current.revenue.gte(prior.revenue) ? "gain" : "loss",
    },
    {
      key: "grossProfit",
      label: "Gross profit",
      value: f2(grossProfit),
      unit: "INR",
      delta: f2(round2(grossProfit.minus(priorGross))),
      deltaPct: f2(pct(grossProfit, priorGross)),
      deltaLabel,
      spark: seriesFor(sparkRange, profitSpark),
      href: "/accounts/profit-loss",
      tone: grossProfit.lt(0) ? "loss" : grossProfit.gte(priorGross) ? "gain" : "loss",
    },
    {
      key: "cash",
      label: "Cash and bank",
      value: f2(cash.closing),
      unit: "INR",
      delta: f2(round2(cash.closing.minus(cash.prior))),
      deltaPct: f2(pct(cash.closing, cash.prior)),
      deltaLabel,
      spark: seriesFor(sparkRange, cash.series),
      href: "/accounts/cash-book",
      tone: cash.closing.lt(0) ? "loss" : "neutral",
    },
    {
      key: "outstanding",
      label: "Total outstanding",
      value: f2(outstanding.closing),
      unit: "INR",
      delta: f2(round2(outstanding.closing.minus(outstanding.prior))),
      deltaPct: f2(pct(outstanding.closing, outstanding.prior)),
      deltaLabel,
      spark: seriesFor(sparkRange, outstanding.series),
      href: "/accounts/debtors",
      // More money owed to the outlet is not good news.
      tone: outstanding.closing.gt(outstanding.prior) ? "loss" : "gain",
    },
    {
      key: "stockValue",
      label: "Stock value",
      value: f2(stock.closing),
      unit: "INR",
      delta: f2(round2(stock.closing.minus(stock.prior))),
      deltaPct: f2(pct(stock.closing, stock.prior)),
      deltaLabel,
      spark: seriesFor(sparkRange, stock.series),
      href: "/inventory/stock-status",
      tone: "neutral",
    },
  ];
  // Litres only for a salesman: the money cards are never built.
  return viewer.canSeeMoney ? cards : cards.filter((card) => card.unit === "L");
}

// ===========================================================================
// Row 2 — today at a glance
// ===========================================================================

export type Slice = { name: string; value: number; label: string };
export type PaymentSplit = { mode: string; amount: number; label: string };
export type ShiftBar = { shift: string; litres: number; amount: number; today: number; previous: number };

export type Glance = {
  productMix: Slice[];
  paymentSplit: PaymentSplit[];
  shiftComparison: ShiftBar[];
  totalLitres: string;
  totalValue: string;
};

export async function getGlance(range: DateRange, only?: string[], viewer: Viewer = OWNER_VIEW): Promise<Glance> {
  const { outletIds } = await scope(only);
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);
  const priorFrom = addDays(from, -Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1));

  const [products, collections, shifts, priorShifts] = await Promise.all([
    db.$queryRaw<{ name: string; litres: string; amount: string }[]>`
      SELECT p.name,
        COALESCE(SUM(l.quantity), 0)::text AS litres,
        COALESCE(SUM(l.credit - l.debit), 0)::text AS amount
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId" AND a.nature = 'INCOME'
      JOIN products p ON p.id = l."productId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" BETWEEN ${from} AND ${to}
      GROUP BY p.name HAVING SUM(l.credit - l.debit) <> 0 ORDER BY 3 DESC`,
    // Payment mode split comes from the shift settlements, which is where the
    // money is actually accounted for at the pump.
    db.$queryRaw<{ cash: string; card: string; upi: string; wallet: string; credit: string }[]>`
      SELECT
        COALESCE(SUM(s."declaredCash"), 0)::text AS cash,
        COALESCE(SUM(s."cardTotal"), 0)::text AS card,
        COALESCE(SUM(s."upiTotal"), 0)::text AS upi,
        COALESCE(SUM(s."walletTotal"), 0)::text AS wallet,
        COALESCE(SUM(s."creditTotal"), 0)::text AS credit
      FROM shift_settlements s
      WHERE s."outletId" = ANY(${outletIds}) AND s."businessDate" BETWEEN ${from} AND ${to}`,
    db.$queryRaw<{ shift: string; sequence: number; litres: string; amount: string }[]>`
      SELECT sh.name AS shift, sh.sequence,
        COALESCE(SUM(e."saleLitres"), 0)::text AS litres,
        COALESCE(SUM(e."totalSaleValue"), 0)::text AS amount
      FROM shift_entries e JOIN shifts sh ON sh.id = e."shiftId"
      WHERE e."outletId" = ANY(${outletIds}) AND e."businessDate" BETWEEN ${from} AND ${to}
      GROUP BY 1, 2 ORDER BY 2`,
    db.$queryRaw<{ shift: string; amount: string }[]>`
      SELECT sh.name AS shift, COALESCE(SUM(e."totalSaleValue"), 0)::text AS amount
      FROM shift_entries e JOIN shifts sh ON sh.id = e."shiftId"
      WHERE e."outletId" = ANY(${outletIds}) AND e."businessDate" BETWEEN ${priorFrom} AND ${addDays(from, -1)}
      GROUP BY 1`,
  ]);

  const priorByShift = new Map(priorShifts.map((row) => [row.shift, dec(row.amount).toNumber()]));
  const split = collections[0] ?? { cash: "0", card: "0", upi: "0", wallet: "0", credit: "0" };

  let totalLitres = new Decimal(0);
  let totalValue = new Decimal(0);
  for (const product of products) {
    totalLitres = totalLitres.plus(dec(product.litres));
    totalValue = totalValue.plus(dec(product.amount));
  }

  if (!viewer.canSeeMoney) {
    // The mix still tells a salesman which product moved; it is measured in
    // litres, and the collection split is withheld entirely.
    return {
      productMix: products.map((product) => ({ name: product.name, value: dec(product.litres).toNumber(), label: f2(round2(dec(product.litres))) })),
      paymentSplit: [],
      shiftComparison: shifts.map((row) => ({ shift: row.shift, litres: dec(row.litres).toNumber(), amount: 0, today: dec(row.litres).toNumber(), previous: 0 })),
      totalLitres: f2(round2(totalLitres)),
      totalValue: "0.00",
    };
  }

  return {
    productMix: products.map((product) => ({ name: product.name, value: dec(product.amount).toNumber(), label: f2(round2(dec(product.litres))) })),
    paymentSplit: [
      { mode: "Cash", amount: dec(split.cash).toNumber(), label: "Cash" },
      { mode: "Card", amount: dec(split.card).toNumber(), label: "Card" },
      { mode: "UPI", amount: dec(split.upi).toNumber(), label: "UPI" },
      { mode: "Wallet", amount: dec(split.wallet).toNumber(), label: "Wallet" },
      { mode: "Credit", amount: dec(split.credit).toNumber(), label: "Credit" },
    ].filter((row) => row.amount !== 0),
    shiftComparison: shifts.map((row) => ({
      shift: row.shift,
      litres: dec(row.litres).toNumber(),
      amount: dec(row.amount).toNumber(),
      today: dec(row.amount).toNumber(),
      previous: priorByShift.get(row.shift) ?? 0,
    })),
    totalLitres: f2(round2(totalLitres)),
    totalValue: f2(round2(totalValue)),
  };
}

// ===========================================================================
// Row 3 — alerts
// ===========================================================================

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Alert = {
  id: string;
  severity: Severity;
  kind: string;
  title: string;
  detail: string;
  href: string;
  amount?: string;
};

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * Every exception the owner must act on, most severe first. Each one links to
 * the screen where it gets resolved — an alert you cannot act on is noise.
 */
export async function getAlerts(range: DateRange, only?: string[], viewer: Viewer = OWNER_VIEW): Promise<Alert[]> {
  const { outletIds, outletId } = await scope(only);
  const from = businessDateFromInput(range.from);
  const to = businessDateFromInput(range.to);
  const today = businessDateToday();
  const settings = outletId ? await loadSettings(outletId) : null;
  const waterAlertMm = settings?.decimal("stock.waterDipAlertMm") ?? new Decimal(25);
  const reminderHorizon = addDays(today, 30);

  const [shortSettlements, variations, densities, waterDips, lowTanks, overLimit, overdueBills, dueReminders, missingShifts] = await Promise.all([
    db.shiftSettlement.findMany({
      where: { outletId: { in: outletIds }, businessDate: { gte: from, lte: to }, shortExcess: { lt: 0 }, withinTolerance: false },
      include: { employee: { select: { name: true, code: true } } },
      orderBy: { shortExcess: "asc" },
      take: 10,
    }),
    db.stockVariation.findMany({
      where: { outletId: { in: outletIds }, businessDate: { gte: from, lte: to }, withinAllowance: false },
      include: { tank: { select: { code: true } }, product: { select: { name: true } } },
      orderBy: { excessLossLitres: "desc" },
      take: 10,
    }),
    db.densityReading.findMany({
      where: { outletId: { in: outletIds }, businessDate: { gte: from, lte: to }, withinTolerance: false },
      include: { tank: { select: { code: true } }, product: { select: { name: true } } },
      orderBy: { businessDate: "desc" },
      take: 10,
    }),
    db.dipReading.findMany({
      where: { outletId: { in: outletIds }, businessDate: { gte: from, lte: to }, waterDipMm: { gt: waterAlertMm } },
      include: { tank: { select: { code: true } } },
      orderBy: { waterDipMm: "desc" },
      take: 10,
    }),
    // One grouped query over the stock ledger, not one per tank: the reorder
    // level is the tank's own alert level, falling back to the product's.
    db.$queryRaw<{ code: string; product: string; litres: string; reorder: string }[]>`
      SELECT t.code, p.name AS product,
        COALESCE(SUM(m.quantity), 0)::text AS litres,
        COALESCE(NULLIF(t."lowLevelAlert", 0), p."reorderLevel", 0)::text AS reorder
      FROM tanks t
      JOIN products p ON p.id = t."productId"
      LEFT JOIN stock_movements m ON NOT m."isCancelled"
        AND (m."fromTankId" = t.id OR m."toTankId" = t.id)
      WHERE t."outletId" = ANY(${outletIds}) AND t.status = 'ACTIVE'
      GROUP BY t.id, t.code, p.name, t."lowLevelAlert", p."reorderLevel"
      HAVING COALESCE(NULLIF(t."lowLevelAlert", 0), p."reorderLevel", 0) > 0
        AND COALESCE(SUM(m.quantity), 0) <= COALESCE(NULLIF(t."lowLevelAlert", 0), p."reorderLevel", 0)
      ORDER BY 3`,
    db.$queryRaw<{ id: string; name: string; code: string; outstanding: string; limit: string }[]>`
      SELECT c.id, c.name, c.code,
        COALESCE(SUM(l.debit - l.credit), 0)::text AS outstanding,
        c."creditLimit"::text AS limit
      FROM customers c
      JOIN accounts a ON a.id = c."accountId"
      LEFT JOIN voucher_lines l ON l."accountId" = a.id AND l."businessDate" <= ${to}
      LEFT JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE c."outletId" = ANY(${outletIds}) AND c."isActive" AND c."creditLimit" > 0
      GROUP BY c.id, c.name, c.code, c."creditLimit"
      HAVING COALESCE(SUM(l.debit - l.credit), 0) > c."creditLimit"
      ORDER BY 4 DESC LIMIT 10`,
    db.bill.findMany({
      where: { outletId: { in: outletIds }, status: "POSTED", type: { in: ["CREDIT", "CONSOLIDATED"] }, dueDate: { lt: today } },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 200,
    }),
    db.reminder.findMany({
      where: { outletId: { in: outletIds }, status: { in: ["OPEN", "SNOOZED"] }, dueDate: { lte: reminderHorizon } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    // A shift with no entry is a hole in the day's numbers.
    db.$queryRaw<{ shift: string; shiftId: string }[]>`
      SELECT sh.name AS shift, sh.id AS "shiftId"
      FROM shifts sh
      WHERE sh."outletId" = ANY(${outletIds}) AND sh."isActive"
        AND NOT EXISTS (
          SELECT 1 FROM shift_entries e
          WHERE e."shiftId" = sh.id AND e."businessDate" = ${to} AND e.status <> 'CANCELLED'
        )
      ORDER BY sh.sequence`,
  ]);

  const alerts: Alert[] = [];

  for (const settlement of shortSettlements) {
    alerts.push({
      id: `short-${settlement.id}`,
      severity: "CRITICAL",
      kind: "CASH_SHORT",
      title: "Cash short at shift close",
      detail: `${settlement.employee.code} ${settlement.employee.name} — ${iso(settlement.businessDate)}`,
      amount: f2(dec(settlement.shortExcess)),
      href: `/pump/settlement?date=${iso(settlement.businessDate)}`,
    });
  }

  for (const variation of variations) {
    alerts.push({
      id: `variation-${variation.id}`,
      severity: "CRITICAL",
      kind: "STOCK_VARIATION",
      title: "Stock variation beyond the permitted allowance",
      detail: `${variation.tank.code} ${variation.product.name} — ${dec(variation.excessLossLitres).toFixed(2)} L over on ${iso(variation.businessDate)}`,
      amount: f2(dec(variation.variationValue)),
      href: `/pump/variation?from=${iso(variation.businessDate)}&to=${iso(variation.businessDate)}`,
    });
  }

  for (const density of densities) {
    alerts.push({
      id: `density-${density.id}`,
      severity: "HIGH",
      kind: "DENSITY",
      title: "Density outside the permitted band",
      detail: `${density.tank.code} ${density.product.name} — ${dec(density.deviation).toFixed(1)} kg/m³ off invoice on ${iso(density.businessDate)}`,
      href: `/pump/density-register?from=${iso(density.businessDate)}&to=${iso(density.businessDate)}`,
    });
  }

  for (const dip of waterDips) {
    alerts.push({
      id: `water-${dip.id}`,
      severity: "HIGH",
      kind: "WATER_DIP",
      title: "Water in the tank above the alert threshold",
      detail: `${dip.tank.code} — ${dec(dip.waterDipMm).toFixed(1)} mm against a ${waterAlertMm.toFixed(1)} mm limit`,
      href: `/pump/dip-density?date=${iso(dip.businessDate)}`,
    });
  }

  for (const tank of lowTanks) {
    alerts.push({
      id: `reorder-${tank.code}`,
      severity: "HIGH",
      kind: "LOW_STOCK",
      title: "Tank at or below the reorder level",
      detail: `${tank.code} ${tank.product} — ${dec(tank.litres).toFixed(2)} L against a ${dec(tank.reorder).toFixed(2)} L reorder level`,
      href: "/inventory/stock-status",
    });
  }

  for (const customer of overLimit) {
    alerts.push({
      id: `limit-${customer.id}`,
      severity: "HIGH",
      kind: "CREDIT_LIMIT",
      title: "Credit limit breached",
      detail: `${customer.code} ${customer.name} — limit ${dec(customer.limit).toFixed(2)}`,
      amount: f2(dec(customer.outstanding)),
      href: "/accounts/debtors",
    });
  }

  // Overdue bills are one alert with a total, not two hundred rows of noise.
  const overdueOpen = overdueBills.filter((bill) => dec(bill.totalAmount).gt(dec(bill.paidAmount)));
  if (overdueOpen.length > 0) {
    const total = overdueOpen.reduce((sum, bill) => sum.plus(dec(bill.totalAmount).minus(dec(bill.paidAmount))), new Decimal(0));
    const oldest = overdueOpen[0];
    alerts.push({
      id: "overdue-bills",
      severity: "MEDIUM",
      kind: "OVERDUE",
      title: `${overdueOpen.length} bill${overdueOpen.length === 1 ? "" : "s"} overdue`,
      detail: `Oldest: ${oldest.customer?.name ?? oldest.customerName ?? "customer"} due ${iso(oldest.dueDate ?? oldest.businessDate)}`,
      amount: f2(round2(total)),
      href: "/accounts/ageing",
    });
  }

  for (const reminder of dueReminders) {
    const days = Math.round((reminder.dueDate.getTime() - today.getTime()) / 86_400_000);
    alerts.push({
      id: `reminder-${reminder.id}`,
      severity: days < 0 ? "HIGH" : "MEDIUM",
      kind: "COMPLIANCE",
      title: reminder.title,
      detail: days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : `Due in ${days} day${days === 1 ? "" : "s"}`,
      href: "/pump/reminders",
    });
  }

  for (const shift of missingShifts) {
    alerts.push({
      id: `pending-${shift.shiftId}`,
      severity: "MEDIUM",
      kind: "PENDING_SHIFT",
      title: "Shift entry not recorded",
      detail: `${shift.shift} on ${range.to}`,
      href: `/pump/shift-entry?date=${range.to}&shift=${shift.shiftId}`,
    });
  }

  const ordered = alerts.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] || left.title.localeCompare(right.title));
  if (viewer.canSeeMoney) return ordered;

  // A salesman sees the operational exceptions he can act on, without any
  // rupee figure and without the outlet's credit position.
  const operational = new Set(["STOCK_VARIATION", "DENSITY", "WATER_DIP", "LOW_STOCK", "PENDING_SHIFT", "COMPLIANCE"]);
  return ordered
    .filter((alert) => operational.has(alert.kind))
    .map((alert) => ({ ...alert, amount: undefined }));
}

// ===========================================================================
// Row 4 — trends
// ===========================================================================

export type TrendPoint = { date: string; label: string; sale: number; profit: number };
export type MonthPoint = { month: string; label: string; profit: number; sale: number };
export type MarginPoint = { date: string; label: string; [product: string]: number | string };

export type Trends = {
  daily: TrendPoint[];
  monthly: MonthPoint[];
  margin: MarginPoint[];
  marginProducts: string[];
};

export async function getTrends(range: DateRange, only?: string[]): Promise<Trends> {
  const { outletIds } = await scope(only);
  const to = businessDateFromInput(range.to);
  const dailyFrom = addDays(to, -29);
  const monthlyFrom = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));

  const [daily, monthly, margins] = await Promise.all([
    db.$queryRaw<{ d: Date; sale: string; cogs: string }[]>`
      SELECT l."businessDate" AS d,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS sale,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS cogs
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" BETWEEN ${dailyFrom} AND ${to}
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ m: string; sale: string; cogs: string; expense: string }[]>`
      SELECT to_char(l."businessDate", 'YYYY-MM') AS m,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS sale,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS cogs,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND NOT g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS expense
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" >= ${monthlyFrom}
      GROUP BY 1 ORDER BY 1`,
    // Margin per litre per product: revenue and cost both carry productId and
    // litres on the line, so this needs no join back to stock.
    db.$queryRaw<{ d: Date; product: string; litres: string; revenue: string; cost: string }[]>`
      SELECT l."businessDate" AS d, p.name AS product,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.quantity END), 0)::text AS litres,
        COALESCE(SUM(CASE WHEN a.nature = 'INCOME' THEN l.credit - l.debit END), 0)::text AS revenue,
        COALESCE(SUM(CASE WHEN a.nature = 'EXPENSE' AND g."isDirectCost" THEN l.debit - l.credit END), 0)::text AS cost
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN products p ON p.id = l."productId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" BETWEEN ${dailyFrom} AND ${to}
        AND p."isFuel"
      GROUP BY 1, 2 ORDER BY 1`,
  ]);

  const shortDate = (value: Date) => value.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

  const marginByDate = new Map<string, MarginPoint>();
  const marginProducts = new Set<string>();
  for (const row of margins) {
    const litres = dec(row.litres);
    if (litres.lte(0)) continue;
    const key = iso(row.d);
    const point = marginByDate.get(key) ?? { date: key, label: shortDate(row.d) };
    point[row.product] = round2(dec(row.revenue).minus(dec(row.cost)).div(litres)).toNumber();
    marginByDate.set(key, point);
    marginProducts.add(row.product);
  }

  return {
    daily: daily.map((row) => ({
      date: iso(row.d),
      label: shortDate(row.d),
      sale: dec(row.sale).toNumber(),
      profit: round2(dec(row.sale).minus(dec(row.cogs))).toNumber(),
    })),
    monthly: monthly.map((row) => ({
      month: row.m,
      label: new Date(`${row.m}-01T00:00:00.000Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
      sale: dec(row.sale).toNumber(),
      profit: round2(dec(row.sale).minus(dec(row.cogs)).minus(dec(row.expense))).toNumber(),
    })),
    margin: [...marginByDate.values()].sort((left, right) => left.date.localeCompare(right.date)),
    marginProducts: [...marginProducts].sort(),
  };
}

// ===========================================================================
// Row 5 — league tables
// ===========================================================================

export type TopCustomer = { id: string; code: string; name: string; outstanding: string; creditLimit: string; overdueDays: number };
export type SalesmanRow = { id: string; code: string; name: string; litres: string; amount: string; shortExcess: string; shifts: number; recoverable: string };

export async function getLeagueTables(range: DateRange, only?: string[], viewer: Viewer = OWNER_VIEW): Promise<{ customers: TopCustomer[]; salesmen: SalesmanRow[] }> {
  const { outletIds } = await scope(only);
  const to = businessDateFromInput(range.to);
  // The salesman league runs for the calendar month the window ends in.
  const monthFrom = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  const [customers, salesmen] = await Promise.all([
    db.$queryRaw<{ id: string; code: string; name: string; outstanding: string; limit: string; oldest: Date | null }[]>`
      SELECT c.id, c.code, c.name,
        COALESCE(SUM(l.debit - l.credit), 0)::text AS outstanding,
        c."creditLimit"::text AS limit,
        MIN(b."dueDate") AS oldest
      FROM customers c
      JOIN accounts a ON a.id = c."accountId"
      LEFT JOIN voucher_lines l ON l."accountId" = a.id AND l."businessDate" <= ${to}
      LEFT JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      LEFT JOIN bills b ON b."customerId" = c.id AND b.status = 'POSTED'
        AND b."dueDate" < ${to} AND b."totalAmount" > b."paidAmount"
      WHERE c."outletId" = ANY(${outletIds}) AND c."isActive"
      GROUP BY c.id, c.code, c.name, c."creditLimit"
      HAVING COALESCE(SUM(l.debit - l.credit), 0) > 0
      ORDER BY 4 DESC LIMIT 10`,
    db.$queryRaw<{ id: string; code: string; name: string; litres: string; amount: string; shortexcess: string; shifts: bigint; recoverable: string }[]>`
      SELECT e.id, e.code, e.name,
        COALESCE(SUM(s."nozzleSaleLitres"), 0)::text AS litres,
        COALESCE(SUM(s."totalSaleValue"), 0)::text AS amount,
        COALESCE(SUM(s."shortExcess"), 0)::text AS shortexcess,
        COUNT(DISTINCT s.id) AS shifts,
        COALESCE((
          SELECT SUM(l2.debit - l2.credit) FROM voucher_lines l2
          JOIN vouchers v2 ON v2.id = l2."voucherId" AND v2.status = 'POSTED'
          WHERE l2."accountId" = e."accountId" AND l2."businessDate" <= ${to}
        ), 0)::text AS recoverable
      FROM employees e
      JOIN shift_settlements s ON s."employeeId" = e.id
        AND s."businessDate" BETWEEN ${monthFrom} AND ${to}
      WHERE e."outletId" = ANY(${outletIds})
      GROUP BY e.id, e.code, e.name, e."accountId"
      ORDER BY 5 DESC`,
  ]);

  if (!viewer.canSeeMoney) {
    // His own line only, and only the figures that are his: litres, the
    // short/excess he is accountable for, and what he owes.
    return {
      customers: [],
      salesmen: salesmen
        .filter((row) => row.id === viewer.employeeId)
        .map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          litres: f2(round2(dec(row.litres))),
          amount: "0.00",
          shortExcess: f2(round2(dec(row.shortexcess))),
          shifts: Number(row.shifts),
          recoverable: f2(round2(dec(row.recoverable))),
        })),
    };
  }

  return {
    customers: customers.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      outstanding: f2(round2(dec(row.outstanding))),
      creditLimit: f2(dec(row.limit)),
      overdueDays: row.oldest ? Math.max(0, Math.round((to.getTime() - row.oldest.getTime()) / 86_400_000)) : 0,
    })),
    salesmen: salesmen.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      litres: f2(round2(dec(row.litres))),
      amount: f2(round2(dec(row.amount))),
      shortExcess: f2(round2(dec(row.shortexcess))),
      shifts: Number(row.shifts),
      recoverable: f2(round2(dec(row.recoverable))),
    })),
  };
}

// ===========================================================================
// The whole dashboard
// ===========================================================================

export type DashboardData = {
  range: DateRange;
  kpis: Kpi[];
  glance: Glance;
  alerts: Alert[];
  trends: Trends;
  customers: TopCustomer[];
  salesmen: SalesmanRow[];
  /** Wall-clock milliseconds the server spent assembling this. */
  elapsedMs: number;
};

const EMPTY_TRENDS: Trends = { daily: [], monthly: [], margin: [], marginProducts: [] };

export async function getDashboard(range: DateRange, only?: string[], viewer: Viewer = OWNER_VIEW): Promise<DashboardData> {
  const started = Date.now();
  const [kpis, glance, alerts, trends, league] = await Promise.all([
    getKpis(range, only, viewer),
    getGlance(range, only, viewer),
    getAlerts(range, only, viewer),
    // Sale and profit trends are the outlet's business, not a salesman's.
    viewer.canSeeMoney ? getTrends(range, only) : Promise.resolve(EMPTY_TRENDS),
    getLeagueTables(range, only, viewer),
  ]);
  return { range, kpis, glance, alerts, trends, customers: league.customers, salesmen: league.salesmen, elapsedMs: Date.now() - started };
}
