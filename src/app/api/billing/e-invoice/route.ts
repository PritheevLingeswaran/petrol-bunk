import { NextRequest, NextResponse } from "next/server";
import { getOutletScope, requirePermission } from "@/server/guard";
import { buildEInvoice } from "@/server/billing/services";
import { db } from "@/server/db";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { await requirePermission("BILLING", "view"); const id = request.nextUrl.searchParams.get("id"); if (!id) return NextResponse.json({ error: "Bill ID is required" }, { status: 400 }); const scope = await getOutletScope(); const bill = await db.bill.findFirst({ where: { id, outletId: { in: scope.outletIds } }, select: { outletId: true, docNumber: true } }); if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 }); const result = await buildEInvoice(bill.outletId, id); if (!result.payload) return NextResponse.json({ error: "Mandatory fields are missing", missing: result.missing }, { status: 422 }); return new NextResponse(JSON.stringify(result.payload, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${bill.docNumber}.json"` } }); }
