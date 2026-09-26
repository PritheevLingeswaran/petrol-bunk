import { formatINR, formatNumber } from "@/lib/format";
import { getOutletScope } from "@/server/guard";
import { db } from "@/server/db";
import { cell, moneyCell, type ReportDoc } from "@/server/accounts/report-doc";
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

const money = (value: string) => formatINR(value);
const qty = (value: string) => formatNumber(value);
const blank = (value: string) => (Number(value) === 0 ? "" : value);

async function outletHeader(only?: ReportScope) {
  const scope = only && only.length > 0 ? { outletIds: only } : await getOutletScope();
  const outlet = await db.outlet.findUnique({
    where: { id: scope.outletIds[0] },
    select: { name: true, addressLine1: true, city: true, state: true, pincode: true, gstin: true },
  });
  return {
    name: outlet?.name ?? "Fuel Ledger",
    address: [outlet?.addressLine1, outlet?.city, outlet?.state, outlet?.pincode].filter(Boolean).join(", "),
    gstin: outlet?.gstin ?? undefined,
  };
}

const period = (range: DateRange) => `${range.from} to ${range.to}`;

// ---------------------------------------------------------------------------

export async function ledgerDoc(accountId: string, range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getLedger(accountId, range, only);
  if (!report) throw new Error("Ledger not found");
  return {
    title: `Ledger — ${report.account.code} ${report.account.name}`,
    subtitle: `${report.account.groupName} · ${period(range)}`,
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        columns: [
          { label: "Date", width: "9%" },
          { label: "Voucher", width: "13%" },
          { label: "Particulars", width: "24%" },
          { label: "Narration", width: "22%" },
          { label: "Instrument", width: "12%" },
          { label: "Debit", width: "7%", align: "right" },
          { label: "Credit", width: "7%", align: "right" },
          { label: "Balance", width: "6%", align: "right" },
        ],
        rows: [
          [cell(""), cell(""), cell("Opening balance", { bold: true }), cell(""), cell(""), cell(""), cell(""), cell(`${money(report.openingBalance)} ${report.openingSide}`, { bold: true })],
          ...report.entries.map((entry) => [
            cell(entry.date),
            cell(entry.docNumber),
            cell(entry.particulars),
            cell(entry.narration),
            cell(entry.instrument),
            cell(blank(entry.debit) ? money(entry.debit) : ""),
            cell(blank(entry.credit) ? money(entry.credit) : ""),
            cell(money(entry.runningBalance)),
          ]),
        ],
        totals: [cell(""), cell(""), cell(`Closing balance (${report.closingSide})`), cell(""), cell(""), cell(money(report.totalDebit)), cell(money(report.totalCredit)), cell(money(report.closingBalance))],
      },
    ],
  };
}

export async function trialBalanceDoc(asOn: string, only?: ReportScope): Promise<ReportDoc> {
  const report = await getTrialBalance(asOn, only);
  return {
    title: "Trial balance",
    subtitle: `As on ${asOn}`,
    outlet: await outletHeader(only),
    banner: report.isBalanced
      ? undefined
      : { tone: "alert", text: `THE TRIAL BALANCE DOES NOT BALANCE. Debit ${money(report.totalDebit)} against credit ${money(report.totalCredit)} — out by ${money(report.difference)}.` },
    sections: [
      {
        columns: [
          { label: "Group", width: "26%" },
          { label: "Code", width: "14%" },
          { label: "Ledger", width: "34%" },
          { label: "Debit", width: "13%", align: "right" },
          { label: "Credit", width: "13%", align: "right" },
        ],
        rows: report.groups.flatMap((group) => [
          [cell(group.name, { bold: true }), cell(""), cell(""), cell(money(group.debit), { bold: true }), cell(money(group.credit), { bold: true })],
          ...group.accounts.map((account) => [cell(""), cell(account.code, { indent: 1 }), cell(account.name), cell(blank(account.debit) ? money(account.debit) : ""), cell(blank(account.credit) ? money(account.credit) : "")]),
        ]),
        totals: [cell("Total"), cell(""), cell(""), cell(money(report.totalDebit)), cell(money(report.totalCredit))],
      },
    ],
    footNote: report.isBalanced ? "Debits equal credits. The books are in balance." : undefined,
  };
}

