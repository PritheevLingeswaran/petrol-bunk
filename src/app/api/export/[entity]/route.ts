import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { listMaster } from "@/server/master/queries";
import { masterSchemas, type MasterEntity } from "@/server/master/schemas";

export async function GET(_: Request, { params }: { params: { entity: string } }) { if (!(params.entity in masterSchemas)) return new NextResponse("Unknown export", { status: 404 }); const entity = params.entity as MasterEntity; const records = await listMaster(entity); const headings = Array.from(new Set(records.flatMap((record) => Object.keys(record.values)))); const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(entity); sheet.addRow(headings); records.forEach((record) => sheet.addRow(headings.map((heading) => { const value = record.values[heading]; return Array.isArray(value) ? value.join(", ") : value; }))); sheet.getRow(1).font = { bold: true }; sheet.columns.forEach((column) => { column.width = 20; }); const buffer = await workbook.xlsx.writeBuffer(); return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename=${entity}.xlsx` } }); }
