import { z } from "zod";
const id = z.string().cuid();
export const rolePermissionSchema = z.object({
  roleId: id,
  module: z.enum([
    "DASHBOARD",
    "PUMP_OPERATIONS",
    "BILLING",
    "CUSTOMERS",
    "ACCOUNTS",
    "INVENTORY",
    "PURCHASES",
    "PAYROLL",
    "REPORTS",
    "USER_CONTROL",
    "SETTINGS",
    "AUDIT",
  ]),
  canView: z.boolean(),
  canAdd: z.boolean(),
  canModify: z.boolean(),
  canDelete: z.boolean(),
  canApprove: z.boolean(),
});
const effect = z.enum(["INHERIT", "GRANT", "REVOKE"]);
export const userControlSchema = z.object({
  userId: id,
  lockFromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  lockToDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  permissions: z.array(
    z.object({
      module: rolePermissionSchema.shape.module,
      view: effect,
      add: effect,
      modify: effect,
      delete: effect,
      approve: effect,
    }),
  ),
  screens: z.array(z.object({ screenKey: z.string().startsWith("/"), effect })),
});
