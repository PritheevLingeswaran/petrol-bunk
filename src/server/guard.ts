import { ModuleName, type RoleCode } from "@prisma/client";
import { cookies } from "next/headers";
import * as React from "react";

// React.cache is only exported under Next's react-server condition; the tsx scripts get a pass-through.
const perRequest: typeof React.cache = React.cache ?? ((fn) => fn);
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { businessDateToday } from "@/lib/date";
import { screenDefinitions, screenForPath } from "@/lib/navigation";
import { isDateWithinWindow } from "@/lib/access";

export type PermissionAction = "view" | "add" | "modify" | "delete" | "approve";
export type OutletScope = { outletIds: string[]; allOutlets: boolean };

/** One lookup per request: a session is a signed cookie, so suspension must be checked against the row. */
export const getAccountState = perRequest((userId: string) => db.user.findUnique({ where: { id: userId }, select: { status: true, mustChangePassword: true } }));

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthenticated");
  if ((await getAccountState(session.user.id))?.status !== "ACTIVE") throw new Error("This account is suspended");
  return session;
}

export async function getOutletScope(): Promise<OutletScope> {
  const session = await requireSession();
  const requested = cookies().get("pb-outlet")?.value;
  if (requested === "all" && session.user.role === "OWNER") return { outletIds: session.user.outletIds, allOutlets: true };
  const outletId = requested && session.user.outletIds.includes(requested) ? requested : session.user.defaultOutletId ?? session.user.outletIds[0];
  if (!outletId) throw new Error("No outlet is assigned to this user");
  return { outletIds: [outletId], allOutlets: false };
}

export async function requirePermission(module: ModuleName, action: PermissionAction) {
  const session = await requireSession();
  const role = await db.role.findUnique({
    where: { code: session.user.role },
    include: { permissions: { where: { module } } },
  });
  if (!role || (role.code === "AUDITOR" && action !== "view")) throw new Error("You do not have permission for this action");
  if (role.code === "OWNER") return session;
  const override = await db.userPermission.findUnique({ where: { userId_module: { userId: session.user.id, module } } });
  const value = override?.[action] ?? "INHERIT";
  const granted = value === "GRANT" || (value === "INHERIT" && Boolean(role.permissions[0]?.[`can${action[0].toUpperCase()}${action.slice(1)}` as keyof typeof role.permissions[number]]));
  if (!granted) throw new Error("You do not have permission for this action");
  return session;
}

export async function requireScreenAccess(pathname: string) {
  const screen = screenForPath(pathname); if (!screen) return requireSession();
  const session = await requirePermission(screen.module, "view");
  if (session.user.role === "OWNER") return session;
  const restriction = await db.userScreenPermission.findUnique({ where: { userId_screenKey: { userId: session.user.id, screenKey: screen.href } } });
  if (restriction?.effect === "REVOKE") throw new Error("You do not have permission to open this screen");
  return session;
}

export async function getAllowedScreenPaths() {
  const session = await requireSession(); if (session.user.role === "OWNER") return screenDefinitions.map((screen) => screen.href);
  const [role, overrides, screens] = await Promise.all([
    db.role.findUniqueOrThrow({ where: { code: session.user.role }, include: { permissions: true } }),
    db.userPermission.findMany({ where: { userId: session.user.id } }),
    db.userScreenPermission.findMany({ where: { userId: session.user.id } }),
  ]);
  return screenDefinitions.filter((screen) => { const roleGrant = role.permissions.find((row) => row.module === screen.module)?.canView ?? false; const override = overrides.find((row) => row.module === screen.module)?.view ?? "INHERIT"; const moduleGrant = override === "GRANT" || (override === "INHERIT" && roleGrant); const routeEffect = screens.find((row) => row.screenKey === screen.href)?.effect ?? "INHERIT"; return moduleGrant && routeEffect !== "REVOKE"; }).map((screen) => screen.href);
}

export async function requireUnlockedDate(businessDate = businessDateToday()) {
  const session = await requireSession();
  const scope = await getOutletScope();
  if (scope.allOutlets) throw new Error("Choose an outlet before changing master data");
  const [user, outlet] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { lockFromDate: true, lockToDate: true } }),
    db.outlet.findUniqueOrThrow({ where: { id: scope.outletIds[0] }, select: { booksClosedTill: true } }),
  ]);
  if (outlet.booksClosedTill && businessDate <= outlet.booksClosedTill && session.user.role !== "OWNER") throw new Error("Books are closed for this date");
  if (!isDateWithinWindow(businessDate, user.lockFromDate, user.lockToDate)) throw new Error("This date is outside your permitted entry window");
  return { session, outletId: scope.outletIds[0] };
}

export const canUseAllOutlets = (role: RoleCode): boolean => role === "OWNER";
