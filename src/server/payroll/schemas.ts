import { z } from "zod";
const id = z.string().cuid();
const decimal = z.string().regex(/^\d+(\.\d+)?$/);
const optionalDecimal = z
  .union([decimal, z.literal("")])
  .optional()
  .transform((value) => value || undefined);
export const attendanceBulkSchema = z.object({
  employeeIds: z.array(id).min(1),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  status: z.enum([
    "PRESENT",
    "ABSENT",
    "HALF_DAY",
    "WEEKLY_OFF",
    "CASUAL_LEAVE",
    "SICK_LEAVE",
    "PAID_LEAVE",
    "UNPAID_LEAVE",
    "HOLIDAY",
    "OVERTIME",
  ]),
  overtimeHours: optionalDecimal,
});
export const attendanceCsvSchema = z.object({ csv: z.string().min(1) });
export const salaryStructureSchema = z.object({
  employeeId: id,
  componentCode: z.string().trim().min(2),
  componentName: z.string().trim().min(2),
  type: z.enum(["EARNING", "DEDUCTION", "EMPLOYER_CONTRIBUTION"]),
  amount: optionalDecimal,
  perDayRate: optionalDecimal,
  perHourRate: optionalDecimal,
  perShiftRate: optionalDecimal,
  perLitreRate: optionalDecimal,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountId: z
    .union([id, z.literal("")])
    .optional()
    .transform((value) => value || undefined),
});
export const salaryMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});
export const salaryPreviewSchema = z.object({
  runId: id,
  lines: z.array(
    z.object({
      id,
      grossEarnings: decimal,
      totalDeductions: decimal,
      shortRecovery: decimal,
      advanceRecovery: decimal,
      netPay: decimal,
      remarks: z.string().optional(),
    }),
  ),
});
export const salaryPaySchema = z.object({
  salaryLineIds: z.array(id).min(1),
  paymentModeId: id,
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
