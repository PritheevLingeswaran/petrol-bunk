import { Decimal, round2 } from "@/lib/money";

export type AttendanceMark = { status: string; overtimeHours?: Decimal.Value };

export function attendanceSummary(marks: AttendanceMark[]) {
  let present = new Decimal(0);
  let absent = new Decimal(0);
  let payable = new Decimal(0);
  let overtime = new Decimal(0);
  for (const mark of marks) {
    if (mark.status === "PRESENT" || mark.status === "OVERTIME")
      present = present.plus(1);
    if (mark.status === "HALF_DAY") present = present.plus("0.5");
    if (mark.status === "ABSENT" || mark.status === "UNPAID_LEAVE")
      absent = absent.plus(1);
    if (mark.status === "HALF_DAY") absent = absent.plus("0.5");
    if (
      [
        "PRESENT",
        "OVERTIME",
        "WEEKLY_OFF",
        "HOLIDAY",
        "PAID_LEAVE",
        "CASUAL_LEAVE",
        "SICK_LEAVE",
      ].includes(mark.status)
    )
      payable = payable.plus(1);
    if (mark.status === "HALF_DAY") payable = payable.plus("0.5");
    overtime = overtime.plus(new Decimal(mark.overtimeHours ?? 0));
  }
  return {
    present: round2(present),
    absent: round2(absent),
    payable: round2(payable),
    overtime: round2(overtime),
  };
}

export type SalaryComponentInput = {
  code: string;
  name: string;
  type: "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";
  amount?: Decimal.Value | null;
  perDayRate?: Decimal.Value | null;
  perHourRate?: Decimal.Value | null;
  perShiftRate?: Decimal.Value | null;
  perLitreRate?: Decimal.Value | null;
};

export function calculateSalary(input: {
  components: SalaryComponentInput[];
  daysPayable: Decimal.Value;
  overtimeHours: Decimal.Value;
  shiftsWorked: Decimal.Value;
  litresSold: Decimal.Value;
  shortRecoverable: Decimal.Value;
  advanceRecovery?: Decimal.Value;
}) {
  const computed = input.components.map((component) => {
    const amount = new Decimal(component.amount ?? 0)
      .plus(new Decimal(component.perDayRate ?? 0).mul(input.daysPayable))
      .plus(new Decimal(component.perHourRate ?? 0).mul(input.overtimeHours))
      .plus(new Decimal(component.perShiftRate ?? 0).mul(input.shiftsWorked))
      .plus(new Decimal(component.perLitreRate ?? 0).mul(input.litresSold));
    return {
      code: component.code,
      name: component.name,
      type: component.type,
      amount: round2(amount),
    };
  });
  const earnings = computed
    .filter((row) => row.type === "EARNING")
    .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  const deductions = computed
    .filter((row) => row.type === "DEDUCTION")
    .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  const employerCost = computed
    .filter((row) => row.type === "EMPLOYER_CONTRIBUTION")
    .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  const advance = round2(new Decimal(input.advanceRecovery ?? 0));
  const recoverableRoom = Decimal.max(
    earnings.minus(deductions).minus(advance),
    0,
  );
  const shortRecovery = round2(
    Decimal.min(new Decimal(input.shortRecoverable), recoverableRoom),
  );
  const totalDeductions = round2(deductions.plus(advance).plus(shortRecovery));
  return {
    components: computed,
    grossEarnings: round2(earnings),
    totalDeductions,
    employerCost: round2(employerCost),
    shortRecovery,
    advanceRecovery: advance,
    netPay: round2(Decimal.max(earnings.minus(totalDeductions), 0)),
  };
}
