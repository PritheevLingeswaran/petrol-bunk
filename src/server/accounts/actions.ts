"use server";

import { revalidatePath } from "next/cache";
import { Decimal } from "@/lib/money";
import { businessDateFromInput } from "@/lib/date";
import { UnbalancedVoucherError } from "@/lib/accounts";
import { withAudit } from "@/server/audit";
import { requirePermission, requireUnlockedDate } from "@/server/guard";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import { postVoucher, reverseVoucher, type Tx } from "@/server/accounts/posting";
import { auditJson } from "@/server/accounts/operations-posting";
import { cancelVoucherSchema, reconcileSchema, voucherSchema } from "@/server/accounts/schemas";

export type ActionResult<T = { id: string }> = ({ ok: true } & T) | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const fail = (error: unknown): ActionResult<never> => ({
  ok: false,
  error: error instanceof UnbalancedVoucherError ? error.message : error instanceof Error ? error.message : "Something went wrong. Nothing was saved.",
});

const dec = (value: string | undefined): Decimal => new Decimal(value && value !== "" ? value : "0");

/**
 * Saves a manually entered voucher of any type.
 *
 * A voucher is never edited in place once it is posted: editing would rewrite
 * history a reader may already have relied on. Saving over an existing
 * voucher reverses it and posts a fresh one, so the audit trail shows both.
 */
export async function saveVoucher(payload: unknown): Promise<ActionResult<{ id: string; docNumber: string }>> {
  const parsed = voucherSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const input = parsed.data;

  try {
    await requirePermission("ACCOUNTS", input.id ? "modify" : "add");
    const businessDate = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(businessDate);
    const settings = await loadSettings(outletId);

    // Every account on the voucher must belong to this outlet.
    const accountIds = [...new Set(input.lines.map((line) => line.accountId))];
    const accounts = await db.account.findMany({ where: { id: { in: accountIds }, outletId, isActive: true }, select: { id: true } });
    if (accounts.length !== accountIds.length) return { ok: false, error: "One of the ledgers is not available in this outlet" };

    const result = await withAudit(
      {
        outletId,
        tableName: "vouchers",
        recordId: input.id ?? "new",
        action: input.id ? "UPDATE" : "CREATE",
        businessDate,
        newValue: auditJson(input),
      },
      async (tx: Tx) => {
        if (input.id) {
          const existing = await tx.voucher.findFirstOrThrow({ where: { id: input.id, outletId } });
          if (existing.status === "CANCELLED") throw new Error("That voucher is already cancelled");
          await reverseVoucher(tx, existing.id, "Replaced by a corrected voucher", session.user.id);
        }

        const voucher = await postVoucher(tx, {
          outletId,
          type: input.type,
          businessDate,
          narration: input.narration,
          createdById: session.user.id,
          partyAccountId: input.partyAccountId,
          instrumentType: input.instrumentType,
          instrumentNo: input.instrumentNo,
          instrumentDate: input.instrumentDate ? businessDateFromInput(input.instrumentDate) : undefined,
          bankName: input.bankName,
          financialYearStartMonth: settings.number("org.financialYearStartMonth"),
          lines: input.lines.map((line) => ({
            accountId: line.accountId,
            debit: dec(line.debit),
            credit: dec(line.credit),
            narration: line.narration,
            productId: line.productId,
            quantity: line.quantity ? dec(line.quantity) : undefined,
          })),
        });

        for (const attachment of input.attachments) {
          await tx.voucherAttachment.create({
            data: {
              outletId,
              voucherId: voucher.id,
              fileName: attachment.fileName,
              url: attachment.url,
              contentType: attachment.contentType,
              sizeBytes: attachment.sizeBytes,
              uploadedById: session.user.id,
            },
          });
        }
        return { id: voucher.id, docNumber: voucher.docNumber };
      },
    );

    revalidatePath("/accounts/vouchers");
    return { ok: true, ...result };
  } catch (error) {
    return fail(error);
  }
}

