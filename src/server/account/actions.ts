"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { signOut } from "@/server/auth";
import { withAudit } from "@/server/audit";
import { db } from "@/server/db";
import { requireSession } from "@/server/guard";
import { requireOwner } from "@/server/admin/queries";
import { changePasswordSchema, createUserSchema, resetPasswordSchema, userStatusSchema } from "@/server/account/schemas";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
const fail = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : "Nothing was saved" });
const invalid = (fieldErrors: Record<string, string[] | undefined>): Result => ({ ok: false, error: "Correct the highlighted fields", fieldErrors });
const hash = (password: string) => bcrypt.hash(password, 12);

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Password hashes never enter the audit log — only the fact of the change. */
export async function changeOwnPassword(payload: unknown): Promise<Result> {
  const parsed = changePasswordSchema.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  try {
    const session = await requireSession();
    const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
    if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) return invalid({ current: ["Current password is wrong"] });
    const passwordHash = await hash(parsed.data.next);
    await withAudit({ tableName: "users", recordId: user.id, action: "UPDATE", newValue: { event: "PASSWORD_CHANGED" } }, (tx) =>
      tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() } }),
    );
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createUser(payload: unknown): Promise<Result> {
  const parsed = createUserSchema.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  try {
    const session = await requireOwner();
    const { username, name, role, outletIds, password } = parsed.data;
    // Never trust client outlet ids: only outlets the owner holds can be granted.
    if (outletIds.some((outletId) => !session.user.outletIds.includes(outletId))) return invalid({ outletIds: ["Choose from your own outlets"] });
    if (await db.user.findUnique({ where: { username } })) return invalid({ username: ["This username is already taken"] });
    const roleRow = await db.role.findUniqueOrThrow({ where: { code: role } });
    const passwordHash = await hash(password);
    await withAudit({ tableName: "users", recordId: username, action: "CREATE", newValue: { username, name, role, outletIds } }, (tx) =>
      tx.user.create({
        data: {
          username, name, passwordHash, roleId: roleRow.id, defaultOutletId: outletIds[0], mustChangePassword: true, createdById: session.user.id,
          outlets: { create: outletIds.map((outletId) => ({ outletId })) },
        },
      }),
    );
    revalidatePath("/admin/user-control");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Sets a temporary password the user must replace at next sign-in, and lifts any lockout. */
export async function resetUserPassword(payload: unknown): Promise<Result> {
  const parsed = resetPasswordSchema.safeParse(payload);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  try {
    await requireOwner();
    const passwordHash = await hash(parsed.data.password);
    await withAudit({ tableName: "users", recordId: parsed.data.userId, action: "UPDATE", newValue: { event: "PASSWORD_RESET" } }, (tx) =>
      tx.user.update({ where: { id: parsed.data.userId }, data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } }),
    );
    revalidatePath("/admin/user-control");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/** Suspending blocks sign-in without deleting anything the user posted. */
export async function setUserStatus(payload: unknown): Promise<Result> {
  const parsed = userStatusSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Choose a user and a status" };
  try {
    const session = await requireOwner();
    if (parsed.data.userId === session.user.id) return { ok: false, error: "You cannot suspend your own account" };
    const existing = await db.user.findUniqueOrThrow({ where: { id: parsed.data.userId }, select: { status: true } });
    await withAudit({ tableName: "users", recordId: parsed.data.userId, action: "UPDATE", oldValue: existing, newValue: { status: parsed.data.status } }, (tx) =>
      tx.user.update({ where: { id: parsed.data.userId }, data: { status: parsed.data.status, ...(parsed.data.status === "ACTIVE" && { failedLoginCount: 0, lockedUntil: null }) } }),
    );
    revalidatePath("/admin/user-control");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