export async function profitAndLossDoc(range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getProfitAndLoss(range, undefined, only);
  const columns = [
    { label: "Particulars", width: "46%" },
    { label: "Code", width: "12%" },
    { label: "This period", width: "14%", align: "right" as const },
    { label: "Previous", width: "14%", align: "right" as const },
    { label: "Change", width: "14%", align: "right" as const },
  ];
  const section = (title: string, part: (typeof report)["revenue"]) => ({
    heading: title,
    columns,
    rows: part.lines.map((line) => [cell(line.name, { indent: 1 }), cell(line.code), moneyCell(money(line.amount), line.amount), moneyCell(money(line.previous), line.previous), moneyCell(money(line.change), line.change)]),
    totals: [cell(`Total ${title.toLowerCase()}`), cell(""), cell(money(part.total)), cell(money(part.previousTotal)), cell(money(String(Number(part.total) - Number(part.previousTotal))))],
  });

  return {
    title: "Profit and loss",
    subtitle: `${period(range)} · compared with ${period(report.comparative)}`,
    outlet: await outletHeader(only),
    sections: [
      section("Revenue from operations", report.revenue),
      section("Other income", report.otherIncome),
      section("Cost of goods sold", report.directCost),
      {
        columns,
        rows: [],
        totals: [cell("GROSS PROFIT"), cell(""), cell(money(report.grossProfit)), cell(money(report.grossProfitPrevious)), cell(`${report.grossMarginPct} %`)],
      },
      section("Operating and other expenses", report.expenses),
      {
        columns,
        rows: [],
        totals: [cell("NET PROFIT"), cell(""), cell(money(report.netProfit)), cell(money(report.netProfitPrevious)), cell(`${report.netMarginPct} %`)],
      },
      {
        heading: "Gross profit by product",
        columns: [
          { label: "Product", width: "30%" },
          { label: "Litres", width: "14%", align: "right" as const },
          { label: "Revenue", width: "16%", align: "right" as const },
          { label: "Cost", width: "16%", align: "right" as const },
          { label: "Gross profit", width: "14%", align: "right" as const },
          { label: "Per litre", width: "10%", align: "right" as const },
        ],
        rows: report.byProduct.map((product) => [cell(product.name), cell(qty(product.litres)), cell(money(product.revenue)), cell(money(product.cost)), cell(money(product.grossProfit)), cell(product.marginPerLitre)]),
        totals: [cell("Total"), cell(qty(report.totalLitres)), cell(money(report.revenue.total)), cell(money(report.directCost.total)), cell(money(report.grossProfit)), cell(report.grossMarginPerLitre)],
      },
    ],
    footNote: `Gross profit is revenue less the cost of goods actually sold, taken from the stock ledger. Stock and transit losses are shown under operating expenses so they do not distort margin per litre.`,
  };
}

