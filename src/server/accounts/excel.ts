import ExcelJS from "exceljs";
import { Decimal } from "@/lib/money";
import {
  getAgeing,
  getBalanceSheet,
  getBook,
  getCashFlow,
  getCustomerStatement,
  getDebtors,
  getGstr1,
  getGstr3b,
  getLedger,
  getPeriodicals,
  getProfitAndLoss,
  getTrialBalance,
  getVouchers,
  type DateRange,
  type ReportScope,
} from "@/server/accounts/queries";

/** Indian grouping, applied to every money cell in every export. */
const MONEY = "##,##,##0.00;[Red]-##,##,##0.00";
const QTY = "##,##,##0.00";

type Column = { header: string; key: string; width?: number; money?: boolean; qty?: boolean };

function sheetFrom(book: ExcelJS.Workbook, title: string, subtitle: string, columns: Column[]) {
  const sheet = book.addWorksheet(title.slice(0, 31), { views: [{ state: "frozen", ySplit: 4, xSplit: 1 }] });
  sheet.mergeCells(1, 1, 1, Math.max(columns.length, 2));
  const heading = sheet.getCell(1, 1);
  heading.value = title;
  heading.font = { bold: true, size: 13 };
  sheet.mergeCells(2, 1, 2, Math.max(columns.length, 2));
  const caption = sheet.getCell(2, 1);
  caption.value = subtitle;
  caption.font = { size: 10, color: { argb: "FF64748B" } };

  sheet.getRow(4).values = columns.map((column) => column.header);
  sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A3D" } };
  sheet.getRow(4).alignment = { vertical: "middle" };
  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width ?? (column.money || column.qty ? 16 : 20);
    if (column.money) target.numFmt = MONEY;
    if (column.qty) target.numFmt = QTY;
    if (column.money || column.qty) target.alignment = { horizontal: "right" };
  });
  return sheet;
}

const num = (value: string | number | null | undefined): number => {
  const parsed = new Decimal(value === null || value === undefined || value === "" ? 0 : value);
  return parsed.toNumber();
};

/** Bold, ruled, frozen-at-the-bottom totals row — on every sheet. */
function addTotals(sheet: ExcelJS.Worksheet, values: (string | number | null)[]) {
  const row = sheet.addRow(values);
  row.font = { bold: true };
  row.border = { top: { style: "double" } };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F6" } };
  });
  return row;
}

function finish(book: ExcelJS.Workbook) {
  book.creator = "Fuel Ledger";
  book.created = new Date();
  return book.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------------

export async function ledgerWorkbook(accountId: string, range: DateRange, only?: ReportScope) {
  const report = await getLedger(accountId, range, only);
  if (!report) throw new Error("Ledger not found");
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, `${report.account.code} ${report.account.name}`, `Ledger · ${range.from} to ${range.to}`, [
    { header: "Date", key: "date", width: 12 },
    { header: "Voucher", key: "doc", width: 20 },
    { header: "Type", key: "type", width: 14 },
    { header: "Particulars", key: "particulars", width: 32 },
    { header: "Narration", key: "narration", width: 36 },
    { header: "Instrument", key: "instrument", width: 22 },
    { header: "Debit", key: "debit", money: true },
    { header: "Credit", key: "credit", money: true },
    { header: "Balance", key: "balance", money: true },
  ]);

  sheet.addRow(["", "", "", "Opening balance", "", "", null, null, num(report.openingBalance)]).font = { italic: true };
  for (const entry of report.entries) {
    sheet.addRow([entry.date, entry.docNumber, entry.type, entry.particulars, entry.narration, entry.instrument, num(entry.debit) || null, num(entry.credit) || null, num(entry.runningBalance)]);
  }
  addTotals(sheet, ["", "", "", `Closing ${report.closingSide}`, "", "", num(report.totalDebit), num(report.totalCredit), num(report.closingBalance)]);
  return finish(book);
}

export async function trialBalanceWorkbook(asOn: string, only?: ReportScope) {
  const report = await getTrialBalance(asOn, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Trial balance", `As on ${asOn}`, [
    { header: "Group", key: "group", width: 30 },
    { header: "Code", key: "code", width: 16 },
    { header: "Ledger", key: "name", width: 34 },
    { header: "Debit", key: "debit", money: true },
    { header: "Credit", key: "credit", money: true },
  ]);

  for (const group of report.groups) {
    const header = sheet.addRow([group.name, "", "", num(group.debit), num(group.credit)]);
    header.font = { bold: true };
    for (const account of group.accounts) sheet.addRow(["", account.code, account.name, num(account.debit) || null, num(account.credit) || null]);
  }
  addTotals(sheet, ["Total", "", "", num(report.totalDebit), num(report.totalCredit)]);
  const difference = addTotals(sheet, ["Difference", "", "", num(report.difference), null]);
  if (!report.isBalanced) difference.font = { bold: true, color: { argb: "FFB91C1C" } };
  return finish(book);
}

