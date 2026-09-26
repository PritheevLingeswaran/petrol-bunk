"use server";
import { Decimal, round2 } from "@/lib/money";
import { attendanceSummary, calculateSalary } from "@/lib/payroll";
import { businessDateFromInput } from "@/lib/date";
import { withAudit } from "@/server/audit";
import { db } from "@/server/db";
import { requirePermission, requireUnlockedDate } from "@/server/guard";
import { auditJson, salesmanRecoverable } from "@/server/pump/services";
import {
  ensureEmployeeLedger,
  postVoucher,
  resolveAccount,
  type JournalLine,
} from "@/server/accounts/posting";
import { revalidatePath } from "next/cache";
import {
  attendanceBulkSchema,
  attendanceCsvSchema,
  salaryMonthSchema,
  salaryPaySchema,
  salaryPreviewSchema,
  salaryStructureSchema,
} from "@/server/payroll/schemas";
import { monthRange } from "@/server/payroll/queries";

type Result<T = { id: string }> =
  ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: unknown): Result<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : "Nothing was saved",
});

export async function bulkMarkAttendance(
  payload: unknown,
): Promise<Result<{ id: string; count: number }>> {
  const parsed = attendanceBulkSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Choose employees, dates and a mark" };
  try {
    await requirePermission("PAYROLL", "modify");
    const dates = parsed.data.dates.map(businessDateFromInput);
    const { outletId, session } = await requireUnlockedDate(dates[0]);
    for (const date of dates) await requireUnlockedDate(date);
    const employees = await db.employee.findMany({
      where: { id: { in: parsed.data.employeeIds }, outletId },
    });
    if (employees.length !== parsed.data.employeeIds.length)
      return { ok: false, error: "An employee belongs to another outlet" };
    let count = 0;
    await withAudit(
      {
        outletId,
        tableName: "attendance",
        recordId: "bulk",
        action: "UPDATE",
        businessDate: dates[0],
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        for (const employee of employees)
          for (const date of dates) {
            const existing = await tx.attendance.findFirst({
              where: {
                employeeId: employee.id,
                businessDate: date,
                shiftId: null,
              },
            });
            const data = {
              status: parsed.data.status,
              overtimeHours: new Decimal(parsed.data.overtimeHours ?? 0),
              markedById: session.user.id,
            };
            if (existing)
              await tx.attendance.update({ where: { id: existing.id }, data });
            else
              await tx.attendance.create({
                data: {
                  ...data,
                  outletId,
                  employeeId: employee.id,
                  businessDate: date,
                },
              });
            count += 1;
          }
      },
    );
    revalidatePath("/payroll/attendance");
    return { ok: true, id: "bulk", count };
  } catch (error) {
    return fail(error);
  }
}

export async function importAttendanceCsv(
  payload: unknown,
): Promise<Result<{ id: string; count: number }>> {
  const parsed = attendanceCsvSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Paste a biometric CSV" };
  try {
    await requirePermission("PAYROLL", "add");
    const lines = parsed.data.csv.trim().split(/\r?\n/).filter(Boolean);
    const aliases: Record<string, string> = {
      P: "PRESENT",
      A: "ABSENT",
      HD: "HALF_DAY",
      WO: "WEEKLY_OFF",
      CL: "CASUAL_LEAVE",
      SL: "SICK_LEAVE",
      OT: "OVERTIME",
    };
    const records = lines
      .slice(lines[0].toLowerCase().includes("employee") ? 1 : 0)
      .map((line) => {
        const [code, date, mark, overtime = "0"] = line
          .split(",")
          .map((value) => value.trim());
        return {
          code,
          date,
          status: aliases[mark.toUpperCase()] ?? mark.toUpperCase(),
          overtime,
        };
      });
    if (!records.length)
      return { ok: false, error: "The CSV has no attendance rows" };
    const firstDate = businessDateFromInput(records[0].date);
    const { outletId, session } = await requireUnlockedDate(firstDate);
    let count = 0;
    await withAudit(
      {
        outletId,
        tableName: "attendance",
        recordId: "csv",
        action: "CREATE",
        businessDate: firstDate,
        newValue: auditJson({ rows: records.length }),
      },
      async (tx) => {
        for (const record of records) {
          const date = businessDateFromInput(record.date);
          await requireUnlockedDate(date);
          const employee = await tx.employee.findFirstOrThrow({
            where: { outletId, code: record.code },
          });
          const status = record.status as
            | "PRESENT"
            | "ABSENT"
            | "HALF_DAY"
            | "WEEKLY_OFF"
            | "CASUAL_LEAVE"
            | "SICK_LEAVE"
            | "OVERTIME";
          const existing = await tx.attendance.findFirst({
            where: {
              employeeId: employee.id,
              businessDate: date,
              shiftId: null,
            },
          });
          const data = {
            status,
            overtimeHours: new Decimal(record.overtime),
            markedById: session.user.id,
          };
          if (existing)
            await tx.attendance.update({ where: { id: existing.id }, data });
          else
            await tx.attendance.create({
              data: {
                ...data,
                outletId,
                employeeId: employee.id,
                businessDate: date,
              },
            });
          count += 1;
        }
      },
    );
    revalidatePath("/payroll/attendance");
    return { ok: true, id: "csv", count };
  } catch (error) {
    return fail(error);
  }
}