export async function balanceSheetDoc(asOn: string, only?: ReportScope): Promise<ReportDoc> {
  const report = await getBalanceSheet(asOn, only);
  const columns = [
    { label: "Particulars", width: "60%" },
    { label: "Code", width: "16%" },
    { label: "Amount", width: "24%", align: "right" as const },
  ];
  const side = (caption: string, heads: (typeof report)["assets"], total: string) => [
    { heading: caption, columns, rows: [] as ReturnType<typeof cell>[][] },
    ...heads.map((head) => ({
      columns,
      rows: [
        [cell(head.title, { bold: true }), cell(""), cell(money(head.total), { bold: true })],
        ...head.lines.map((entry) => [cell(entry.name, { indent: 1 }), cell(entry.code), cell(money(entry.amount))]),
      ],
    })),
    { columns, rows: [] as ReturnType<typeof cell>[][], totals: [cell(`Total ${caption.toLowerCase()}`), cell(""), cell(money(total))] },
  ];

  return {
    title: "Balance sheet",
    subtitle: `As on ${asOn} · Schedule III presentation`,
    outlet: await outletHeader(only),
    banner: report.isBalanced ? undefined : { tone: "alert", text: `The balance sheet does not balance — out by ${money(report.difference)}.` },
    sections: [...side("EQUITY AND LIABILITIES", report.equityAndLiabilities, report.totalEquityAndLiabilities), ...side("ASSETS", report.assets, report.totalAssets)],
  };
}

export async function cashFlowDoc(range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getCashFlow(range, only);
  const columns = [
    { label: "Particulars", width: "72%" },
    { label: "Amount", width: "28%", align: "right" as const },
  ];
  return {
    title: "Cash flow statement",
    subtitle: period(range),
    outlet: await outletHeader(only),
    sections: [
      { columns, rows: [[cell("Opening cash and bank balances", { bold: true }), cell(money(report.opening), { bold: true })]] },
      ...report.sections.map((section) => ({
        heading: section.title,
        columns,
        rows: section.rows.map((row) => [cell(row.name, { indent: 1 }), moneyCell(money(row.amount), row.amount)]),
        totals: [cell(`Net cash from ${section.title.replace("Cash flow from ", "")}`), cell(money(section.total))],
      })),
      {
        columns,
        rows: [[cell("Net increase in cash and cash equivalents"), cell(money(report.netChange))]],
        totals: [cell("Closing cash and bank balances"), cell(money(report.closing))],
      },
    ],
    footNote: "Prepared by the direct method: every movement on cash and bank is classified by the ledger on the other side of the entry.",
  };
}

export async function bookDoc(accountId: string, range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getBook(accountId, range, only);
  if (!report) throw new Error("Account not found");
  return {
    title: report.account.isBank ? "Bank book" : "Cash book",
    subtitle: `${report.account.code} ${report.account.name} · ${period(range)}`,
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        columns: [
          { label: "Date", width: "9%" },
          { label: "Voucher", width: "14%" },
          { label: "Particulars", width: "27%" },
          { label: "Instrument", width: "14%" },
          { label: "Receipt", width: "10%", align: "right" },
          { label: "Payment", width: "10%", align: "right" },
          { label: "Balance", width: "10%", align: "right" },
          { label: "Cleared", width: "6%" },
        ],
        rows: report.rows.map((row) => [
          cell(row.date),
          cell(row.docNumber),
          cell(row.particulars),
          cell(row.instrument),
          cell(blank(row.debit) ? money(row.debit) : ""),
          cell(blank(row.credit) ? money(row.credit) : ""),
          cell(money(row.runningBalance)),
          cell(row.isReconciled ? "Yes" : "No"),
        ]),
        totals: [cell(""), cell(""), cell("Total"), cell(""), cell(money(report.totalDebit)), cell(money(report.totalCredit)), cell(report.closing), cell("")],
      },
      {
        heading: "Bank reconciliation",
        columns: [
          { label: "Particulars", width: "72%" },
          { label: "Amount", width: "28%", align: "right" },
        ],
        rows: [
          [cell("Balance as per books"), cell(money(report.reconciliation.bookBalance))],
          [cell("Less: receipts recorded but not yet credited by the bank"), cell(money(report.reconciliation.unclearedReceipts))],
          [cell("Add: payments issued but not yet presented"), cell(money(report.reconciliation.unclearedPayments))],
        ],
        totals: [cell("Balance as per bank statement"), cell(money(report.reconciliation.reconciledBalance))],
      },
    ],
    footNote: `${report.reconciliation.unclearedCount} entr${report.reconciliation.unclearedCount === 1 ? "y is" : "ies are"} still unreconciled.`,
  };
}