export async function profitAndLossWorkbook(range: DateRange, only?: ReportScope) {
  const report = await getProfitAndLoss(range, undefined, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Profit and loss", `${range.from} to ${range.to} · compared with ${report.comparative.from} to ${report.comparative.to}`, [
    { header: "Particulars", key: "name", width: 44 },
    { header: "Code", key: "code", width: 14 },
    { header: "This period", key: "amount", money: true },
    { header: "Previous period", key: "previous", money: true },
    { header: "Change", key: "change", money: true },
  ]);

  for (const section of [report.revenue, report.otherIncome, report.directCost, report.expenses]) {
    const header = sheet.addRow([section.title, "", num(section.total), num(section.previousTotal), num(section.total) - num(section.previousTotal)]);
    header.font = { bold: true };
    for (const line of section.lines) sheet.addRow([`    ${line.name}`, line.code, num(line.amount), num(line.previous), num(line.change)]);
  }
  addTotals(sheet, ["Gross profit", "", num(report.grossProfit), num(report.grossProfitPrevious), num(report.grossProfit) - num(report.grossProfitPrevious)]);
  addTotals(sheet, ["Net profit", "", num(report.netProfit), num(report.netProfitPrevious), num(report.netProfit) - num(report.netProfitPrevious)]);

  const margin = sheetFrom(book, "Margin by product", `${range.from} to ${range.to}`, [
    { header: "Product", key: "name", width: 30 },
    { header: "Litres", key: "litres", qty: true },
    { header: "Revenue", key: "revenue", money: true },
    { header: "Cost", key: "cost", money: true },
    { header: "Gross profit", key: "gross", money: true },
    { header: "Margin / litre", key: "perLitre", money: true },
    { header: "Margin %", key: "pct", qty: true },
  ]);
  for (const product of report.byProduct) {
    margin.addRow([product.name, num(product.litres), num(product.revenue), num(product.cost), num(product.grossProfit), num(product.marginPerLitre), num(product.marginPct)]);
  }
  addTotals(margin, ["Total", num(report.totalLitres), num(report.revenue.total), num(report.directCost.total), num(report.grossProfit), num(report.grossMarginPerLitre), num(report.grossMarginPct)]);
  return finish(book);
}

export async function balanceSheetWorkbook(asOn: string, only?: ReportScope) {
  const report = await getBalanceSheet(asOn, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Balance sheet", `As on ${asOn} · Schedule III`, [
    { header: "Particulars", key: "name", width: 48 },
    { header: "Code", key: "code", width: 14 },
    { header: "Amount", key: "amount", money: true },
  ]);

  for (const [caption, heads, total] of [
    ["EQUITY AND LIABILITIES", report.equityAndLiabilities, report.totalEquityAndLiabilities],
    ["ASSETS", report.assets, report.totalAssets],
  ] as const) {
    const title = sheet.addRow([caption, "", null]);
    title.font = { bold: true, size: 12 };
    for (const head of heads) {
      const header = sheet.addRow([head.title, "", num(head.total)]);
      header.font = { bold: true };
      for (const line of head.lines) sheet.addRow([`    ${line.name}`, line.code, num(line.amount)]);
    }
    addTotals(sheet, [`Total ${caption.toLowerCase()}`, "", num(total)]);
  }
  return finish(book);
}

export async function cashFlowWorkbook(range: DateRange, only?: ReportScope) {
  const report = await getCashFlow(range, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Cash flow", `${range.from} to ${range.to}`, [
    { header: "Particulars", key: "name", width: 48 },
    { header: "Amount", key: "amount", money: true },
  ]);
  sheet.addRow(["Opening cash and bank", num(report.opening)]).font = { bold: true };
  for (const section of report.sections) {
    const header = sheet.addRow([section.title, num(section.total)]);
    header.font = { bold: true };
    for (const row of section.rows) sheet.addRow([`    ${row.name}`, num(row.amount)]);
  }
  addTotals(sheet, ["Net change in cash", num(report.netChange)]);
  addTotals(sheet, ["Closing cash and bank", num(report.closing)]);
  return finish(book);
}

