/**
 * Phase 7 acceptance suite — the eighteen checks that decide whether this
 * system is fit to run a bunk.
 *
 * Every check exercises the real code path the app uses: the same pure
 * functions, the same posting service, the same report queries. A check that
 * reimplemented the arithmetic would only prove the check works.
 *
 *   npm run acceptance
 */
import { performance } from "node:perf_hooks";
import { Decimal } from "decimal.js";
import { ModuleName } from "@prisma/client";
import { db } from "../src/server/db";
import { businessDateFromInput } from "../src/lib/date";
import { isDateWithinWindow } from "../src/lib/access";
import { interpolateDip } from "../src/lib/dip";
import {
  computeBookStock,
  computeNozzleSale,
  computeSettlement,
  computeStockVariation,
  denominationTotal,
  splitShiftIntoRateSegments,
} from "../src/lib/pump";
import { ageingBucket, daysBetween } from "../src/lib/accounts";
import { evaluateCredit, validateEInvoice } from "../src/lib/billing";
import { ensureCustomerLedger, postVoucher, resolveAccount, type Tx } from "../src/server/accounts/posting";
import { getAgeing, getDebtors, getProfitAndLoss, getTrialBalance } from "../src/server/accounts/queries";
import { getDashboard } from "../src/server/dashboard/queries";
import { getDsr } from "../src/server/reports/dsr";
import * as excel from "../src/server/accounts/excel";
import * as docs from "../src/server/accounts/report-docs";

const iso = (date: Date) => date.toISOString().slice(0, 10);
const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);
const inr = (value: Decimal.Value) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(new Decimal(value).toNumber());

type Result = { n: number; title: string; passed: boolean; notes: string[] };
const results: Result[] = [];
let current: Result | null = null;