export async function debtorsDoc(asOn: string, only?: ReportScope): Promise<ReportDoc> {
  const report = await getDebtors(asOn, only);
  return {
    title: "Debtors",
    subtitle: `As on ${asOn}`,
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        columns: [
          { label: "Code", width: "7%" },
          { label: "Customer", width: "21%" },
          { label: "Limit", width: "10%", align: "right" },
          { label: "Outstanding", width: "11%", align: "right" },
          { label: "Available", width: "10%", align: "right" },
          { label: "Used %", width: "7%", align: "right" },
          { label: "Overdue", width: "10%", align: "right" },
          { label: "Days", width: "5%", align: "right" },
          { label: "Last paid", width: "9%" },
          { label: "Amount", width: "10%", align: "right" },
        ],
        rows: report.rows.map((row) => [
          cell(row.code),
          cell(row.name, { bold: row.status === "BLOCK" }),
          cell(money(row.creditLimit)),
          cell(money(row.outstanding)),
          moneyCell(money(row.availableLimit), row.availableLimit),
          cell(row.utilisationPct),
          cell(blank(row.overdue) ? money(row.overdue) : "", { negative: Number(row.overdue) > 0 }),
          cell(row.oldestDays ? String(row.oldestDays) : ""),
          cell(row.lastPaymentDate),
          cell(row.lastPaymentAmount ? money(row.lastPaymentAmount) : ""),
        ]),
        totals: [cell(""), cell("Total"), cell(money(report.totals.creditLimit)), cell(money(report.totals.outstanding)), cell(""), cell(""), cell(money(report.totals.overdue)), cell(""), cell(""), cell("")],
      },
    ],
  };
}

export async function ageingDoc(asOn: string, only?: ReportScope): Promise<ReportDoc> {
  const report = await getAgeing(asOn, only);
  const bucketWidth = `${Math.floor(58 / report.labels.length)}%`;
  return {
    title: "Outstanding ageing",
    subtitle: `As on ${asOn}`,
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        columns: [
          { label: "Code", width: "8%" },
          { label: "Customer", width: "22%" },
          ...report.labels.map((label) => ({ label: `${label} days`, width: bucketWidth, align: "right" as const })),
          { label: "Total", width: "12%", align: "right" as const },
        ],
        rows: report.rows.map((row) => [
          cell(row.code),
          cell(row.name),
          ...report.labels.map((label) => cell(blank(row.buckets[label as keyof typeof row.buckets]) ? money(row.buckets[label as keyof typeof row.buckets]) : "", { negative: label === "90+" && Number(row.buckets[label as keyof typeof row.buckets]) > 0 })),
          cell(money(row.total), { bold: true }),
        ]),
        totals: [cell(""), cell("Total"), ...report.labels.map((label) => cell(money(report.totals[label as keyof typeof report.totals]))), cell(money(report.totals.total))],
      },
    ],
  };
}