export async function bookWorkbook(accountId: string, range: DateRange, only?: ReportScope) {
  const report = await getBook(accountId, range, only);
  if (!report) throw new Error("Account not found");
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, report.account.isBank ? "Bank book" : "Cash book", `${report.account.code} ${report.account.name} · ${range.from} to ${range.to}`, [
    { header: "Date", key: "date", width: 12 },
    { header: "Voucher", key: "doc", width: 20 },
    { header: "Particulars", key: "particulars", width: 34 },
    { header: "Instrument", key: "instrument", width: 22 },
    { header: "Receipt", key: "debit", money: true },
    { header: "Payment", key: "credit", money: true },
    { header: "Balance", key: "balance", money: true },
    { header: "Cleared", key: "cleared", width: 12 },
    { header: "Bank ref", key: "ref", width: 18 },
  ]);
  for (const row of report.rows) {
    sheet.addRow([row.date, row.docNumber, row.particulars, row.instrument, num(row.debit) || null, num(row.credit) || null, num(row.runningBalance), row.isReconciled ? row.clearedOn || "Yes" : "No", row.bankRef]);
  }
  addTotals(sheet, ["", "", "Total", "", num(report.totalDebit), num(report.totalCredit), null, "", ""]);

  const reconciliation = sheetFrom(book, "Reconciliation", `As on ${range.to}`, [
    { header: "Particulars", key: "name", width: 44 },
    { header: "Amount", key: "amount", money: true },
  ]);
  reconciliation.addRow(["Balance as per books", num(report.reconciliation.bookBalance)]);
  reconciliation.addRow(["Less: receipts not yet credited by the bank", num(report.reconciliation.unclearedReceipts)]);
  reconciliation.addRow(["Add: payments not yet presented", num(report.reconciliation.unclearedPayments)]);
  addTotals(reconciliation, ["Balance as per bank statement", num(report.reconciliation.reconciledBalance)]);
  return finish(book);
}

export async function debtorsWorkbook(asOn: string, only?: ReportScope) {
  const report = await getDebtors(asOn, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Debtors", `As on ${asOn}`, [
    { header: "Code", key: "code", width: 12 },
    { header: "Customer", key: "name", width: 32 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Credit limit", key: "limit", money: true },
    { header: "Outstanding", key: "outstanding", money: true },
    { header: "Available limit", key: "available", money: true },
    { header: "Utilisation %", key: "utilisation", qty: true },
    { header: "Overdue", key: "overdue", money: true },
    { header: "Days overdue", key: "days", width: 14 },
    { header: "Credit days", key: "creditDays", width: 12 },
    { header: "Last payment", key: "lastDate", width: 14 },
    { header: "Last amount", key: "lastAmount", money: true },
    { header: "Status", key: "status", width: 10 },
  ]);
  for (const row of report.rows) {
    const added = sheet.addRow([row.code, row.name, row.phone, num(row.creditLimit), num(row.outstanding), num(row.availableLimit), num(row.utilisationPct), num(row.overdue), row.oldestDays || "", row.creditDays, row.lastPaymentDate, num(row.lastPaymentAmount) || null, row.status]);
    if (row.status === "BLOCK") added.getCell(13).font = { color: { argb: "FFB91C1C" }, bold: true };
  }
  addTotals(sheet, ["", "Total", "", num(report.totals.creditLimit), num(report.totals.outstanding), null, null, num(report.totals.overdue), "", "", "", null, ""]);
  return finish(book);
}

export async function ageingWorkbook(asOn: string, only?: ReportScope) {
  const report = await getAgeing(asOn, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Outstanding ageing", `As on ${asOn}`, [
    { header: "Code", key: "code", width: 12 },
    { header: "Customer", key: "name", width: 34 },
    ...report.labels.map((label) => ({ header: `${label} days`, key: label, money: true })),
    { header: "Total", key: "total", money: true },
    { header: "Oldest days", key: "oldest", width: 13 },
  ]);
  for (const row of report.rows) {
    sheet.addRow([row.code, row.name, ...report.labels.map((label) => num(row.buckets[label as keyof typeof row.buckets]) || null), num(row.total), row.oldestDays || ""]);
  }
  addTotals(sheet, ["", "Total", ...report.labels.map((label) => num(report.totals[label as keyof typeof report.totals])), num(report.totals.total), ""]);
  return finish(book);
}

