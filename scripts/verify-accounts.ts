/**
 * Phase 5 acceptance checks, run against the seeded database.
 *
 *   1. Trial balance is zero across the whole seeded period.
 *   2. P&L gross profit equals sale value less cost of goods sold, where the
 *      cost is computed independently from the stock ledger.
 *   3. A credit bill raises outstanding, lands in the right ageing bucket and
 *      is cleared exactly by a receipt.
 *
 * Every check calls the same report functions the screens call. A check that
 * went through its own arithmetic would only prove the check works.
 *
 *   npm run verify:accounts
 */
import { Decimal } from "decimal.js";
import { db } from "../src/server/db";
import { postVoucher, ensureCustomerLedger, resolveAccount, type Tx } from "../src/server/accounts/posting";
import { getAgeing, getDebtors, getProfitAndLoss, getTrialBalance, getBalanceSheet, getCashFlow, getCustomerStatement } from "../src/server/accounts/queries";
import * as excel from "../src/server/accounts/excel";
import * as docs from "../src/server/accounts/report-docs";

const money = (value: Decimal.Value) => new Decimal(value).toFixed(2);
const inr = (value: Decimal.Value) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(new Decimal(value).toNumber());
const iso = (date: Date) => date.toISOString().slice(0, 10);

let failures = 0;
const heading = (text: string) => console.log(`\n${"=".repeat(74)}\n${text}\n${"=".repeat(74)}`);
const line = (label: string, value: string) => console.log(`  ${label.padEnd(46)}${value.padStart(22)}`);
function assertThat(condition: boolean, label: string, detail = "") {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

async function main() {
  const outlet = await db.outlet.findFirstOrThrow({ where: { code: "MAIN" } });
  const only = [outlet.id];
  const span = await db.voucherLine.aggregate({ where: { outletId: outlet.id }, _min: { businessDate: true }, _max: { businessDate: true } });
  const from = span._min.businessDate!;
  const to = span._max.businessDate!;
  const range = { from: iso(from), to: iso(to) };

  console.log(`Outlet ${outlet.code} — ${outlet.name}`);
  console.log(`Ledger period ${range.from} to ${range.to}`);

  // =========================================================================
  heading("CHECK 1 — Trial balance is zero across the seeded 90 days");
  // =========================================================================
  const trial = await getTrialBalance(range.to, only);
  line("Total debit", inr(trial.totalDebit));
  line("Total credit", inr(trial.totalCredit));
  line("Difference", inr(trial.difference));
  line("Accounts with a balance", String(trial.groups.reduce((total, group) => total + group.accounts.length, 0)));
  line("Groups", String(trial.groups.length));

  assertThat(trial.isBalanced, "Trial balance difference is exactly zero", `${trial.difference}`);
  assertThat(trial.unbalancedVouchers.length === 0, "No individual voucher is out of balance", `${trial.unbalancedVouchers.length} found`);

  // A trial balance can only balance if nothing was posted one-sided, so also
  // confirm it balances on every single day of the period, not just at the end.
  const daily = await db.$queryRaw<{ businessDate: Date; diff: string }[]>`
    SELECT l."businessDate", ROUND(SUM(l.debit) - SUM(l.credit), 2)::text AS diff
    FROM voucher_lines l JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
    WHERE l."outletId" = ${outlet.id}
    GROUP BY 1 HAVING ROUND(SUM(l.debit) - SUM(l.credit), 2) <> 0 ORDER BY 1`;
  assertThat(daily.length === 0, "Every individual day balances to zero", `${daily.length} day(s) out`);

  const voucherCount = await db.voucher.count({ where: { outletId: outlet.id, status: "POSTED" } });
  const lineCount = await db.voucherLine.count({ where: { outletId: outlet.id } });
  line("Posted vouchers", String(voucherCount));
  line("Journal lines", String(lineCount));

  // =========================================================================
  heading("CHECK 2 — Gross profit equals sale value less COGS from the stock ledger");
  // =========================================================================
  const profit = await getProfitAndLoss(range, undefined, only);

  // Independent figure: value of stock that physically left the tanks,
  // straight from stock_movements. This never touches the ledger.
  const stockOut = await db.stockMovement.aggregate({
    where: { outletId: outlet.id, isCancelled: false, type: { in: ["SALE", "SAMPLE_DRAW"] }, businessDate: { gte: from, lte: to } },
    _sum: { value: true, quantity: true },
  });
  const cogsFromStockLedger = new Decimal(stockOut._sum.value?.toString() ?? "0").abs().toDecimalPlaces(2);
  const litresFromStockLedger = new Decimal(stockOut._sum.quantity?.toString() ?? "0").abs().toDecimalPlaces(2);

  line("Revenue per P&L", inr(profit.revenue.total));
  line("Cost of goods sold per P&L", inr(profit.directCost.total));
  line("Cost of goods sold per stock ledger", inr(cogsFromStockLedger));
  line("Gross profit per P&L", inr(profit.grossProfit));

  const independentGross = new Decimal(profit.revenue.total).minus(cogsFromStockLedger).toDecimalPlaces(2);
  line("Revenue less stock-ledger cost", inr(independentGross));
  line("Gross margin", `${profit.grossMarginPct} %`);
  line("Litres sold (ledger tags)", inr(profit.totalLitres));
  line("Litres sold (stock ledger)", inr(litresFromStockLedger));
  line("Gross margin per litre", `INR ${profit.grossMarginPerLitre}`);

  assertThat(
    new Decimal(profit.directCost.total).eq(cogsFromStockLedger),
    "P&L cost of goods sold matches the stock ledger",
    `P&L ${money(profit.directCost.total)} vs stock ${money(cogsFromStockLedger)}`,
  );
  assertThat(
    new Decimal(profit.grossProfit).eq(independentGross),
    "Gross profit = sale value - COGS computed independently",
    `${money(profit.grossProfit)} vs ${money(independentGross)}`,
  );
  assertThat(
    litresFromStockLedger.minus(profit.totalLitres).abs().lte("1"),
    "Litres on the revenue lines agree with the stock ledger",
    `${money(profit.totalLitres)} vs ${money(litresFromStockLedger)}`,
  );

  console.log("\n  Gross profit by product");
  for (const product of profit.byProduct.slice(0, 8)) {
    console.log(`    ${product.name.padEnd(26)}${inr(product.litres).padStart(14)} L  ${inr(product.grossProfit).padStart(16)}  INR ${product.marginPerLitre}/L`);
  }

  // The balance sheet must balance on the same data, or the P&L is not real.
  const sheet = await getBalanceSheet(range.to, only);
  line("Balance sheet — total assets", inr(sheet.totalAssets));
  line("Balance sheet — equity and liabilities", inr(sheet.totalEquityAndLiabilities));
  assertThat(sheet.isBalanced, "Balance sheet balances", `difference ${sheet.difference}`);

  const cashFlow = await getCashFlow(range, only);
  line("Cash flow — closing per statement", inr(cashFlow.closing));
  line("Cash flow — closing per ledger", inr(cashFlow.closingPerLedger));
  assertThat(new Decimal(cashFlow.difference).abs().lte("0.05"), "Cash flow ties to the cash and bank ledgers", `difference ${cashFlow.difference}`);

  // =========================================================================
  heading("CHECK 3 — A credit bill ages correctly and a receipt clears it exactly");
  // =========================================================================
  const tx = db as unknown as Tx;
  const customer = await db.customer.findFirstOrThrow({ where: { outletId: outlet.id, isActive: true }, orderBy: { code: "asc" } });
  const asOn = iso(to);

  const before = await getDebtors(asOn, only);
  const beforeRow = before.rows.find((row) => row.customerId === customer.id);
  const beforeOutstanding = new Decimal(beforeRow?.outstanding ?? "0");
  line(`Opening outstanding — ${customer.name}`, inr(beforeOutstanding));

  // Dated 40 days back so it must land in the 31-45 day bucket.
  const billDate = new Date(to.getTime() - 40 * 86_400_000);
  const amount = new Decimal("24500.00");
  const ledger = await ensureCustomerLedger(tx, outlet.id, customer.id);
  const sales = await resolveAccount(tx, outlet.id, "SALES_MS", "SALES_MS");

  const bill = await db.bill.create({
    data: {
      outletId: outlet.id, customerId: customer.id, seriesCode: "VERIFY", seriesNumber: Date.now() % 100000,
      docNumber: `VERIFY-${Date.now() % 100000}`, businessDate: billDate, dueDate: billDate, type: "CREDIT",
      customerName: customer.name, subTotal: amount, taxableValue: amount, totalAmount: amount, paidAmount: new Decimal(0),
      clientRequestId: `verify-${Date.now()}`, remarks: "Phase 5 verification bill", amountInWords: "Verification entry",
    },
  });
  const salesVoucher = await postVoucher(tx, {
    outletId: outlet.id, type: "SALES", businessDate: billDate, billId: bill.id, partyAccountId: ledger.id,
    narration: `Verification credit bill ${bill.docNumber}`,
    lines: [{ accountId: ledger.id, debit: amount }, { accountId: sales.id, credit: amount }],
  });

  const afterBill = await getDebtors(asOn, only);
  const afterBillRow = afterBill.rows.find((row) => row.customerId === customer.id)!;
  const raised = new Decimal(afterBillRow.outstanding).minus(beforeOutstanding);
  line("Credit bill posted", `INR ${inr(amount)}`);
  line("Outstanding after the bill", inr(afterBillRow.outstanding));
  line("Increase", inr(raised));
  assertThat(raised.eq(amount), "The credit bill raised outstanding by exactly its value", `${money(raised)}`);

  const ageing = await getAgeing(asOn, only);
  const ageingRow = ageing.rows.find((row) => row.customerId === customer.id)!;
  const bucketBefore = before.rows.find((row) => row.customerId === customer.id)?.buckets["31-45"] ?? "0.00";
  const bucketDelta = new Decimal(ageingRow.buckets["31-45"]).minus(bucketBefore);
  line("Bill age in days", String(40));
  line("Landed in 31-45 bucket", inr(bucketDelta));
  assertThat(bucketDelta.eq(amount), "The bill landed in the 31-45 day ageing bucket", `${money(bucketDelta)} of ${money(amount)}`);
  assertThat(new Decimal(afterBillRow.overdue).minus(beforeRow?.overdue ?? "0").eq(amount), "The bill is counted as overdue", "");

  // ---- Clear it with a receipt -------------------------------------------
  const cash = await resolveAccount(tx, outlet.id, "CASH_IN_HAND", "CASH");
  const receiptVoucher = await postVoucher(tx, {
    outletId: outlet.id, type: "RECEIPT", businessDate: to, partyAccountId: ledger.id,
    instrumentType: "CHEQUE", instrumentNo: "004411", instrumentDate: to, bankName: "State Bank of India",
    narration: `Receipt against ${bill.docNumber}`,
    lines: [{ accountId: cash.id, debit: amount }, { accountId: ledger.id, credit: amount }],
  });
  await db.bill.update({ where: { id: bill.id }, data: { paidAmount: amount } });

  const afterReceipt = await getDebtors(asOn, only);
  const afterReceiptRow = afterReceipt.rows.find((row) => row.customerId === customer.id);
  const finalOutstanding = new Decimal(afterReceiptRow?.outstanding ?? "0");
  line("Receipt posted", `INR ${inr(amount)} by cheque 004411`);
  line("Outstanding after the receipt", inr(finalOutstanding));
  assertThat(finalOutstanding.eq(beforeOutstanding), "The receipt cleared the bill exactly", `${money(finalOutstanding)} vs opening ${money(beforeOutstanding)}`);

  // Receipts are applied FIFO against the oldest open item, so the money does
  // not necessarily clear the bill that was just raised. What must hold is
  // that the aged total comes back to where it started and still equals the
  // outstanding balance it sits beside.
  const ageingAfter = await getAgeing(asOn, only);
  const ageingAfterRow = ageingAfter.rows.find((row) => row.customerId === customer.id);
  const agedTotalBefore = new Decimal(ageing.rows.find((row) => row.customerId === customer.id)?.total ?? "0").minus(amount);
  const agedTotalAfter = new Decimal(ageingAfterRow?.total ?? "0");
  assertThat(agedTotalAfter.eq(agedTotalBefore), "The aged total returned to its opening figure", `${money(agedTotalAfter)} vs ${money(agedTotalBefore)}`);
  assertThat(agedTotalAfter.eq(finalOutstanding), "Ageing buckets sum to the outstanding balance", `${money(agedTotalAfter)} vs ${money(finalOutstanding)}`);

  const statement = await getCustomerStatement(customer.id, { from: iso(billDate), to: asOn }, only);
  const onStatement = statement?.entries.filter((entry) => entry.docNumber === salesVoucher.docNumber || entry.docNumber === receiptVoucher.docNumber) ?? [];
  assertThat(onStatement.length === 2, "Both entries appear on the customer statement", `${onStatement.length} of 2`);
  assertThat(onStatement.some((entry) => entry.instrument.includes("004411")), "The cheque number is carried onto the statement", "");

  const trialAfter = await getTrialBalance(asOn, only);
  assertThat(trialAfter.isBalanced, "Trial balance still zero after the test postings", `difference ${trialAfter.difference}`);

  // ---- Leave the books as they were found ---------------------------------
  await db.voucherLine.deleteMany({ where: { voucherId: { in: [salesVoucher.id, receiptVoucher.id] } } });
  await db.voucher.deleteMany({ where: { id: { in: [salesVoucher.id, receiptVoucher.id] } } });
  await db.bill.delete({ where: { id: bill.id } });
  const restored = await getTrialBalance(asOn, only);
  assertThat(restored.isBalanced && restored.totalDebit === trial.totalDebit, "Verification postings rolled back cleanly", `${restored.totalDebit}`);

  // =========================================================================
  heading("EXPORTS — every report renders in both formats");
  // =========================================================================
  const account = await db.account.findFirstOrThrow({ where: { outletId: outlet.id, systemKey: "CASH_IN_HAND" }, select: { id: true } });
  const exports: [string, () => Promise<{ byteLength: number }>][] = [
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
  for (const [name, build] of exports) {
    try {
      const buffer = await build();
      if (buffer.byteLength < 2000) throw new Error(`only ${buffer.byteLength} bytes`);
    } catch (error) {
      excelFailures += 1;
      console.log(`  FAIL  Excel export: ${name} — ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  assertThat(excelFailures === 0, `All ${exports.length} Excel exports render`, excelFailures ? `${excelFailures} failed` : "");

  // PDF is the slower path; render one of each shape rather than all thirteen.
  const pdfDocs: [string, () => Promise<{ sections: unknown[] }>][] = [
    ["Trial balance", () => docs.trialBalanceDoc(asOn, only)],
    ["Profit and loss", () => docs.profitAndLossDoc(range, only)],
    ["Balance sheet", () => docs.balanceSheetDoc(asOn, only)],
    ["Cash flow", () => docs.cashFlowDoc(range, only)],
    ["Statement", () => docs.statementDoc(customer.id, range, only)],
    ["Ageing", () => docs.ageingDoc(asOn, only)],
    ["GSTR-1", () => docs.gstr1Doc(range, only)],
  ];
  let pdfFailures = 0;
  for (const [name, build] of pdfDocs) {
    try {
      const document = await build();
      if (document.sections.length === 0) throw new Error("no sections");
    } catch (error) {
      pdfFailures += 1;
      console.log(`  FAIL  PDF document: ${name} — ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  assertThat(pdfFailures === 0, `All ${pdfDocs.length} PDF report documents build`, pdfFailures ? `${pdfFailures} failed` : "");

  // =========================================================================
  heading(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
  // =========================================================================
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
