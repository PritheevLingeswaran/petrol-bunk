import { AuditAction, Prisma } from "@prisma/client";
import { requireSession } from "@/server/guard";
import { db } from "@/server/db";
import { headers } from "next/headers";

type AuditInput = { outletId?: string; tableName: string; recordId: string; action: AuditAction; oldValue?: Prisma.InputJsonValue; newValue?: Prisma.InputJsonValue; businessDate?: Date; reason?: string };

export async function withAudit<T>(input: AuditInput, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const session = await requireSession();
  const requestHeaders = headers(); const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"); const userAgent = requestHeaders.get("user-agent");
  return db.$transaction(async (tx) => {
    const result = await work(tx);
    await tx.auditLog.create({ data: { ...input, userId: session.user.id, ipAddress, userAgent, changedFields: [] } });
    return result;
  });
}