export async function statementWorkbook(customerId: string, range: DateRange, only?: ReportScope) {
  const report = await getCustomerStatement(customerId, range, only);
  if (!report) throw new Error("Customer not found");
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Statement", `${report.customer.code} ${report.customer.name} · ${range.from} to ${range.to}`, [
    { header: "Date", key: "date", width: 12 },
    { header: "Document", key: "doc", width: 20 },
    { header: "Type", key: "type", width: 14 },
    { header: "Particulars", key: "particulars", width: 34 },
    { header: "Instrument", key: "instrument", width: 20 },
    { header: "Debit", key: "debit", money: true },
    { header: "Credit", key: "credit", money: true },
    { header: "Balance", key: "balance", money: true },
  ]);
  sheet.addRow(["", "", "", `Opening balance (${report.openingSide})`, "", null, null, num(report.opening)]).font = { italic: true };
  for (const entry of report.entries) {
    sheet.addRow([entry.date, entry.docNumber, entry.type, entry.particulars, entry.instrument, num(entry.debit) || null, num(entry.credit) || null, num(entry.runningBalance)]);
  }
  addTotals(sheet, ["", "", "", `Closing balance (${report.closingSide})`, "", num(report.totalDebit), num(report.totalCredit), num(report.closing)]);

  sheet.addRow([]);
  const ageingHeader = sheet.addRow(["Ageing of the closing balance"]);
  ageingHeader.font = { bold: true };
  const labels = Object.keys(report.ageing.buckets);
  sheet.addRow(labels.map((label) => `${label} days`)).font = { bold: true };
  const amounts = sheet.addRow(labels.map((label) => num(report.ageing.buckets[label as keyof typeof report.ageing.buckets])));
  amounts.eachCell((cell) => {
    cell.numFmt = MONEY;
  });
  return finish(book);
}

export async function periodicalsWorkbook(months = 12, only?: ReportScope) {
  const report = await getPeriodicals(months, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Month-wise summary", `Last ${months} months`, [
    { header: "Month", key: "month", width: 14 },
    { header: "Sale", key: "sale", money: true },
    { header: "Litres", key: "litres", qty: true },
    { header: "Purchase", key: "purchase", money: true },
    { header: "Gross profit", key: "gross", money: true },
    { header: "Expense", key: "expense", money: true },
    { header: "Net profit", key: "net", money: true },
    { header: "Collection", key: "collection", money: true },
  ]);
  for (const month of report.months) {
    sheet.addRow([month.label, num(month.sale), num(month.litres), num(month.purchase), num(month.grossProfit), num(month.expense), num(month.netProfit), num(month.collection)]);
  }
  addTotals(sheet, ["Total", num(report.totals.sale), num(report.totals.litres), num(report.totals.purchase), num(report.totals.grossProfit), num(report.totals.expense), num(report.totals.netProfit), num(report.totals.collection)]);
  return finish(book);
}

/**
 * GSTR-1 in the layout the GST offline utility expects: one sheet per table,
 * with the column headings the tool matches on.
 */
