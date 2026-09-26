import { renderToBuffer } from "@react-pdf/renderer";
import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { InspectionPdf, type InspectionPdfData } from "@/server/inventory/pdf";
import { getInspectionDetail } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "Choose an inspection" },
        { status: 400 },
      );
    const row = await getInspectionDetail(id);
    if (!row)
      return NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      );
    const report: InspectionPdfData = {
      outlet: row.outlet,
      businessDate: row.businessDate.toISOString().slice(0, 10),
      type: row.type,
      inspectorName: row.inspectorName,
      inspectorDesignation: row.inspectorDesignation,
      organisation: row.organisation,
      referenceNo: row.referenceNo,
      result: row.result,
      observations: row.observations,
      correctiveAction: row.correctiveAction,
      correctiveActionDueDate:
        row.correctiveActionDueDate?.toISOString().slice(0, 10) ?? null,
      signatureUrl: row.signatureUrl,
      items: row.items.map((item) => ({
        category: item.category,
        label: item.label,
        result: item.result,
        measuredValue: item.measuredValue?.toFixed(2) ?? null,
        expectedValue: item.expectedValue?.toFixed(2) ?? null,
        unit: item.unit,
        observation: item.observation,
        correctiveAction: item.correctiveAction,
      })),
      photos: row.photos.map((photo) => ({
        url: photo.url,
        caption: photo.caption,
      })),
    };
    const element = createElement(InspectionPdf, {
      report,
    }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="inspection-${report.businessDate}.pdf"`,
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