export async function statementDoc(customerId: string, range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getCustomerStatement(customerId, range, only);
  if (!report) throw new Error("Customer not found");
  const labels = Object.keys(report.ageing.buckets);
  return {
    title: "Statement of account",
    subtitle: `${report.customer.code} ${report.customer.name} · ${period(range)}`,
    outlet: { name: report.outlet.name, address: report.outlet.address, gstin: report.outlet.gstin },
    sections: [
      {
        columns: [
          { label: "Date", width: "10%" },
          { label: "Document", width: "18%" },
          { label: "Particulars", width: "28%" },
          { label: "Instrument", width: "16%" },
          { label: "Debit", width: "9%", align: "right" },
          { label: "Credit", width: "9%", align: "right" },
          { label: "Balance", width: "10%", align: "right" },
        ],
        rows: [
          [cell(""), cell(""), cell(`Opening balance (${report.openingSide})`, { bold: true }), cell(""), cell(""), cell(""), cell(money(report.opening), { bold: true })],
          ...report.entries.map((entry) => [
            cell(entry.date),
            cell(entry.docNumber),
            cell(entry.particulars),
            cell(entry.instrument),
            cell(blank(entry.debit) ? money(entry.debit) : ""),
            cell(blank(entry.credit) ? money(entry.credit) : ""),
            cell(money(entry.runningBalance)),
          ]),
        ],
        totals: [cell(""), cell(""), cell(`Closing balance (${report.closingSide})`), cell(""), cell(money(report.totalDebit)), cell(money(report.totalCredit)), cell(money(report.closing))],
      },
      {
        heading: "Ageing of the closing balance",
        columns: labels.map((label) => ({ label: `${label} days`, width: `${Math.floor(100 / labels.length)}%`, align: "right" as const })),
        rows: [labels.map((label) => cell(money(report.ageing.buckets[label as keyof typeof report.ageing.buckets])))],
      },
    ],
    footNote: `Credit limit ${money(report.customer.creditLimit)} · ${report.customer.creditDays} days credit. Please quote the document number when making payment. Errors and omissions excepted.`,
  };
}

export async function periodicalsDoc(months = 12, only?: ReportScope): Promise<ReportDoc> {
  const report = await getPeriodicals(months, only);
  return {
    title: "Month-wise summary",
    subtitle: `Last ${months} months`,
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        columns: [
          { label: "Month", width: "12%" },
          { label: "Sale", width: "14%", align: "right" },
          { label: "Litres", width: "12%", align: "right" },
          { label: "Purchase", width: "14%", align: "right" },
          { label: "Gross profit", width: "13%", align: "right" },
          { label: "Expense", width: "12%", align: "right" },
          { label: "Net profit", width: "12%", align: "right" },
          { label: "Collection", width: "11%", align: "right" },
        ],
        rows: report.months.map((month) => [
          cell(month.label),
          cell(money(month.sale)),
          cell(qty(month.litres)),
          cell(money(month.purchase)),
          moneyCell(money(month.grossProfit), month.grossProfit),
          cell(money(month.expense)),
          moneyCell(money(month.netProfit), month.netProfit),
          cell(money(month.collection)),
        ]),
        totals: [
          cell("Total"),
          cell(money(report.totals.sale)),
          cell(qty(report.totals.litres)),
          cell(money(report.totals.purchase)),
          cell(money(report.totals.grossProfit)),
          cell(money(report.totals.expense)),
          cell(money(report.totals.netProfit)),
          cell(money(report.totals.collection)),
        ],
      },
    ],
  };
}

