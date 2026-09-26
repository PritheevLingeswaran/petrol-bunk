import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import ExcelJS from "exceljs";
import { requirePermission } from "@/server/guard";
import { businessDateToday } from "@/lib/date";
import { getDsr } from "@/server/reports/dsr";
import { DsrPdf } from "@/server/reports/dsr-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONEY = "##,##,##0.00;[Red]-##,##,##0.00";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The one-click Daily Sales Report: /api/reports/dsr?date=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("REPORTS", "view");
    const date = request.nextUrl.searchParams.get("date") ?? businessDateToday().toISOString().slice(0, 10);
    const format = request.nextUrl.searchParams.get("format") === "excel" ? "excel" : "pdf";
    const report = await getDsr(date);

    if (format === "excel") {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("DSR", { views: [{ state: "frozen", ySplit: 3 }] });
      sheet.getCell("A1").value = `${report.outlet.name} — Daily Sales Report`;
      sheet.getCell("A1").font = { bold: true, size: 13 };
      sheet.getCell("A2").value = date;

      const block = (title: string, headers: string[], rows: (string | number)[][], totals?: (string | number)[]) => {
        sheet.addRow([]);
        const heading = sheet.addRow([title]);
        heading.font = { bold: true };
        const headerRow = sheet.addRow(headers);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16212D" } };
        for (const row of rows) sheet.addRow(row);
        if (totals) {
          const totalRow = sheet.addRow(totals);
          totalRow.font = { bold: true };
          totalRow.border = { top: { style: "double" } };
        }
      };

      const n = (value: string) => Number(value);
      block("Nozzle readings", ["Shift", "Nozzle", "Product", "Salesman", "Opening", "Closing", "Testing", "Litres", "Rate", "Amount"],
        report.nozzles.map((row) => [row.shift, row.nozzle, row.product, row.salesman, n(row.opening), n(row.closing), n(row.testing), n(row.litres), n(row.rate), n(row.amount)]),
        ["", "", "Total", "", "", "", n(report.totals.testingLitres), n(report.totals.litres), "", n(report.totals.fuelSale)]);
      block("Sale by product", ["Product", "Litres", "Rate", "Amount"],
        report.products.map((row) => [row.product, n(row.litres), n(row.rate), n(row.amount)]),
        ["Total", n(report.totals.litres), "", n(report.totals.fuelSale)]);
      block("Collections", ["Mode", "Amount"], report.collections.map((row) => [row.mode, n(row.amount)]), ["Total", n(report.totals.collections)]);
      block("Salesman settlement", ["Salesman", "Sale", "Cash", "Card", "UPI", "Credit", "Own use", "Expenses", "Collections", "Short / excess"],
        report.settlements.map((row) => [row.salesman, n(row.saleValue), n(row.cash), n(row.card), n(row.upi), n(row.credit), n(row.ownUse), n(row.expenses), n(row.collections), n(row.shortExcess)]),
        ["Total", n(report.totals.totalSale), "", "", "", n(report.totals.creditIssued), "", "", n(report.totals.collections), n(report.totals.shortExcess)]);
      block("Dip and density", ["Tank", "Product", "Opening dip mm", "Closing dip mm", "Opening L", "Closing L", "Water mm", "Density @15"],
        report.dips.map((row) => [row.tank, row.product, row.openingDip, row.closingDip, row.openingLitres, row.closingLitres, row.waterMm, row.density]));
      block("Stock variation", ["Tank", "Product", "Opening", "Receipts", "Sales", "Book", "Physical", "Variation", "Permissible", "Excess", "Value"],
        report.variations.map((row) => [row.tank, row.product, n(row.opening), n(row.receipts), n(row.sales), n(row.book), n(row.physical), n(row.variation), n(row.permissible), n(row.excess), n(row.value)]));
      block("Cash position", ["Particulars", "Amount"], [
        ["Cash and bank at start of day", n(report.totals.openingCash)],
        ["Total sale value", n(report.totals.totalSale)],
        ["Credit issued", n(report.totals.creditIssued)],
        ["Short / excess", n(report.totals.shortExcess)],
      ], ["Cash and bank at close", n(report.totals.cashInHand)]);
      if (report.alerts.length) block("Needs attention", ["Alert"], report.alerts.map((alert) => [alert]));

      sheet.columns.forEach((column, index) => {
        column.width = index === 0 ? 28 : 15;
        if (index > 0) column.numFmt = MONEY;
      });

      const buffer = await book.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(buffer), {
        headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="dsr-${date}.xlsx"` },
      });
    }

    const element = createElement(DsrPdf, { report }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="dsr-${date}.pdf"` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build the report";
    return NextResponse.json({ error: message }, { status: message.includes("permission") ? 403 : 500 });
  }
}