export async function saveSalaryStructure(payload: unknown): Promise<Result> {
  const parsed = salaryStructureSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Correct the salary component" };
  try {
    await requirePermission("PAYROLL", "modify");
    const date = businessDateFromInput(parsed.data.effectiveFrom);
    const { outletId, session } = await requireUnlockedDate(date);
    const employee = await db.employee.findFirstOrThrow({
      where: { id: parsed.data.employeeId, outletId },
    });
    const existing = await db.salaryStructure.findUnique({
      where: {
        employeeId_componentCode_effectiveFrom: {
          employeeId: employee.id,
          componentCode: parsed.data.componentCode,
          effectiveFrom: date,
        },
      },
    });
    const id = await withAudit(
      {
        outletId,
        tableName: "salary_structures",
        recordId: existing?.id ?? "new",
        action: existing ? "UPDATE" : "CREATE",
        businessDate: date,
        oldValue: existing ? auditJson(existing) : undefined,
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        const data = {
          outletId,
          employeeId: employee.id,
          componentCode: parsed.data.componentCode,
          componentName: parsed.data.componentName,
          type: parsed.data.type,
          amount: parsed.data.amount ? new Decimal(parsed.data.amount) : null,
          perDayRate: parsed.data.perDayRate
            ? new Decimal(parsed.data.perDayRate)
            : null,
          perHourRate: parsed.data.perHourRate
            ? new Decimal(parsed.data.perHourRate)
            : null,
          perShiftRate: parsed.data.perShiftRate
            ? new Decimal(parsed.data.perShiftRate)
            : null,
          perLitreRate: parsed.data.perLitreRate
            ? new Decimal(parsed.data.perLitreRate)
            : null,
          effectiveFrom: date,
          accountId: parsed.data.accountId,
          createdById: session.user.id,
        };
        const row = existing
          ? await tx.salaryStructure.update({
              where: { id: existing.id },
              data,
            })
          : await tx.salaryStructure.create({ data });
        return row.id;
      },
    );
    revalidatePath("/payroll/structures");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function calculateSalaryMonth(payload: unknown): Promise<Result> {
  const parsed = salaryMonthSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Choose a payroll month" };
  try {
    await requirePermission("PAYROLL", "add");
    const { from, to } = monthRange(parsed.data.month);
    const { outletId, session } = await requireUnlockedDate(from);
    const employees = await db.employee.findMany({
      where: { outletId, status: "ACTIVE" },
      include: {
        attendance: { where: { businessDate: { gte: from, lte: to } } },
        salaryStructures: {
          where: {
            effectiveFrom: { lte: to },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
          },
          orderBy: { effectiveFrom: "desc" },
        },
      },
    });
    const year = from.getUTCFullYear();
    const month = from.getUTCMonth() + 1;
    const existing = await db.salaryRun.findUnique({
      where: {
        outletId_periodYear_periodMonth: {
          outletId,
          periodYear: year,
          periodMonth: month,
        },
      },
    });
    if (existing && existing.status !== "DRAFT")
      return { ok: false, error: "This salary month is already posted" };
    const id = await withAudit(
      {
        outletId,
        tableName: "salary_runs",
        recordId: existing?.id ?? "new",
        action: existing ? "UPDATE" : "CREATE",
        businessDate: from,
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        const run = existing
          ? await tx.salaryRun.update({
              where: { id: existing.id },
              data: { fromDate: from, toDate: to },
            })
          : await tx.salaryRun.create({
              data: {
                outletId,
                businessDate: from,
                periodMonth: month,
                periodYear: year,
                fromDate: from,
                toDate: to,
                createdById: session.user.id,
              },
            });
        let earnings = new Decimal(0);
        let deductions = new Decimal(0);
        let employer = new Decimal(0);
        let net = new Decimal(0);
        for (const employee of employees) {
          const attendance = attendanceSummary(
            employee.attendance.map((row) => ({
              status: row.status,
              overtimeHours: row.overtimeHours.toString(),
            })),
          );
          const readings = await tx.nozzleReading.aggregate({
            where: {
              outletId,
              salesmanEmployeeId: employee.id,
              businessDate: { gte: from, lte: to },
            },
            _sum: { saleLitres: true },
          });
          const shifts = await tx.nozzleReading.findMany({
            where: {
              outletId,
              salesmanEmployeeId: employee.id,
              businessDate: { gte: from, lte: to },
            },
            distinct: ["shiftEntryId"],
            select: { shiftEntryId: true },
          });
          const latest = new Map<
            string,
            (typeof employee.salaryStructures)[number]
          >();
          for (const component of employee.salaryStructures)
            if (!latest.has(component.componentCode))
              latest.set(component.componentCode, component);
          const short = await salesmanRecoverable(outletId, employee.id, to);
          const calculated = calculateSalary({
            components: [...latest.values()].map((row) => ({
              code: row.componentCode,
              name: row.componentName,
              type: row.type,
              amount: row.amount?.toString(),
              perDayRate: row.perDayRate?.toString(),
              perHourRate: row.perHourRate?.toString(),
              perShiftRate: row.perShiftRate?.toString(),
              perLitreRate: row.perLitreRate?.toString(),
            })),
            daysPayable: attendance.payable,
            overtimeHours: attendance.overtime,
            shiftsWorked: String(shifts.length),
            litresSold: readings._sum.saleLitres?.toString() ?? "0",
            shortRecoverable: Decimal.max(short, 0),
          });
          const components = calculated.components.map((row) => ({
            ...row,
            amount: row.amount.toFixed(2),
          }));
          await tx.salaryLine.upsert({
            where: {
              salaryRunId_employeeId: {
                salaryRunId: run.id,
                employeeId: employee.id,
              },
            },
            create: {
              salaryRunId: run.id,
              employeeId: employee.id,
              daysPayable: attendance.payable,
              daysPresent: attendance.present,
              daysAbsent: attendance.absent,
              overtimeHours: attendance.overtime,
              grossEarnings: calculated.grossEarnings,
              totalDeductions: calculated.totalDeductions,
              advanceRecovery: calculated.advanceRecovery,
              shortRecovery: calculated.shortRecovery,
              netPay: calculated.netPay,
              components,
            },
            update: {
              daysPayable: attendance.payable,
              daysPresent: attendance.present,
              daysAbsent: attendance.absent,
              overtimeHours: attendance.overtime,
              grossEarnings: calculated.grossEarnings,
              totalDeductions: calculated.totalDeductions,
              advanceRecovery: calculated.advanceRecovery,
              shortRecovery: calculated.shortRecovery,
              netPay: calculated.netPay,
              components,
            },
          });
          earnings = earnings.plus(calculated.grossEarnings);
          deductions = deductions.plus(calculated.totalDeductions);
          employer = employer.plus(calculated.employerCost);
          net = net.plus(calculated.netPay);
        }
        await tx.salaryRun.update({
          where: { id: run.id },
          data: {
            totalEarnings: round2(earnings),
            totalDeductions: round2(deductions),
            totalEmployerCost: round2(employer),
            netPayable: round2(net),
            employeeCount: employees.length,
          },
        });
        return run.id;
      },
    );
    revalidatePath("/payroll/salary-runs");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function postSalaryRun(payload: unknown): Promise<Result> {
  const parsed = salaryPreviewSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Correct the salary preview" };
  try {
    const session = await requirePermission("PAYROLL", "approve");
    const run = await db.salaryRun.findUniqueOrThrow({
      where: { id: parsed.data.runId },
      include: { lines: true },
    });
    const { outletId } = await requireUnlockedDate(run.businessDate);
    if (run.outletId !== outletId || run.status !== "DRAFT")
      return {
        ok: false,
        error: "Only a draft salary run in this outlet can be posted",
      };
    const id = await withAudit(
      {
        outletId,
        tableName: "salary_runs",
        recordId: run.id,
        action: "APPROVE",
        businessDate: run.businessDate,
        oldValue: auditJson(run),
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        for (const edit of parsed.data.lines) {
          const expected = run.lines.find((line) => line.id === edit.id);
          if (!expected)
            throw new Error("A preview row belongs to another salary run");
          await tx.salaryLine.update({
            where: { id: edit.id },
            data: {
              grossEarnings: new Decimal(edit.grossEarnings),
              totalDeductions: new Decimal(edit.totalDeductions),
              shortRecovery: new Decimal(edit.shortRecovery),
              advanceRecovery: new Decimal(edit.advanceRecovery),
              netPay: new Decimal(edit.netPay),
              remarks: edit.remarks,
            },
          });
        }
        const lines = await tx.salaryLine.findMany({
          where: { salaryRunId: run.id },
          include: { employee: true },
        });
        const salaryExpense = await resolveAccount(
          tx,
          outletId,
          "SALARY_EXPENSE",
          "SALARIES",
        );
        const deductionPayable = await resolveAccount(
          tx,
          outletId,
          "PAYROLL_DEDUCTIONS",
          "PAYROLL_PAY",
        );
        const journal: JournalLine[] = [
          {
            accountId: salaryExpense.id,
            debit: lines.reduce(
              (sum, row) => sum.plus(row.grossEarnings.toString()),
              new Decimal(0),
            ),
            narration: `Salary ${run.periodMonth}/${run.periodYear}`,
          },
        ];
        for (const line of lines) {
          const employeeLedger = line.employee.accountId
            ? { id: line.employee.accountId }
            : await ensureEmployeeLedger(tx, outletId, line.employeeId);
          const recoveries = new Decimal(line.shortRecovery.toString()).plus(
            line.advanceRecovery.toString(),
          );
          const employeeCredit = new Decimal(line.netPay.toString()).plus(
            recoveries,
          );
          const statutory = new Decimal(line.totalDeductions.toString()).minus(
            recoveries,
          );
          if (employeeCredit.gt(0))
            journal.push({
              accountId: employeeLedger.id,
              credit: employeeCredit,
              employeeId: line.employeeId,
              narration: "Salary payable and recoveries",
            });
          if (statutory.gt(0))
            journal.push({
              accountId: deductionPayable.id,
              credit: statutory,
              employeeId: line.employeeId,
              narration: "Payroll statutory deductions",
            });
        }
        await postVoucher(tx, {
          outletId,
          type: "SALARY",
          businessDate: run.businessDate,
          narration: `Salary for ${run.periodMonth}/${run.periodYear}`,
          salaryRunId: run.id,
          createdById: session.user.id,
          lines: journal,
        });
        const totalEarnings = lines.reduce(
          (sum, row) => sum.plus(row.grossEarnings.toString()),
          new Decimal(0),
        );
        const totalDeductions = lines.reduce(
          (sum, row) => sum.plus(row.totalDeductions.toString()),
          new Decimal(0),
        );
        const netPayable = lines.reduce(
          (sum, row) => sum.plus(row.netPay.toString()),
          new Decimal(0),
        );
        await tx.salaryRun.update({
          where: { id: run.id },
          data: {
            status: "APPROVED",
            approvedById: session.user.id,
            approvedAt: new Date(),
            totalEarnings,
            totalDeductions,
            netPayable,
          },
        });
        return run.id;
      },
    );
    revalidatePath("/payroll/salary-runs");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function paySalaryLines(
  payload: unknown,
): Promise<Result<{ id: string; count: number }>> {
  const parsed = salaryPaySchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Choose salary rows, payment mode and date" };
  try {
    const session = await requirePermission("PAYROLL", "modify");
    const date = businessDateFromInput(parsed.data.businessDate);
    const { outletId } = await requireUnlockedDate(date);
    const mode = await db.paymentMode.findFirstOrThrow({
      where: { id: parsed.data.paymentModeId, outletId, isActive: true },
      include: { account: true },
    });
    if (!mode.account)
      return { ok: false, error: "That payment mode has no ledger" };
    const rows = await db.salaryLine.findMany({
      where: {
        id: { in: parsed.data.salaryLineIds },
        isPaid: false,
        salaryRun: { outletId, status: "APPROVED" },
      },
      include: { employee: true, salaryRun: true },
    });
    if (rows.length !== parsed.data.salaryLineIds.length)
      return {
        ok: false,
        error: "A selected payslip is not approved or is already paid",
      };
    const id = await withAudit(
      {
        outletId,
        tableName: "salary_lines",
        recordId: parsed.data.salaryLineIds.join(","),
        action: "UPDATE",
        businessDate: date,
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        for (const row of rows) {
          const ledger = row.employee.accountId
            ? { id: row.employee.accountId }
            : await ensureEmployeeLedger(tx, outletId, row.employeeId);
          await postVoucher(tx, {
            outletId,
            type: "PAYMENT",
            businessDate: date,
            narration: `Salary paid · ${row.employee.name} · ${row.salaryRun.periodMonth}/${row.salaryRun.periodYear}`,
            createdById: session.user.id,
            lines: [
              {
                accountId: ledger.id,
                debit: row.netPay,
                employeeId: row.employeeId,
              },
              { accountId: mode.account!.id, credit: row.netPay },
            ],
          });
          await tx.salaryLine.update({
            where: { id: row.id },
            data: { isPaid: true, paidAt: new Date() },
          });
        }
        const runIds = [...new Set(rows.map((row) => row.salaryRunId))];
        for (const runId of runIds)
          if (
            !(await tx.salaryLine.findFirst({
              where: { salaryRunId: runId, isPaid: false },
            }))
          )
            await tx.salaryRun.update({
              where: { id: runId },
              data: { status: "PAID", paidAt: new Date() },
            });
        return rows[0].salaryRunId;
      },
    );
    revalidatePath("/payroll/salary-runs");
    return { ok: true, id, count: rows.length };
  } catch (error) {
    return fail(error);
  }
}
