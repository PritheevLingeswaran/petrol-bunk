import { db } from "@/server/db";
import {
  getOutletScope,
  requirePermission,
  requireSession,
} from "@/server/guard";
import { screenDefinitions } from "@/lib/navigation";
import {
  addBusinessDays,
  businessDateFromInput,
  businessDateToInput,
  indiaTimestamp,
} from "@/lib/date";

const indiaDayStart = (value: string) => indiaTimestamp(value, "00:00");
const indiaDayAfter = (value: string) =>
  indiaTimestamp(
    businessDateToInput(addBusinessDays(businessDateFromInput(value), 1)),
    "00:00",
  );

export async function getPermissionMatrix() {
  const session = await requirePermission("USER_CONTROL", "view");
  const roles = await db.role.findMany({
    include: { permissions: true },
    orderBy: { code: "asc" },
  });
  return { editable: session.user.role === "OWNER", roles };
}
export async function getUserControlData() {
  const session = await requirePermission("USER_CONTROL", "view");
  const users = await db.user.findMany({
    include: {
      role: true,
      outlets: { include: { outlet: true } },
      permissions: true,
      screenPermissions: true,
    },
    orderBy: { username: "asc" },
  });
  return {
    editable: session.user.role === "OWNER",
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role.code,
      status: user.status,
      outlets: user.outlets.map((row) => row.outlet.name).join(", "),
      lockFromDate: user.lockFromDate?.toISOString().slice(0, 10) ?? "",
      lockToDate: user.lockToDate?.toISOString().slice(0, 10) ?? "",
      permissions: user.permissions,
      screens: user.screenPermissions,
    })),
    screenDefinitions,
  };
}
export async function getLoginLogs(filters: {
  username?: string;
  success?: string;
  from?: string;
  to?: string;
}) {
  await requirePermission("AUDIT", "view");
  const scope = await getOutletScope();
  return db.loginLog.findMany({
    where: {
      OR: [{ outletId: { in: scope.outletIds } }, { outletId: null }],
      ...(filters.username
        ? { username: { contains: filters.username, mode: "insensitive" } }
        : {}),
      ...(filters.success === "true" || filters.success === "false"
        ? { success: filters.success === "true" }
        : {}),
      ...(filters.from || filters.to
        ? {
            attemptedAt: {
              ...(filters.from ? { gte: indiaDayStart(filters.from) } : {}),
              ...(filters.to ? { lt: indiaDayAfter(filters.to) } : {}),
            },
          }
        : {}),
    },
    include: { outlet: true },
    orderBy: { attemptedAt: "desc" },
    take: 500,
  });
}
export async function getAuditLogs(filters: {
  table?: string;
  userId?: string;
  from?: string;
  to?: string;
}) {
  await requirePermission("AUDIT", "view");
  const scope = await getOutletScope();
  const [rows, users, tables] = await Promise.all([
    db.auditLog.findMany({
      where: {
        outletId: { in: scope.outletIds },
        ...(filters.table ? { tableName: filters.table } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: indiaDayStart(filters.from) } : {}),
                ...(filters.to ? { lt: indiaDayAfter(filters.to) } : {}),
              },
            }
          : {}),
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.user.findMany({
      select: { id: true, username: true, name: true },
      orderBy: { username: "asc" },
    }),
    db.auditLog.findMany({
      where: { outletId: { in: scope.outletIds } },
      distinct: ["tableName"],
      select: { tableName: true },
      orderBy: { tableName: "asc" },
    }),
  ]);
  return { rows, users, tables: tables.map((row) => row.tableName) };
}
export async function requireOwner() {
  const session = await requireSession();
  if (session.user.role !== "OWNER")
    throw new Error(
      "Only the OWNER can change permissions and date restrictions",
    );
  return session;
}