export async function gstr1Doc(range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getGstr1(range, only);
  return {
    title: "GSTR-1",
    subtitle: period(range),
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        heading: "B2B invoices",
        columns: [
          { label: "GSTIN", width: "14%" },
          { label: "Receiver", width: "20%" },
          { label: "Invoice", width: "13%" },
          { label: "Date", width: "9%" },
          { label: "Value", width: "11%", align: "right" },
          { label: "POS", width: "6%" },
          { label: "Rate", width: "6%", align: "right" },
          { label: "Taxable", width: "11%", align: "right" },
          { label: "CGST", width: "5%", align: "right" },
          { label: "SGST", width: "5%", align: "right" },
        ],
        rows: report.b2b.slice(0, 400).map((row) => [cell(row.gstin), cell(row.customer), cell(row.invoiceNo), cell(row.date), cell(money(row.value)), cell(row.place), cell(row.rate), cell(money(row.taxable)), cell(money(row.cgst)), cell(money(row.sgst))],
        ),
      },
      {
        heading: "B2C (small) summary",
        columns: [
          { label: "Type", width: "24%" },
          { label: "Place of supply", width: "20%" },
          { label: "Rate", width: "12%", align: "right" },
          { label: "Invoices", width: "12%", align: "right" },
          { label: "Taxable", width: "16%", align: "right" },
          { label: "Cess", width: "16%", align: "right" },
        ],
        rows: report.b2c.map((row) => [cell(row.type), cell(row.place), cell(row.rate), cell(String(row.invoices)), cell(money(row.taxable)), cell(money(row.cess))]),
      },
      {
        heading: "HSN summary",
        columns: [
          { label: "HSN", width: "12%" },
          { label: "Description", width: "26%" },
          { label: "UQC", width: "8%" },
          { label: "Quantity", width: "12%", align: "right" },
          { label: "Value", width: "14%", align: "right" },
          { label: "Taxable", width: "14%", align: "right" },
          { label: "CGST", width: "7%", align: "right" },
          { label: "SGST", width: "7%", align: "right" },
        ],
        rows: report.hsn.map((row) => [cell(row.hsn), cell(row.description), cell(row.uqc), cell(qty(row.quantity)), cell(money(row.value)), cell(money(row.taxable)), cell(money(row.cgst)), cell(money(row.sgst))]),
        totals: [cell(""), cell(""), cell("Total"), cell(""), cell(money(report.totals.invoiceValue)), cell(money(report.totals.taxable)), cell(money(report.totals.cgst)), cell(money(report.totals.sgst))],
      },
    ],
  };
}

export async function gstr3bDoc(range: DateRange, only?: ReportScope): Promise<ReportDoc> {
  const report = await getGstr3b(range, only);
  const columns = [
    { label: "Nature of supply", width: "44%" },
    { label: "Taxable value", width: "14%", align: "right" as const },
    { label: "Integrated tax", width: "14%", align: "right" as const },
    { label: "Central tax", width: "14%", align: "right" as const },
    { label: "State/UT tax", width: "14%", align: "right" as const },
  ];
  return {
    title: "GSTR-3B summary",
    subtitle: period(range),
    outlet: await outletHeader(only),
    sections: [
      {
        heading: "3.1 Details of outward supplies and inward supplies liable to reverse charge",
        columns,
        rows: report.outward.map((row) => [cell(row.description), cell(money(row.taxable)), cell(money(row.igst)), cell(money(row.cgst)), cell(money(row.sgst))]),
      },
      {
        heading: "4. Eligible ITC",
        columns,
        rows: report.inward.map((row) => [cell(row.description), cell(money(row.taxable)), cell(money(row.igst)), cell(money(row.cgst)), cell(money(row.sgst))]),
        totals: [cell("Net tax payable in cash"), cell(money(report.netPayable)), cell(""), cell(""), cell("")],
      },
    ],
    footNote: report.note,
  };
}

export async function voucherRegisterDoc(range: DateRange, type?: string, only?: ReportScope): Promise<ReportDoc> {
  const report = await getVouchers(range, type, only);
  return {
    title: "Voucher register",
    subtitle: `${period(range)}${type && type !== "ALL" ? ` · ${type.replaceAll("_", " ")}` : ""}`,
    outlet: await outletHeader(only),
    landscape: true,
    sections: [
      {
        columns: [
          { label: "Date", width: "9%" },
          { label: "Voucher", width: "15%" },
          { label: "Type", width: "11%" },
          { label: "Party", width: "20%" },
          { label: "Instrument", width: "13%" },
          { label: "Narration", width: "20%" },
          { label: "Amount", width: "12%", align: "right" },
        ],
        rows: report.rows.map((row) => [
          cell(row.date),
          cell(row.docNumber),
          cell(row.type.replaceAll("_", " ")),
          cell(row.party),
          cell(row.instrument),
          cell(row.narration),
          cell(money(row.amount), { negative: row.status === "CANCELLED" }),
        ]),
        totals: [cell(""), cell(""), cell(""), cell(""), cell(""), cell("Total"), cell(money(report.total))],
      },
    ],
  };
}
