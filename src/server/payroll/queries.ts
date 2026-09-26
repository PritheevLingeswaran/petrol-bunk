import { Decimal } from "@/lib/money";
import { attendanceSummary } from "@/lib/payroll";
import { businessDateFromInput } from "@/lib/date";
import { formatINR } from "@/lib/format";
import { db } from "@/server/db";
import { getOutletScope, requirePermission } from "@/server/guard";

const monthRange = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return {
    from: businessDateFromInput(`${month}-01`),
    to: new Date(Date.UTC(year, value, 0)),
  };
};
const iso = (date: Date) => date.toISOString().slice(0, 10);

export async function getPayrollOptions() {
  await requirePermission("PAYROLL", "view");
  const scope = await getOutletScope();
  const [employees, accounts, paymentModes] = await Promise.all([
    db.employee.findMany({
      where: { outletId: { in: scope.outletIds }, status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    db.account.findMany({
      where: { outletId: { in: scope.outletIds }, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    db.paymentMode.findMany({
      where: {
        outletId: { in: scope.outletIds },
        isActive: true,
        accountId: { not: null },
        type: { not: "CREDIT" },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { editable: !scope.allOutlets, employees, accounts, paymentModes };
}

export async function getAttendanceGrid(month: string) {
  const session = await requirePermission("PAYROLL", "view");
  const scope = await getOutletScope();
  const { from, to } = monthRange(month);
  const employeeFilter =
    session.user.role === "SALESMAN" ? { userId: session.user.id } : {};
  const employees = await db.employee.findMany({
    where: {
      outletId: { in: scope.outletIds },
      ...employeeFilter,
      joinedOn: { lte: to },
      OR: [{ leftOn: null }, { leftOn: { gte: from } }],
    },
    include: {
      attendance: { where: { businessDate: { gte: from, lte: to } } },
    },
    orderBy: { code: "asc" },
  });
  const days = Array.from(
    { length: to.getUTCDate() },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
  return {
    month,
    days,
    employees: employees.map((employee) => {
      const summary = attendanceSummary(
        employee.attendance.map((row) => ({
          status: row.status,
          overtimeHours: row.overtimeHours.toString(),
        })),
      );
      return {
        id: employee.id,
        code: employee.code,
        name: employee.name,
        marks: Object.fromEntries(
          employee.attendance.map((row) => [
            iso(row.businessDate),
            { status: row.status, overtimeHours: row.overtimeHours.toFixed(2) },
          ]),
        ),
        summary: {
          present: summary.present.toFixed(2),
          absent: summary.absent.toFixed(2),
          overtime: summary.overtime.toFixed(2),
        },
      };
    }),
  };
}

export async function getSalaryStructures() {
  await requirePermission("PAYROLL", "view");
  const scope = await getOutletScope();
  const rows = await db.salaryStructure.findMany({
    where: { outletId: { in: scope.outletIds } },
    include: { employee: true, account: true },
    orderBy: [
      { employee: { code: "asc" } },
      { sortOrder: "asc" },
      { effectiveFrom: "desc" },
    ],
  });
  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employee: `${row.employee.code} · ${row.employee.name}`,
    code: row.componentCode,
    name: row.componentName,
    type: row.type,
    amount: row.amount?.toFixed(2) ?? "",
    perDayRate: row.perDayRate?.toFixed(2) ?? "",
    perHourRate: row.perHourRate?.toFixed(2) ?? "",
    perShiftRate: row.perShiftRate?.toFixed(2) ?? "",
    perLitreRate: row.perLitreRate?.toFixed(4) ?? "",
    effectiveFrom: iso(row.effectiveFrom),
    account: row.account?.name ?? "",
  }));
}

export async function getSalaryRuns() {
  await requirePermission("PAYROLL", "view");
  const scope = await getOutletScope();
  const rows = await db.salaryRun.findMany({
    where: { outletId: { in: scope.outletIds } },
    include: { outlet: true, lines: { include: { employee: true } } },
    orderBy: [{ businessDate: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    outlet: row.outlet.name,
    month: `${row.periodYear}-${String(row.periodMonth).padStart(2, "0")}`,
    status: row.status,
    totalEarnings: row.totalEarnings.toFixed(2),
    totalDeductions: row.totalDeductions.toFixed(2),
    netPayable: row.netPayable.toFixed(2),
    employeeCount: row.employeeCount,
    lines: row.lines.map((line) => ({
      id: line.id,
      employeeId: line.employeeId,
      employee: `${line.employee.code} · ${line.employee.name}`,
      daysPayable: line.daysPayable.toFixed(2),
      daysPresent: line.daysPresent.toFixed(2),
      daysAbsent: line.daysAbsent.toFixed(2),
      overtimeHours: line.overtimeHours.toFixed(2),
      grossEarnings: line.grossEarnings.toFixed(2),
      totalDeductions: line.totalDeductions.toFixed(2),
      advanceRecovery: line.advanceRecovery.toFixed(2),
      shortRecovery: line.shortRecovery.toFixed(2),
      netPay: line.netPay.toFixed(2),
      components: line.components,
      isPaid: line.isPaid,
      remarks: line.remarks ?? "",
    })),
  }));
}

export async function getEmployeeLedger(
  employeeId: string,
  from?: string,
  to?: string,
) {
  const session = await requirePermission("PAYROLL", "view");
  const scope = await getOutletScope();
  const employee = await db.employee.findFirstOrThrow({
    where: {
      id: employeeId,
      outletId: { in: scope.outletIds },
      ...(session.user.role === "SALESMAN" ? { userId: session.user.id } : {}),
    },
  });
  if (!employee.accountId) return { employee, rows: [], balance: "0.00" };
  const rows = await db.voucherLine.findMany({
    where: {
      outletId: { in: scope.outletIds },
      accountId: employee.accountId,
      voucher: { status: "POSTED" },
      ...(from || to
        ? {
            businessDate: {
              ...(from ? { gte: businessDateFromInput(from) } : {}),
              ...(to ? { lte: businessDateFromInput(to) } : {}),
            },
          }
        : {}),
    },
    include: { voucher: true },
    orderBy: [{ businessDate: "asc" }, { lineNo: "asc" }],
  });
  let balance = new Decimal(0);
  return {
    employee,
    rows: rows.map((row) => {
      balance = balance.plus(row.debit.toString()).minus(row.credit.toString());
      return {
        id: row.id,
        date: iso(row.businessDate),
        document: row.voucher.docNumber,
        type: row.voucher.type,
        narration: row.narration ?? row.voucher.narration,
        debit: row.debit.toFixed(2),
        credit: row.credit.toFixed(2),
        balance: balance.toFixed(2),
      };
    }),
    balance: balance.toFixed(2),
    balanceDisplay: formatINR(balance),
  };
}

export { monthRange };
