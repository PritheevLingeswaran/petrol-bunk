"use server";
import { revalidatePath } from "next/cache";
import { businessDateFromInput } from "@/lib/date";
import { withAudit } from "@/server/audit";
import { db } from "@/server/db";
import { requireOwner } from "@/server/admin/queries";
import {
  rolePermissionSchema,
  userControlSchema,
} from "@/server/admin/schemas";
import { auditJson } from "@/server/pump/services";

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: unknown): Result => ({
  ok: false,
  error: error instanceof Error ? error.message : "Nothing was saved",
});
export async function saveRolePermission(payload: unknown): Promise<Result> {
  const parsed = rolePermissionSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Correct the permission row" };
  try {
    await requireOwner();
    const role = await db.role.findUniqueOrThrow({
      where: { id: parsed.data.roleId },
    });
    if (
      role.code === "AUDITOR" &&
      (parsed.data.canAdd ||
        parsed.data.canModify ||
        parsed.data.canDelete ||
        parsed.data.canApprove)
    )
      return {
        ok: false,
        error: "AUDITOR can never receive write permissions",
      };
    const old = await db.permission.findUnique({
      where: { roleId_module: { roleId: role.id, module: parsed.data.module } },
    });
    await withAudit(
      {
        tableName: "permissions",
        recordId: old?.id ?? `${role.code}:${parsed.data.module}`,
        action: old ? "UPDATE" : "CREATE",
        oldValue: old ? auditJson(old) : undefined,
        newValue: auditJson(parsed.data),
      },
      (tx) =>
        tx.permission.upsert({
          where: {
            roleId_module: { roleId: role.id, module: parsed.data.module },
          },
          create: parsed.data,
          update: {
            canView: parsed.data.canView,
            canAdd: parsed.data.canAdd,
            canModify: parsed.data.canModify,
            canDelete: parsed.data.canDelete,
            canApprove: parsed.data.canApprove,
          },
        }),
    );
    revalidatePath("/admin/permissions");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
export async function saveUserControl(payload: unknown): Promise<Result> {
  const parsed = userControlSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Correct the user restrictions" };
  try {
    await requireOwner();
    const existing = await db.user.findUniqueOrThrow({
      where: { id: parsed.data.userId },
      include: { permissions: true, screenPermissions: true },
    });
    await withAudit(
      {
        tableName: "users",
        recordId: existing.id,
        action: "UPDATE",
        oldValue: auditJson(existing),
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            lockFromDate: parsed.data.lockFromDate
              ? businessDateFromInput(parsed.data.lockFromDate)
              : null,
            lockToDate: parsed.data.lockToDate
              ? businessDateFromInput(parsed.data.lockToDate)
              : null,
          },
        });
        for (const row of parsed.data.permissions)
          await tx.userPermission.upsert({
            where: {
              userId_module: { userId: existing.id, module: row.module },
            },
            create: { userId: existing.id, ...row },
            update: row,
          });
        for (const row of parsed.data.screens)
          await tx.userScreenPermission.upsert({
            where: {
              userId_screenKey: {
                userId: existing.id,
                screenKey: row.screenKey,
              },
            },
            create: { userId: existing.id, ...row },
            update: { effect: row.effect },
          });
      },
    );
    revalidatePath("/admin/user-control");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