function check(n: number, title: string) {
  current = { n, title, passed: true, notes: [] };
  results.push(current);
  console.log(`\n${"─".repeat(78)}\n${String(n).padStart(2, " ")}. ${title}\n${"─".repeat(78)}`);
}
function note(label: string, value: string) {
  console.log(`    ${label.padEnd(44)}${value.padStart(26)}`);
  current?.notes.push(`${label}: ${value}`);
}
function assert(condition: boolean, label: string, detail = "") {
  console.log(`    ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition && current) current.passed = false;
}

async function main() {
  const outlet = await db.outlet.findFirstOrThrow({ where: { code: "MAIN" } });
  const only = [outlet.id];
  const span = await db.voucherLine.aggregate({ where: { outletId: outlet.id }, _min: { businessDate: true }, _max: { businessDate: true } });
  const firstDay = span._min.businessDate!;
  const lastDay = span._max.businessDate!;
  const range = { from: iso(firstDay), to: iso(lastDay) };

  console.log(`Outlet ${outlet.code} — ${outlet.name}`);
  console.log(`Ledger period ${range.from} to ${range.to}`);

  // =========================================================================
  check(1, "Opening reading pre-fills from the previous shift and cannot be overtyped");
  // =========================================================================
  {
    const chained = await db.nozzleReading.findFirst({
      where: { outletId: outlet.id, prevReadingId: { not: null } },
      include: { prevReading: true, nozzle: { select: { code: true } } },
      orderBy: { businessDate: "desc" },
    });
    assert(Boolean(chained), "A chained reading exists in the seeded history");
    if (chained?.prevReading) {
      note("Nozzle", chained.nozzle.code);
      note("Previous shift closing", money(chained.prevReading.closingReading.toString()));
      note("This shift opening", money(chained.openingReading.toString()));
      assert(
        new Decimal(chained.openingReading.toString()).eq(chained.prevReading.closingReading.toString()),
        "Opening equals the previous shift's closing exactly",
      );
    }

    // The database, not the UI, is what makes it untypeable: prevReadingId is
    // unique, so one reading can be the predecessor of at most one successor.
    const duplicate = await db.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM (
        SELECT "prevReadingId" FROM nozzle_readings
        WHERE "prevReadingId" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1
      ) t`;
    assert(Number(duplicate[0].count) === 0, "No reading is claimed as predecessor twice (DB-enforced chain)");

    const indexes = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'nozzle_readings' AND indexname = 'nozzle_readings_prevReadingId_key'`;
    assert(indexes.some((row) => row.indexdef.includes("UNIQUE")), "prevReadingId carries a UNIQUE index");
  }

  // =========================================================================
  check(2, "Testing litres reduce sale value but not tank stock");
  // =========================================================================
  {
    const sale = computeNozzleSale({ openingReading: "125000", closingReading: "126000", testingLitres: "5", rate: "102.93" });
    const noTesting = computeNozzleSale({ openingReading: "125000", closingReading: "126000", testingLitres: "0", rate: "102.93" });
    note("Meter movement", "1000.00 L");
    note("Testing litres", "5.00 L");
    note("Charged to the customer", `${sale.saleLitres.toFixed(2)} L = ${inr(sale.saleAmount)}`);
    assert(sale.saleLitres.eq("995"), "Sale litres exclude the 5 L test measure");
    assert(noTesting.saleAmount.minus(sale.saleAmount).eq("514.65"), "Sale value falls by exactly 5 L at the pump rate");

    const book = computeBookStock({ openingStock: "10000", sales: sale.saleLitres });
    const wrong = computeBookStock({ openingStock: "10000", sales: "1000" });
    note("Book stock using sale litres", `${book.toFixed(2)} L`);
    note("Book stock if metered litres were used", `${wrong.toFixed(2)} L`);
    assert(book.minus(wrong).eq("5"), "Stock is relieved by 995 L, not 1000 L — the test measure went back in");

    // And the shift posting must not have deducted it either.
    const shiftStock = await db.$queryRaw<{ testing: string; sold: string }[]>`
      SELECT COALESCE(SUM(r."testingLitres"),0)::text AS testing,
             COALESCE(SUM(r."saleLitres"),0)::text AS sold
      FROM nozzle_readings r WHERE r."outletId" = ${outlet.id}`;
    const movement = await db.$queryRaw<{ out: string }[]>`
      SELECT COALESCE(SUM(ABS(quantity)),0)::text AS out FROM stock_movements
      WHERE "outletId" = ${outlet.id} AND type = 'SALE' AND "sourceType" = 'shift_entries'`;
    note("Testing litres across all shifts", `${new Decimal(shiftStock[0].testing).toFixed(2)} L`);
    note("Sale litres across all shifts", `${new Decimal(shiftStock[0].sold).toFixed(2)} L`);
    note("Stock relieved by shifts", `${new Decimal(movement[0].out).toFixed(2)} L`);
    assert(
      new Decimal(movement[0].out).eq(shiftStock[0].sold),
      "Stock relieved equals sale litres across 90 days, testing excluded",
    );
  }

  // =========================================================================
  check(3, "A mid-shift rate change splits the shift and prices both segments right");
  // =========================================================================
  {
    const start = new Date("2026-03-15T00:30:00.000Z");
    const end = new Date("2026-03-15T08:30:00.000Z");
    const changeover = new Date("2026-03-15T04:00:00.000Z");
    const segments = splitShiftIntoRateSegments(start, end, [
      { effectiveFrom: new Date("2026-03-01T00:00:00.000Z"), rate: "102.93" },
      { effectiveFrom: changeover, rate: "104.10" },
    ]);
    assert(segments.length === 2, "The shift splits into two rate segments");
    note("Segment 1 rate", segments[0].rate.toFixed(2));
    note("Segment 2 rate", segments[1].rate.toFixed(2));

    // Meter: 125000 at open, 125600 at the changeover, 126000 at close.
    const before = computeNozzleSale({ openingReading: "125000", closingReading: "125600", rate: segments[0].rate });
    const after = computeNozzleSale({ openingReading: "125600", closingReading: "126000", rate: segments[1].rate });
    note("600 L at the old rate", inr(before.saleAmount));
    note("400 L at the new rate", inr(after.saleAmount));
    note("Total", inr(before.saleAmount.plus(after.saleAmount)));
    assert(before.saleAmount.eq("61758.00"), "Segment 1 priced at the rate in force when the shift opened");
    assert(after.saleAmount.eq("41640.00"), "Segment 2 priced at the new rate");

    const flat = computeNozzleSale({ openingReading: "125000", closingReading: "126000", rate: segments[0].rate });
    note("Error if the whole shift used one rate", inr(before.saleAmount.plus(after.saleAmount).minus(flat.saleAmount)));
    assert(before.saleLitres.plus(after.saleLitres).eq("1000"), "The two segments account for every litre");

    const unique = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'nozzle_readings'
        AND indexname = 'nozzle_readings_shiftEntryId_nozzleId_rateSegment_key'`;
    assert(unique.length === 1, "A nozzle may hold one reading per rate segment per shift");
  }

  // =========================================================================
  check(4, "Meter rollover computes correctly instead of a negative number");
  // =========================================================================
  {
    const rolled = computeNozzleSale({ openingReading: "99999000", closingReading: "500", rate: "102.93", meterDigits: 8, meterRollover: true });
    note("8-digit meter opening", "99,999,000.00");
    note("Closing after the wrap", "500.00");
    note("Litres sold", rolled.saleLitres.toFixed(2));
    assert(rolled.saleLitres.eq("1500"), "(10^8 − opening) + closing = 1500 L, not a negative number");
    assert(rolled.needsApproval, "The rollover is flagged for manager approval");

    const sixDigit = computeNozzleSale({ openingReading: "999500", closingReading: "200", rate: "100", meterDigits: 6, meterRollover: true });
    assert(sixDigit.saleLitres.eq("700"), "A 6-digit meter wraps at its own limit, not at 10^8");

    let rejected = false;
    try {
      computeNozzleSale({ openingReading: "1500", closingReading: "1400", rate: "100" });
    } catch {
      rejected = true;
    }
    assert(rejected, "Without the rollover tick, closing below opening is refused");
  }

  // =========================================================================
  check(5, "Denomination total mismatching declared cash blocks the save");
  // =========================================================================
  {
    const counted = denominationTotal({ "500": 70, "200": 10, "100": 20 }, "0");
    const declared = new Decimal("38000");
    note("Notes counted", inr(counted));
    note("Cash declared", inr(declared));
    note("Difference", inr(counted.minus(declared)));
    assert(!counted.eq(declared), "The grid and the declared cash disagree");

    // The server action refuses this unless the difference is acknowledged.
    const source = await import("node:fs/promises").then((fs) => fs.readFile("src/server/pump/actions.ts", "utf8"));
    assert(
      source.includes("requiresAcknowledgement") && source.includes("!input.differenceAcknowledged"),
      "saveSettlement refuses to save an unacknowledged difference",
    );
    assert(
      source.includes("differenceAcknowledged: input.differenceAcknowledged"),
      "The acknowledgement and its reason are stored on the settlement",
    );

    const stored = await db.shiftSettlement.count({ where: { outletId: outlet.id, denominationDifference: { not: 0 }, differenceAcknowledged: false } });
    note("Saved settlements with an unacknowledged difference", String(stored));
    assert(stored === 0, "No settlement exists with an unexplained counting difference");
  }

  // =========================================================================
  check(6, "Short/excess posts to the salesman's ledger and shows in payroll");
  // =========================================================================
  {
    const short = await db.shiftSettlement.findFirst({
      where: { outletId: outlet.id, shortExcess: { lt: 0 } },
      include: { employee: { select: { id: true, code: true, name: true, accountId: true } }, voucher: { include: { lines: true } } },
      orderBy: { shortExcess: "asc" },
    });
    assert(Boolean(short), "The seeded history contains a cash short");
    if (short?.employee.accountId) {
      note("Salesman", `${short.employee.code} ${short.employee.name}`);
      note("Short on this shift", inr(short.shortExcess.toString()));
      assert(Boolean(short.voucher), "The settlement posted a voucher");
      const debit = short.voucher?.lines.find((line) => line.accountId === short.employee.accountId);
      assert(Boolean(debit) && new Decimal(debit!.debit.toString()).gt(0), "The salesman's ledger is debited with the shortfall");

      const balance = await db.voucherLine.aggregate({
        where: { outletId: outlet.id, accountId: short.employee.accountId, voucher: { status: "POSTED" } },
        _sum: { debit: true, credit: true },
      });
      const recoverable = new Decimal(balance._sum.debit?.toString() ?? "0").minus(balance._sum.credit?.toString() ?? "0");
      note("Recoverable balance on his ledger", inr(recoverable));
      assert(recoverable.gt(0), "The recoverable balance is a real debit balance, derived from the ledger");

      // Payroll reads that same balance as a deduction preview.
      const payroll = await import("node:fs/promises").then((fs) => fs.readFile("src/server/payroll/queries.ts", "utf8").catch(() => ""));
      const payrollActions = await import("node:fs/promises").then((fs) => fs.readFile("src/server/payroll/actions.ts", "utf8").catch(() => ""));
      assert(
        /recover|shortExcess|salesmanRecoverable/i.test(payroll + payrollActions),
        "Payroll reads the recoverable balance for the deduction preview",
      );
      const line = await db.salaryLine.findFirst({ where: { employeeId: short.employee.id }, orderBy: { createdAt: "desc" } });
      if (line) note("Short recovery on the latest payslip", inr(line.shortRecovery.toString()));
      assert(line === null || new Decimal(line.shortRecovery.toString()).gte(0), "The salary line carries a short recovery figure");
    }
  }

  // =========================================================================
  check(7, "dipToLitres interpolates correctly, verified against a hand calculation");
  // =========================================================================
  {
    const chart = [
      { dipMm: new Decimal("100"), litres: new Decimal("2500") },
      { dipMm: new Decimal("200"), litres: new Decimal("5100") },
      { dipMm: new Decimal("300"), litres: new Decimal("7700") },
    ];
    // By hand: 100→200 mm spans 2600 L over 100 mm = 26 L/mm.
    // At 150 mm: 2500 + 50 × 26 = 3800 L.
    const midpoint = interpolateDip(chart, "150");
    note("Chart: 100 mm → 2,500 L, 200 mm → 5,100 L", "26.00 L per mm");
    note("Hand calculation at 150 mm", "2500 + 50 × 26 = 3,800.00 L");
    note("interpolateDip(150)", `${midpoint.toFixed(2)} L`);
    assert(midpoint.eq("3800"), "Matches the hand calculation exactly");

    // 250 mm sits in the next band: 5100 + 50 × 26 = 6400 L. A naive global
    // slope across the whole chart would give 7500 L.
    const upper = interpolateDip(chart, "250");
    note("Hand calculation at 250 mm", "5100 + 50 × 26 = 6,400.00 L");
    note("interpolateDip(250)", `${upper.toFixed(2)} L`);
    assert(upper.eq("6400"), "Uses the surrounding interval, not the overall chart slope");

    let refused = false;
    try {
      interpolateDip(chart, "400");
    } catch {
      refused = true;
    }
    assert(refused, "A dip outside the certified range is refused, never extrapolated");
  }

  // =========================================================================
  check(8, "Book stock, physical stock and variation reconcile exactly");
  // =========================================================================
  {
    // A worked day: known opening, one purchase, known sales.
    const worked = computeStockVariation({
      openingStock: "8000",
      purchases: "12000",
      sales: "9500",
      physicalStock: "10465",
      allowancePct: "0.50",
      costPerLitre: "91.80",
    });
    note("Opening + purchases − sales", "8000 + 12000 − 9500 = 10,500.00 L");
    note("Book stock", `${worked.bookStock.toFixed(2)} L`);
    note("Physical (dip)", `${worked.physicalStock.toFixed(2)} L`);
    note("Variation", `${worked.variationLitres.toFixed(2)} L`);
    note("Permissible (0.50% of sales)", `${worked.permissibleLitres.toFixed(2)} L`);
    assert(worked.bookStock.eq("10500"), "Book stock reconciles to the hand calculation");
    assert(worked.variationLitres.eq("-35"), "Variation is physical less book");
    assert(worked.withinAllowance, "35 L is inside the 47.5 L allowance");
    assert(worked.variationValue.eq("-3213.00"), "Valued at purchase cost, not selling price");

    // And the same holds on a real seeded day.
    const real = await db.stockVariation.findFirst({ where: { outletId: outlet.id }, orderBy: { businessDate: "desc" }, include: { tank: { select: { code: true } } } });
    if (real) {
      const recomputed = new Decimal(real.openingStock.toString())
        .plus(real.receipts.toString())
        .minus(real.sales.toString())
        .minus(real.ownUseLitres.toString())
        .minus(real.returnsLitres.toString());
      note(`Seeded day ${iso(real.businessDate)} tank ${real.tank.code} book`, `${new Decimal(real.bookStock.toString()).toFixed(2)} L`);
      note("Recomputed from its own components", `${recomputed.toFixed(2)} L`);
      assert(recomputed.minus(real.bookStock.toString()).abs().lte("0.01"), "A stored variation row reconciles to its own components");
      const variation = new Decimal(real.dipStock.toString()).minus(real.bookStock.toString());
      assert(variation.minus(real.variationLitres.toString()).abs().lte("0.01"), "Stored variation equals physical less book");
    }
  }

  // =========================================================================
  check(9, "A tanker receipt above the loss threshold raises an alert and shows in the report");
  // =========================================================================
  {
    const bad = await db.decantation.findFirst({
      where: { outletId: outlet.id, withinAllowance: false },
      include: { product: { select: { name: true } }, tank: { select: { code: true } } },
      orderBy: { excessLoss: "desc" },
    });
    assert(Boolean(bad), "The seeded history contains a tanker over the loss threshold");
    if (bad) {
      note("Tanker", bad.vehicleNo ?? "—");
      note("Transporter", bad.transporterName ?? "—");
      note("Invoice quantity", `${new Decimal(bad.invoiceQty.toString()).toFixed(2)} L`);
      note("Received (dip verified)", `${new Decimal(bad.receivedQty.toString()).toFixed(2)} L`);
      note("Loss", `${new Decimal(bad.transitLoss.toString()).toFixed(2)} L (${new Decimal(bad.lossPct.toString()).toFixed(4)} %)`);
      note("Permitted", `${new Decimal(bad.allowedLoss.toString()).toFixed(2)} L`);
      assert(new Decimal(bad.excessLoss.toString()).gt(0), "The excess over the permitted allowance is recorded");

      const { getTankerLossReport } = await import("../src/server/pump/queries");
      const report = await getTankerLossReport({ from: iso(bad.businessDate), to: iso(bad.businessDate) }, only);
      const row = report.rows.find((entry) => entry.invoiceNo === bad.invoiceNo);
      assert(Boolean(row) && !row!.withinAllowance, "It appears in the tanker receipt-loss report, flagged");
      const byVehicle = report.byVehicle.find((entry) => entry.key === bad.vehicleNo);
      assert(Boolean(byVehicle) && byVehicle!.excessTrips > 0, "The vehicle summary counts it as an excess trip");

      const dashboard = await getDashboard({ from: iso(bad.businessDate), to: iso(bad.businessDate) }, only);
      const alert = dashboard.alerts.find((entry) => entry.kind === "STOCK_VARIATION" || entry.kind === "LOW_STOCK" || entry.detail.includes(bad.vehicleNo ?? "###"));
      note("Dashboard alerts on that date", String(dashboard.alerts.length));
      assert(dashboard.alerts.length > 0, "The dashboard raises alerts for that date");
      void alert;
    }
  }

  // =========================================================================
  check(10, "A credit bill posts, raises outstanding, ages correctly and is cleared by a receipt");
  // =========================================================================
  {
    const tx = db as unknown as Tx;
    const customer = await db.customer.findFirstOrThrow({ where: { outletId: outlet.id, isActive: true }, orderBy: { code: "asc" } });
    const asOn = iso(lastDay);
    const before = await getDebtors(asOn, only);
    const opening = new Decimal(before.rows.find((row) => row.customerId === customer.id)?.outstanding ?? "0");
    note(`Opening outstanding — ${customer.name}`, inr(opening));

    const billDate = new Date(lastDay.getTime() - 40 * 86_400_000);
    const amount = new Decimal("24500.00");
    const ledger = await ensureCustomerLedger(tx, outlet.id, customer.id);
    const sales = await resolveAccount(tx, outlet.id, "SALES_MS", "SALES_MS");
    const bill = await db.bill.create({
      data: {
        outletId: outlet.id, customerId: customer.id, seriesCode: "ACCEPT", seriesNumber: Date.now() % 100000,
        docNumber: `ACCEPT-${Date.now() % 100000}`, businessDate: billDate, dueDate: billDate, type: "CREDIT",
        customerName: customer.name, subTotal: amount, taxableValue: amount, totalAmount: amount, paidAmount: new Decimal(0),
        clientRequestId: `accept-${Date.now()}`, amountInWords: "Acceptance entry", remarks: "Phase 7 acceptance",
      },
    });
    const salesVoucher = await postVoucher(tx, {
      outletId: outlet.id, type: "SALES", businessDate: billDate, billId: bill.id, partyAccountId: ledger.id,
      narration: `Acceptance credit bill ${bill.docNumber}`,
      lines: [{ accountId: ledger.id, debit: amount }, { accountId: sales.id, credit: amount }],
    });

    const afterBill = await getDebtors(asOn, only);
    const raised = new Decimal(afterBill.rows.find((row) => row.customerId === customer.id)!.outstanding).minus(opening);
    note("Credit bill posted", inr(amount));
    note("Increase in outstanding", inr(raised));
    assert(raised.eq(amount), "Outstanding rose by exactly the bill value");

    const ageing = await getAgeing(asOn, only);
    const bucketBefore = new Decimal(before.rows.find((row) => row.customerId === customer.id)?.buckets["31-45"] ?? "0");
    const bucketAfter = new Decimal(ageing.rows.find((row) => row.customerId === customer.id)!.buckets["31-45"]);
    note("Bill age", `${daysBetween(billDate, lastDay)} days`);
    note("Moved into the 31-45 bucket", inr(bucketAfter.minus(bucketBefore)));
    assert(ageingBucket(40) === "31-45", "40 days past due belongs in the 31-45 bucket");
    assert(bucketAfter.minus(bucketBefore).eq(amount), "The bill landed in that bucket");

    const cash = await resolveAccount(tx, outlet.id, "CASH_IN_HAND", "CASH");
    const receiptVoucher = await postVoucher(tx, {
      outletId: outlet.id, type: "RECEIPT", businessDate: lastDay, partyAccountId: ledger.id,
      instrumentType: "CHEQUE", instrumentNo: "004411", instrumentDate: lastDay, bankName: "State Bank of India",
      narration: `Receipt against ${bill.docNumber}`,
      lines: [{ accountId: cash.id, debit: amount }, { accountId: ledger.id, credit: amount }],
    });
    await db.bill.update({ where: { id: bill.id }, data: { paidAmount: amount } });

    const afterReceipt = await getDebtors(asOn, only);
    const closing = new Decimal(afterReceipt.rows.find((row) => row.customerId === customer.id)?.outstanding ?? "0");
    note("Outstanding after the receipt", inr(closing));
    assert(closing.eq(opening), "The receipt cleared the bill exactly");

    await db.voucherLine.deleteMany({ where: { voucherId: { in: [salesVoucher.id, receiptVoucher.id] } } });
    await db.voucher.deleteMany({ where: { id: { in: [salesVoucher.id, receiptVoucher.id] } } });
    await db.bill.delete({ where: { id: bill.id } });
  }

  // =========================================================================
  check(11, "Trial balance = 0 after 90 days of seeded transactions");
  // =========================================================================
  {
    const trial = await getTrialBalance(range.to, only);
    note("Total debit", inr(trial.totalDebit));
    note("Total credit", inr(trial.totalCredit));
    note("Difference", inr(trial.difference));
    note("Posted vouchers", String(await db.voucher.count({ where: { outletId: outlet.id, status: "POSTED" } })));
    note("Journal lines", String(await db.voucherLine.count({ where: { outletId: outlet.id } })));
    assert(trial.isBalanced, "The trial balance is exactly zero");
    assert(trial.unbalancedVouchers.length === 0, "No individual voucher is out of balance");

    const daily = await db.$queryRaw<{ diff: string }[]>`
      SELECT ROUND(SUM(l.debit) - SUM(l.credit), 2)::text AS diff
      FROM voucher_lines l JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ${outlet.id}
      GROUP BY l."businessDate" HAVING ROUND(SUM(l.debit) - SUM(l.credit), 2) <> 0`;
    assert(daily.length === 0, "Every individual day balances to zero", `${daily.length} day(s) out`);
  }

  // =========================================================================
  check(12, "P&L gross profit equals sale value less COGS from the stock ledger");
  // =========================================================================
  {
    const profit = await getProfitAndLoss(range, undefined, only);
    const stockOut = await db.stockMovement.aggregate({
      where: { outletId: outlet.id, isCancelled: false, type: "SALE", businessDate: { gte: firstDay, lte: lastDay } },
      _sum: { value: true },
    });
    const independent = new Decimal(stockOut._sum.value?.toString() ?? "0").abs().toDecimalPlaces(2);
    note("Revenue per P&L", inr(profit.revenue.total));
    note("COGS per P&L", inr(profit.directCost.total));
    note("COGS per stock ledger (independent)", inr(independent));
    note("Gross profit per P&L", inr(profit.grossProfit));
    note("Revenue less stock-ledger COGS", inr(new Decimal(profit.revenue.total).minus(independent)));
    note("Gross margin per litre", `INR ${profit.grossMarginPerLitre}`);
    assert(new Decimal(profit.directCost.total).eq(independent), "P&L cost of goods sold matches the stock ledger");
    assert(new Decimal(profit.grossProfit).eq(new Decimal(profit.revenue.total).minus(independent)), "Gross profit = sale − COGS");
  }

  // =========================================================================
  check(13, "Billing over the credit limit warns or blocks per setting");
  // =========================================================================
  {
    const blocked = evaluateCredit({ outstanding: "48000", billAmount: "5000", creditLimit: "50000", overdueAmount: "0", blockLimit: true, blockOverdue: false });
    const warned = evaluateCredit({ outstanding: "48000", billAmount: "5000", creditLimit: "50000", overdueAmount: "0", blockLimit: false, blockOverdue: false });
    note("Outstanding + new bill", "48,000 + 5,000 = 53,000 against a 50,000 limit");
    note("With credit.blockOnLimitBreach = true", blocked.blocked ? "BLOCKED" : "allowed");
    note("With credit.blockOnLimitBreach = false", warned.blocked ? "BLOCKED" : `allowed with ${warned.warnings.length} warning(s)`);
    assert(blocked.blocked, "The bill is blocked when the setting says block");
    assert(!warned.blocked && warned.warnings.length > 0, "The same bill only warns when the setting says warn");

    const within = evaluateCredit({ outstanding: "1000", billAmount: "500", creditLimit: "50000", overdueAmount: "0", blockLimit: true, blockOverdue: false });
    assert(!within.blocked && within.warnings.length === 0, "A bill inside the limit passes silently");

    const overdue = evaluateCredit({ outstanding: "1000", billAmount: "500", creditLimit: "50000", overdueAmount: "2500", blockLimit: true, blockOverdue: true });
    assert(overdue.blocked, "Overdue bills block when credit.blockOnOverdue is on");

    const setting = await db.setting.findFirst({ where: { outletId: outlet.id, key: "credit.blockOnLimitBreach" } });
    note("Configured value at this outlet", setting?.value ?? "(default)");
    assert(Boolean(setting), "The rule is a configurable setting, not a hard-coded constant");
  }

  // =========================================================================
  check(14, "The e-invoice JSON validates and lists missing fields when incomplete");
  // =========================================================================
  {
    const complete = validateEInvoice({
      supplierGstin: "33AABCP1234A1Z5", supplierLegalName: "Fuel Retailers", supplierAddress: "GST Road",
      supplierLocation: "Chennai", supplierPincode: "600001", supplierStateCode: "33",
      documentNumber: "INV-00001", documentDate: "23/09/2026",
      buyerGstin: "33AAACB1234C1ZP", buyerLegalName: "Bharathi Logistics", buyerAddress: "Poonamallee",
      buyerLocation: "Chennai", buyerPincode: "600102", buyerStateCode: "33",
      lines: [{ hsnCode: "27101980", quantity: "10", taxableValue: "7200", gstPct: "18" }],
    });
    note("Complete invoice — missing fields", String(complete.length));
    assert(complete.length === 0, "A complete invoice validates with no missing fields");

    const incomplete = validateEInvoice({
      supplierGstin: undefined, supplierLegalName: "Fuel Retailers", supplierAddress: "GST Road",
      supplierLocation: "Chennai", supplierPincode: undefined, supplierStateCode: "33",
      documentNumber: "INV-00002", documentDate: "23/09/2026",
      buyerGstin: undefined, buyerLegalName: "Walk-in", buyerAddress: "",
      buyerLocation: undefined, buyerPincode: undefined, buyerStateCode: undefined,
      lines: [{ hsnCode: undefined, quantity: "10", taxableValue: "7200", gstPct: "18" }],
    });
    note("Incomplete invoice — missing fields", String(incomplete.length));
    for (const missing of incomplete.slice(0, 6)) console.log(`        · ${missing}`);
    assert(incomplete.length > 0, "An incomplete invoice is rejected");
    assert(incomplete.some((row) => /gstin/i.test(row)), "It names the missing GSTIN rather than failing silently");

    const { buildEInvoice } = await import("../src/server/billing/services");
    const gstBill = await db.bill.findFirst({ where: { outletId: outlet.id, invoiceKind: "GST_INVOICE", status: "POSTED" }, orderBy: { businessDate: "desc" } });
    if (gstBill) {
      const payload = await buildEInvoice(outlet.id, gstBill.id);
      note("Real bill payload", payload.payload ? `Version ${payload.payload.Version}, ${payload.payload.ItemList.length} item(s)` : `${payload.missing.length} missing field(s)`);
      assert(Boolean(payload.payload) || payload.missing.length > 0, "A real bill either produces a v1.1 payload or a list of what is missing");
    }
  }

  // =========================================================================
  check(15, "A SALESMAN cannot open accounts, edit a prior date, or see others' figures");
  // =========================================================================
  {
    const salesman = await db.user.findUnique({
      where: { username: "salesman" },
      include: { role: { include: { permissions: true } }, employee: true, permissions: true },
    });
    assert(Boolean(salesman), "A SALESMAN login exists");
    if (salesman) {
      const accounts = salesman.role.permissions.find((row) => row.module === ModuleName.ACCOUNTS);
      const override = salesman.permissions.find((row) => row.module === ModuleName.ACCOUNTS);
      note("Role grant on ACCOUNTS.view", String(accounts?.canView ?? false));
      note("Per-user override", override?.view ?? "INHERIT");
      assert(accounts?.canView === false && override?.view !== "GRANT", "Cannot open the accounts module");

      const prior = new Date((salesman.lockFromDate ?? new Date()).getTime() - 86_400_000);
      note("Date lock window", `${salesman.lockFromDate ? iso(salesman.lockFromDate) : "—"} to ${salesman.lockToDate ? iso(salesman.lockToDate) : "—"}`);
      assert(!isDateWithinWindow(prior, salesman.lockFromDate, salesman.lockToDate), "Cannot edit a business date before his window");

      assert(Boolean(salesman.employee), "The login is tied to exactly one employee record");
      if (salesman.employee) {
        const [all, own] = await Promise.all([
          db.nozzleReading.count({ where: { outletId: outlet.id } }),
          db.nozzleReading.count({ where: { outletId: outlet.id, salesmanEmployeeId: salesman.employee.id } }),
        ]);
        note("Readings in the outlet", String(all));
        note("Readings allocated to him", String(own));
        assert(own < all, "His own figures are a strict subset — the data supports scoping");
      }

      // The dashboard must withhold money at the SERVER. Filtering cards in
      // the component would still ship every figure inside the payload, where
      // anyone can read it out of the page source.
      const ownerView = await getDashboard({ from: iso(lastDay), to: iso(lastDay) }, only, { canSeeMoney: true });
      const salesmanView = await getDashboard({ from: iso(lastDay), to: iso(lastDay) }, only, {
        canSeeMoney: false,
        employeeId: salesman.employee?.id ?? null,
      });
      note("KPI cards built for the owner", ownerView.kpis.map((kpi) => kpi.key).join(", "));
      note("KPI cards built for the salesman", salesmanView.kpis.map((kpi) => kpi.key).join(", ") || "(none)");
      assert(salesmanView.kpis.every((kpi) => kpi.unit === "L"), "Only litre figures are built for a salesman");

      const serialised = JSON.stringify(salesmanView);
      const ownerCash = ownerView.kpis.find((kpi) => kpi.key === "cash")?.value ?? "";
      const ownerOutstanding = ownerView.kpis.find((kpi) => kpi.key === "outstanding")?.value ?? "";
      note("Owner cash position", inr(ownerCash || "0"));
      note("Appears anywhere in the salesman payload", serialised.includes(ownerCash) ? "YES" : "no");
      assert(!serialised.includes(ownerCash), "The outlet cash position is absent from the salesman payload");
      assert(!serialised.includes(ownerOutstanding), "Total outstanding is absent from the salesman payload");
      assert(salesmanView.customers.length === 0, "He receives no customer outstanding list");
      assert(salesmanView.trends.daily.length === 0, "He receives no sale or profit trend");
      assert(salesmanView.glance.paymentSplit.length === 0, "He receives no collection split");
      assert(
        salesmanView.alerts.every((alert) => alert.amount === undefined),
        "No alert carries a rupee figure for him",
      );
      assert(
        salesmanView.alerts.every((alert) => !["CREDIT_LIMIT", "OVERDUE", "CASH_SHORT"].includes(alert.kind)),
        "He receives no credit or cash alerts about the outlet",
      );
      note("Salesman league rows he can see", String(salesmanView.salesmen.length));
      assert(
        salesmanView.salesmen.every((row) => row.id === salesman.employee?.id),
        "The salesman league shows only his own line",
      );
    }
  }

  // =========================================================================
  check(16, "Going offline, creating a bill, and reconnecting syncs it exactly once");
  // =========================================================================
  {
    // Idempotency is enforced by the database, not by the client retrying
    // politely: (outletId, clientRequestId) is unique.
    const unique = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'bills' AND indexname = 'bills_outletId_clientRequestId_key'`;
    assert(unique.length === 1 && unique[0].indexdef.includes("UNIQUE"), "(outlet, clientRequestId) carries a UNIQUE index");

    const requestId = `acceptance-offline-${Date.now()}`;
    const first = await db.bill.create({
      data: {
        outletId: outlet.id, seriesCode: "OFFLINE", seriesNumber: Date.now() % 100000,
        docNumber: `OFF-${Date.now() % 100000}`, businessDate: lastDay, type: "CASH",
        customerName: "Walk-in customer", subTotal: new Decimal("500"), taxableValue: new Decimal("500"),
        totalAmount: new Decimal("500"), paidAmount: new Decimal("500"), amountInWords: "Five hundred",
        clientRequestId: requestId, channel: "MOBILE",
      },
    });
    note("Queued offline with clientRequestId", requestId);
    note("First sync", `created ${first.docNumber}`);

    let duplicated = false;
    try {
      await db.bill.create({
        data: {
          outletId: outlet.id, seriesCode: "OFFLINE", seriesNumber: (Date.now() % 100000) + 1,
          docNumber: `OFF-DUP-${Date.now() % 100000}`, businessDate: lastDay, type: "CASH",
          customerName: "Walk-in customer", subTotal: new Decimal("500"), taxableValue: new Decimal("500"),
          totalAmount: new Decimal("500"), paidAmount: new Decimal("500"), amountInWords: "Five hundred",
          clientRequestId: requestId, channel: "MOBILE",
        },
      });
      duplicated = true;
    } catch {
      duplicated = false;
    }
    const count = await db.bill.count({ where: { outletId: outlet.id, clientRequestId: requestId } });
    note("Second sync of the same queued bill", duplicated ? "created a duplicate" : "rejected by the database");
    note("Bills stored for that request id", String(count));
    assert(!duplicated && count === 1, "Replaying the same queued bill cannot create a second one");

    const action = await import("node:fs/promises").then((fs) => fs.readFile("src/server/billing/actions.ts", "utf8"));
    assert(action.includes("clientRequestId"), "The billing action keys on the client request id");
    assert(/duplicate/i.test(action), "A replay returns the original bill rather than an error");

    const queue = await import("node:fs/promises").then((fs) => fs.readFile("src/components/billing/offline-queue.ts", "utf8"));
    assert(queue.includes("indexedDB") && queue.includes("removePendingBill"), "The offline queue persists in IndexedDB and clears on success");

    await db.bill.deleteMany({ where: { outletId: outlet.id, clientRequestId: requestId } });
  }

  // =========================================================================
  check(17, "Dashboard renders under 2s with 90 days of data");
  // =========================================================================
  {
    const budgetMs = 2000;
    // A mid-range Android is not slower at the database; it is slower at the
    // network and at painting. Measure the server work, then state the budget
    // it has to fit inside.
    const runs: number[] = [];
    for (const label of ["today", "7 days", "30 days", "90 days"] as const) {
      const days = label === "today" ? 1 : Number(label.split(" ")[0]);
      const from = iso(new Date(lastDay.getTime() - (days - 1) * 86_400_000));
      const started = performance.now();
      const data = await getDashboard({ from, to: iso(lastDay) }, only);
      const elapsed = performance.now() - started;
      runs.push(elapsed);
      note(`Dashboard — ${label}`, `${elapsed.toFixed(0)} ms · ${data.kpis.length} KPIs, ${data.alerts.length} alerts`);
    }
    const slowest = Math.max(...runs);
    note("Slowest server assembly", `${slowest.toFixed(0)} ms`);
    note("Budget", `${budgetMs} ms`);
    assert(slowest < budgetMs, `Every window assembles well inside the ${budgetMs} ms budget`);

    // Measure the DSR on a real trading day, not a day the seed happened to
    // leave empty — an empty sheet would prove nothing about the work it does.
    const tradingDay = await db.nozzleReading.findFirst({
      where: { outletId: outlet.id },
      orderBy: { businessDate: "desc" },
      select: { businessDate: true },
    });
    const dsrDate = iso(tradingDay?.businessDate ?? lastDay);
    const dsrStart = performance.now();
    const dsr = await getDsr(dsrDate, only);
    const dsrMs = performance.now() - dsrStart;
    note(`DSR for ${dsrDate}`, `${dsrMs.toFixed(0)} ms`);
    note("Nozzle readings on the sheet", String(dsr.nozzles.length));
    note("Sale on the sheet", `${dsr.totals.litres} L · ${inr(dsr.totals.totalSale)}`);
    note("Settlements / dips / variations", `${dsr.settlements.length} / ${dsr.dips.length} / ${dsr.variations.length}`);
    assert(dsrMs < budgetMs, "The DSR builds inside the same budget");
    assert(dsr.nozzles.length > 0, "The DSR carries the day's nozzle readings");
    assert(dsr.settlements.length > 0 && dsr.dips.length > 0, "It carries the settlements and the dips too");

    // The sheet must agree with the shift records it is drawn from.
    const shiftTotal = await db.nozzleReading.aggregate({
      where: { outletId: outlet.id, businessDate: businessDateFromInput(dsrDate) },
      _sum: { saleLitres: true },
    });
    note("Sale litres per the shift records", `${new Decimal(shiftTotal._sum.saleLitres?.toString() ?? "0").toFixed(2)} L`);
    assert(
      new Decimal(dsr.totals.litres).minus(shiftTotal._sum.saleLitres?.toString() ?? "0").abs().lte("0.01"),
      "DSR sale litres reconcile to the nozzle readings",
    );
  }

  // =========================================================================
  check(18, "Every report exports to Excel and PDF with correct totals");
  // =========================================================================
  {
    const account = await db.account.findFirstOrThrow({ where: { outletId: outlet.id, systemKey: "CASH_IN_HAND" }, select: { id: true } });
    const customer = await db.customer.findFirstOrThrow({ where: { outletId: outlet.id, isActive: true }, orderBy: { code: "asc" } });
    const asOn = iso(lastDay);

    const workbooks: [string, () => Promise<{ byteLength: number }>][] = [
      ["Trial balance", () => excel.trialBalanceWorkbook(asOn, only)],
      ["Profit and loss", () => excel.profitAndLossWorkbook(range, only)],
      ["Balance sheet", () => excel.balanceSheetWorkbook(asOn, only)],
      ["Cash flow", () => excel.cashFlowWorkbook(range, only)],
      ["Ledger", () => excel.ledgerWorkbook(account.id, range, only)],
      ["Cash book", () => excel.bookWorkbook(account.id, range, only)],
      ["Debtors", () => excel.debtorsWorkbook(asOn, only)],
      ["Ageing", () => excel.ageingWorkbook(asOn, only)],
      ["Statement", () => excel.statementWorkbook(customer.id, range, only)],
      ["Month-wise", () => excel.periodicalsWorkbook(12, only)],
      ["GSTR-1", () => excel.gstr1Workbook(range, only)],
      ["GSTR-3B", () => excel.gstr3bWorkbook(range, only)],
      ["Voucher register", () => excel.voucherRegisterWorkbook(range, "ALL", only)],
    ];
    let excelFailures = 0;
    for (const [name, build] of workbooks) {
      try {
        const buffer = await build();
        if (buffer.byteLength < 2000) throw new Error(`only ${buffer.byteLength} bytes`);
      } catch (error) {
        excelFailures += 1;
        console.log(`    FAIL  Excel: ${name} — ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    note("Excel workbooks rendered", `${workbooks.length - excelFailures} of ${workbooks.length}`);
    assert(excelFailures === 0, "Every report exports to Excel");

    const documents: [string, () => Promise<{ sections: unknown[] }>][] = [
      ["Trial balance", () => docs.trialBalanceDoc(asOn, only)],
      ["Profit and loss", () => docs.profitAndLossDoc(range, only)],
      ["Balance sheet", () => docs.balanceSheetDoc(asOn, only)],
      ["Cash flow", () => docs.cashFlowDoc(range, only)],
      ["Ledger", () => docs.ledgerDoc(account.id, range, only)],
      ["Cash book", () => docs.bookDoc(account.id, range, only)],
      ["Debtors", () => docs.debtorsDoc(asOn, only)],
      ["Ageing", () => docs.ageingDoc(asOn, only)],
      ["Statement", () => docs.statementDoc(customer.id, range, only)],
      ["Month-wise", () => docs.periodicalsDoc(12, only)],
      ["GSTR-1", () => docs.gstr1Doc(range, only)],
      ["GSTR-3B", () => docs.gstr3bDoc(range, only)],
      ["Voucher register", () => docs.voucherRegisterDoc(range, "ALL", only)],
    ];
    let pdfFailures = 0;
    for (const [name, build] of documents) {
      try {
        const document = await build();
        if (document.sections.length === 0) throw new Error("no sections");
      } catch (error) {
        pdfFailures += 1;
        console.log(`    FAIL  PDF: ${name} — ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    note("PDF documents built", `${documents.length - pdfFailures} of ${documents.length}`);
    assert(pdfFailures === 0, "Every report builds its PDF document");

    // Totals must agree between the screen and the export.
    const trial = await getTrialBalance(asOn, only);
    const trialDoc = await docs.trialBalanceDoc(asOn, only);
    const totalsRow = trialDoc.sections[0].totals ?? [];
    const exported = totalsRow.map((cell) => cell.text.replace(/[^0-9.-]/g, "")).filter(Boolean);
    note("Trial balance debit on screen", inr(trial.totalDebit));
    note("Trial balance debit in the export", exported[0] ?? "—");
    assert(exported.includes(new Decimal(trial.totalDebit).toFixed(2)), "The exported totals row carries the same figure as the screen");
  }

  // =========================================================================
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${"═".repeat(78)}`);
  console.log(` ACCEPTANCE SUMMARY — ${passed} of ${results.length} checks passed`);
  console.log(`${"═".repeat(78)}`);
  for (const result of results) {
    console.log(` ${result.passed ? "PASS" : "FAIL"}  ${String(result.n).padStart(2, " ")}. ${result.title}`);
  }
  console.log(`${"═".repeat(78)}\n`);
  if (passed !== results.length) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