export async function gstr1Workbook(range: DateRange, only?: ReportScope) {
  const report = await getGstr1(range, only);
  const book = new ExcelJS.Workbook();

  const b2b = sheetFrom(book, "b2b", `GSTR-1 B2B · ${range.from} to ${range.to}`, [
    { header: "GSTIN/UIN of Recipient", key: "gstin", width: 20 },
    { header: "Receiver Name", key: "name", width: 30 },
    { header: "Invoice Number", key: "invoice", width: 18 },
    { header: "Invoice date", key: "date", width: 13 },
    { header: "Invoice Value", key: "value", money: true },
    { header: "Place Of Supply", key: "place", width: 16 },
    { header: "Reverse Charge", key: "reverse", width: 14 },
    { header: "Applicable % of Tax Rate", key: "applicable", width: 20 },
    { header: "Invoice Type", key: "type", width: 16 },
    { header: "Rate", key: "rate", qty: true },
    { header: "Taxable Value", key: "taxable", money: true },
    { header: "Cess Amount", key: "cess", money: true },
  ]);
  for (const row of report.b2b) {
    b2b.addRow([row.gstin, row.customer, row.invoiceNo, row.date, num(row.value), row.place, "N", "", row.type === "Credit note" ? "Credit note" : "Regular", num(row.rate), num(row.taxable), num(row.cess)]);
  }
  addTotals(b2b, ["", "", "", "Total", null, "", "", "", "", null, num(report.b2b.reduce((total, row) => total + num(row.taxable), 0)), null]);

  const b2c = sheetFrom(book, "b2cs", `GSTR-1 B2C (small) · ${range.from} to ${range.to}`, [
    { header: "Type", key: "type", width: 16 },
    { header: "Place Of Supply", key: "place", width: 18 },
    { header: "Applicable % of Tax Rate", key: "applicable", width: 20 },
    { header: "Rate", key: "rate", qty: true },
    { header: "Taxable Value", key: "taxable", money: true },
    { header: "Cess Amount", key: "cess", money: true },
    { header: "E-Commerce GSTIN", key: "ecom", width: 20 },
  ]);
  for (const row of report.b2c) b2c.addRow([row.type, row.place, "", num(row.rate), num(row.taxable), num(row.cess), ""]);
  addTotals(b2c, ["Total", "", "", null, num(report.b2c.reduce((total, row) => total + num(row.taxable), 0)), null, ""]);

  const hsn = sheetFrom(book, "hsn", `GSTR-1 HSN summary · ${range.from} to ${range.to}`, [
    { header: "HSN", key: "hsn", width: 14 },
    { header: "Description", key: "description", width: 30 },
    { header: "UQC", key: "uqc", width: 10 },
    { header: "Total Quantity", key: "quantity", qty: true },
    { header: "Total Value", key: "value", money: true },
    { header: "Taxable Value", key: "taxable", money: true },
    { header: "Integrated Tax Amount", key: "igst", money: true },
    { header: "Central Tax Amount", key: "cgst", money: true },
    { header: "State/UT Tax Amount", key: "sgst", money: true },
    { header: "Cess Amount", key: "cess", money: true },
  ]);
  for (const row of report.hsn) {
    hsn.addRow([row.hsn, row.description, row.uqc, num(row.quantity), num(row.value), num(row.taxable), num(row.igst), num(row.cgst), num(row.sgst), num(row.cess)]);
  }
  addTotals(hsn, ["", "", "Total", null, null, num(report.totals.taxable), num(report.totals.igst), num(report.totals.cgst), num(report.totals.sgst), num(report.totals.cess)]);
  return finish(book);
}

export async function gstr3bWorkbook(range: DateRange, only?: ReportScope) {
  const report = await getGstr3b(range, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "GSTR-3B", `${range.from} to ${range.to}`, [
    { header: "Nature of supply", key: "description", width: 62 },
    { header: "Taxable value", key: "taxable", money: true },
    { header: "Integrated tax", key: "igst", money: true },
    { header: "Central tax", key: "cgst", money: true },
    { header: "State/UT tax", key: "sgst", money: true },
    { header: "Cess", key: "cess", money: true },
  ]);
  const outward = sheet.addRow(["3.1 Details of outward supplies"]);
  outward.font = { bold: true };
  for (const row of report.outward) sheet.addRow([row.description, num(row.taxable), num(row.igst), num(row.cgst), num(row.sgst), num(row.cess)]);
  const inward = sheet.addRow(["4. Eligible ITC"]);
  inward.font = { bold: true };
  for (const row of report.inward) sheet.addRow([row.description, num(row.taxable), num(row.igst), num(row.cgst), num(row.sgst), num(row.cess)]);
  addTotals(sheet, ["Net tax payable in cash", num(report.netPayable), null, null, null, null]);
  sheet.addRow([]);
  sheet.addRow([report.note]).font = { italic: true, size: 9 };
  return finish(book);
}

export async function voucherRegisterWorkbook(range: DateRange, type?: string, only?: ReportScope) {
  const report = await getVouchers(range, type, only);
  const book = new ExcelJS.Workbook();
  const sheet = sheetFrom(book, "Voucher register", `${range.from} to ${range.to}${type && type !== "ALL" ? ` · ${type}` : ""}`, [
    { header: "Date", key: "date", width: 12 },
    { header: "Voucher", key: "doc", width: 22 },
    { header: "Type", key: "type", width: 16 },
    { header: "Party", key: "party", width: 28 },
    { header: "Instrument", key: "instrument", width: 20 },
    { header: "Narration", key: "narration", width: 44 },
    { header: "Amount", key: "amount", money: true },
    { header: "Status", key: "status", width: 12 },
  ]);
  for (const row of report.rows) sheet.addRow([row.date, row.docNumber, row.type, row.party, row.instrument, row.narration, num(row.amount), row.status]);
  addTotals(sheet, ["", "", "", "", "", "Total", num(report.total), ""]);
  return finish(book);
}
