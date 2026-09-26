import { z } from "zod";

// bcrypt ignores anything past 72 bytes.
const password = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");
const id = z.string().min(1);

export const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), next: password, confirm: z.string() })
  .refine((data) => data.next === data.confirm, { path: ["confirm"], message: "The two new passwords do not match" })
  .refine((data) => data.next !== data.current, { path: ["next"], message: "Choose a password different from the current one" });

/** OWNER is deliberately absent: a new owner is a business decision, not a form. */
export const CREATABLE_ROLES = ["MANAGER", "ACCOUNTANT", "CASHIER", "SALESMAN", "AUDITOR"] as const;

export const createUserSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, "3–32 characters: letters, digits, dot, dash or underscore"),
  name: z.string().trim().min(1, "Enter the person's name").max(80),
  role: z.enum(CREATABLE_ROLES),
  outletIds: z.array(id).min(1, "Choose at least one outlet"),
  password,
});

export const resetPasswordSchema = z.object({ userId: id, password });

export const userStatusSchema = z.object({ userId: id, status: z.enum(["ACTIVE", "SUSPENDED"]) });