/** Cancels a voucher by posting its reversal. Nothing is ever deleted. */
export async function cancelVoucher(payload: unknown): Promise<ActionResult<{ id: string; reversalDocNumber: string }>> {
  const parsed = cancelVoucherSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Give a reason for cancelling this voucher" };

  try {
    const session = await requirePermission("ACCOUNTS", "delete");
    const voucher = await db.voucher.findUniqueOrThrow({ where: { id: parsed.data.id } });
    const { outletId } = await requireUnlockedDate(voucher.businessDate);
    if (voucher.outletId !== outletId) return { ok: false, error: "That voucher belongs to another outlet" };
    if (voucher.shiftSettlementId || voucher.purchaseId || voucher.billId) {
      return { ok: false, error: "This voucher was raised by a source document. Cancel the document itself and the entry will follow." };
    }

    const reversal = await withAudit(
      { outletId, tableName: "vouchers", recordId: voucher.id, action: "CANCEL", businessDate: voucher.businessDate, oldValue: auditJson(voucher), reason: parsed.data.reason },
      async (tx: Tx) => reverseVoucher(tx, voucher.id, parsed.data.reason, session.user.id),
    );

    revalidatePath("/accounts/vouchers");
    return { ok: true, id: voucher.id, reversalDocNumber: reversal.docNumber };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Marks bank entries cleared, or un-marks them. The reconciled balance is
 * always derived from these flags, never typed in.
 */
export async function setReconciled(payload: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = reconcileSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Select the entries to mark and give a clearing date" };
  const input = parsed.data;

  try {
    const session = await requirePermission("ACCOUNTS", "modify");
    const clearedOn = businessDateFromInput(input.clearedOn);
    const { outletId } = await requireUnlockedDate(clearedOn);

    const lines = await db.voucherLine.findMany({ where: { id: { in: input.lineIds }, outletId }, select: { id: true, businessDate: true } });
    if (lines.length !== input.lineIds.length) return { ok: false, error: "One of those entries is not in this outlet" };
    // A cheque cannot clear before it was written.
    const tooEarly = lines.find((line) => clearedOn < line.businessDate);
    if (tooEarly && input.reconciled) return { ok: false, error: "The clearing date is before the date of one of the selected entries" };

    const count = await withAudit(
      { outletId, tableName: "voucher_lines", recordId: input.lineIds.join(","), action: "UPDATE", businessDate: clearedOn, newValue: auditJson(input) },
      async (tx: Tx) => {
        const updated = await tx.voucherLine.updateMany({
          where: { id: { in: input.lineIds }, outletId },
          data: input.reconciled
            ? { isReconciled: true, clearedOn, bankRef: input.bankRef, reconciledById: session.user.id, reconciledAt: new Date() }
            : { isReconciled: false, clearedOn: null, bankRef: null, reconciledById: null, reconciledAt: null },
        });
        return updated.count;
      },
    );

    revalidatePath("/accounts/bank-book");
    return { ok: true, count };
  } catch (error) {
    return fail(error);
  }
}

/** Attaches an already-uploaded document to a voucher. */
export async function attachToVoucher(voucherId: string, file: { fileName: string; url: string; contentType?: string; sizeBytes?: number }): Promise<ActionResult> {
  try {
    const session = await requirePermission("ACCOUNTS", "modify");
    const voucher = await db.voucher.findUniqueOrThrow({ where: { id: voucherId } });
    const { outletId } = await requireUnlockedDate(voucher.businessDate);
    if (voucher.outletId !== outletId) return { ok: false, error: "That voucher belongs to another outlet" };

    const id = await withAudit(
      { outletId, tableName: "voucher_attachments", recordId: voucherId, action: "CREATE", businessDate: voucher.businessDate, newValue: auditJson(file) },
      async (tx: Tx) => {
        const created = await tx.voucherAttachment.create({
          data: { outletId, voucherId, fileName: file.fileName, url: file.url, contentType: file.contentType, sizeBytes: file.sizeBytes, uploadedById: session.user.id },
        });
        return created.id;
      },
    );

    revalidatePath("/accounts/vouchers");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function getVoucherDetail(voucherId: string) {
  await requirePermission("ACCOUNTS", "view");
  return db.voucher.findUnique({
    where: { id: voucherId },
    include: {
      lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { lineNo: "asc" } },
      attachments: true,
      partyAccount: { select: { name: true } },
    },
  });
}
