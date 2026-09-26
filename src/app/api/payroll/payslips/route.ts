import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { db } from "@/server/db";
import { getOutletScope, requirePermission } from "@/server/guard";
import { PayslipPdf, type PayslipData } from "@/server/payroll/pdf";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requirePermission("PAYROLL", "view");
    const scope = await getOutletScope();
    const runId = request.nextUrl.searchParams.get("runId");
    const lineId = request.nextUrl.searchParams.get("lineId");
    if (!runId)
      return NextResponse.json(
        { error: "Choose a salary run" },
        { status: 400 },
      );
    const run = await db.salaryRun.findFirst({
      where: { id: runId, outletId: { in: scope.outletIds } },
      include: {
        outlet: true,
        lines: {
          where: lineId ? { id: lineId } : {},
          include: { employee: true },
          orderBy: { employee: { code: "asc" } },
        },
      },
    });
    if (!run?.lines.length)
      return NextResponse.json(
        { error: "No accessible payslips found" },
        { status: 404 },
      );
    const slips: PayslipData[] = run.lines.map((line) => ({
      outlet: run.outlet,
      month: `${run.periodYear}-${String(run.periodMonth).padStart(2, "0")}`,
      employee: line.employee,
      daysPresent: line.daysPresent.toFixed(2),
      daysAbsent: line.daysAbsent.toFixed(2),
      daysPayable: line.daysPayable.toFixed(2),
      overtimeHours: line.overtimeHours.toFixed(2),
      grossEarnings: line.grossEarnings.toFixed(2),
      totalDeductions: line.totalDeductions.toFixed(2),
      advanceRecovery: line.advanceRecovery.toFixed(2),
      shortRecovery: line.shortRecovery.toFixed(2),
      netPay: line.netPay.toFixed(2),
      components: Array.isArray(line.components)
        ? (line.components as PayslipData["components"])
        : [],
      isPaid: line.isPaid,
    }));
    const element = createElement(PayslipPdf, {
      slips,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslips-${slips[0].month}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "PDF generation failed",
      },
      { status: 500 },
    );
  }
}
