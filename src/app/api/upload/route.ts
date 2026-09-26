import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

export const runtime = "nodejs";
export async function POST(request: Request) { if (!(await auth())?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 }); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 5_000_000) return NextResponse.json({ error: "Choose an image under 5 MB" }, { status: 400 }); const ext = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png"; const name = `${randomUUID()}.${ext}`; const directory = path.join(process.cwd(), "public", "uploads"); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, name), Buffer.from(await file.arrayBuffer())); return NextResponse.json({ url: `/uploads/${name}` }); }
