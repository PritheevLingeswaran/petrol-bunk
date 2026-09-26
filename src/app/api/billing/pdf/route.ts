import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import { InvoicePdf } from "@/server/billing/pdf";
import { getPrintableBills } from "@/server/billing/queries";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const requested = request.nextUrl.searchParams.get("layout");
  const layout = requested === "THERMAL_80MM" || requested === "A4" ? requested : "A5";
  if (!ids.length) return NextResponse.json({ error: "Choose at least one bill" }, { status: 400 });
  const bills = await getPrintableBills(ids);
  if (!bills.length) return NextResponse.json({ error: "No accessible bills found" }, { status: 404 });
  const qrCodes: Record<string, string> = {};
  for (const bill of bills) if (bill.signedQr) qrCodes[bill.id] = await QRCode.toDataURL(bill.signedQr, { margin: 0, width: 180 });
  const document = createElement(InvoicePdf, { bills, layout, qrCodes }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(document);
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="invoices-${layout.toLowerCase()}.pdf"`, "Cache-Control": "private, no-store" } });
}
