import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { requirePermission } from "@/server/guard";
import { businessDateToday } from "@/lib/date";
import { ReportPdf, type ReportDoc } from "@/server/accounts/pdf";
import * as excel from "@/server/accounts/excel";
import * as docs from "@/server/accounts/report-docs";
import { defaultRange, type DateRange } from "@/server/accounts/queries";

export const dynamic = "force-dynamic";
/** These reports pull the whole ledger; give them room. */
export const maxDuration = 120;

type Report =
  | "ledger" | "trial-balance" | "profit-loss" | "balance-sheet" | "cash-flow"
  | "book" | "debtors" | "ageing" | "statement" | "periodicals"
  | "gstr1" | "gstr3b" | "vouchers";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * One export endpoint for all twelve reports, in either format:
 *   /api/accounts/export?report=trial-balance&format=pdf&asOn=2026-09-20
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("ACCOUNTS", "view");

    const params = request.nextUrl.searchParams;
    const report = (params.get("report") ?? "trial-balance") as Report;
    const format = params.get("format") === "pdf" ? "pdf" : "excel";
    const fallback = defaultRange();
    const range: DateRange = { from: params.get("from") ?? fallback.from, to: params.get("to") ?? fallback.to };
    const asOn = params.get("asOn") ?? range.to ?? businessDateToday().toISOString().slice(0, 10);
    const accountId = params.get("accountId") ?? "";
    const customerId = params.get("customerId") ?? "";
    const months = Number(params.get("months") ?? 12);
    const type = params.get("type") ?? undefined;

    if ((report === "ledger" || report === "book") && !accountId) {
      return NextResponse.json({ error: "Choose a ledger first" }, { status: 400 });
    }
    if (report === "statement" && !customerId) {
      return NextResponse.json({ error: "Choose a customer first" }, { status: 400 });
    }

    const stamp = report === "statement" || report === "ledger" || report === "book" ? `${range.from}_${range.to}` : asOn;
    const filename = `${report}-${stamp}.${format === "pdf" ? "pdf" : "xlsx"}`;

    if (format === "pdf") {
      const builders: Record<Report, () => Promise<ReportDoc>> = {
        ledger: () => docs.ledgerDoc(accountId, range),
        "trial-balance": () => docs.trialBalanceDoc(asOn),
        "profit-loss": () => docs.profitAndLossDoc(range),
        "balance-sheet": () => docs.balanceSheetDoc(asOn),
        "cash-flow": () => docs.cashFlowDoc(range),
        book: () => docs.bookDoc(accountId, range),
        debtors: () => docs.debtorsDoc(asOn),
        ageing: () => docs.ageingDoc(asOn),
        statement: () => docs.statementDoc(customerId, range),
        periodicals: () => docs.periodicalsDoc(months),
        gstr1: () => docs.gstr1Doc(range),
        gstr3b: () => docs.gstr3bDoc(range),
        vouchers: () => docs.voucherRegisterDoc(range, type),
      };
      const builder = builders[report];
      if (!builder) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
      // react-pdf types its root as DocumentProps; our component returns one.
      const element = React.createElement(ReportPdf, { doc: await builder() }) as unknown as Parameters<typeof renderToBuffer>[0];
      const buffer = await renderToBuffer(element);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
      });
    }

    const workbooks: Record<Report, () => Promise<ArrayBuffer>> = {
      ledger: () => excel.ledgerWorkbook(accountId, range),
      "trial-balance": () => excel.trialBalanceWorkbook(asOn),
      "profit-loss": () => excel.profitAndLossWorkbook(range),
      "balance-sheet": () => excel.balanceSheetWorkbook(asOn),
      "cash-flow": () => excel.cashFlowWorkbook(range),
      book: () => excel.bookWorkbook(accountId, range),
      debtors: () => excel.debtorsWorkbook(asOn),
      ageing: () => excel.ageingWorkbook(asOn),
      statement: () => excel.statementWorkbook(customerId, range),
      periodicals: () => excel.periodicalsWorkbook(months),
      gstr1: () => excel.gstr1Workbook(range),
      gstr3b: () => excel.gstr3bWorkbook(range),
      vouchers: () => excel.voucherRegisterWorkbook(range, type),
    };
    const workbook = workbooks[report];
    if (!workbook) return NextResponse.json({ error: "Unknown report" }, { status: 400 });
    const buffer = await workbook();
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: message.includes("permission") ? 403 : 500 });
  }
}
