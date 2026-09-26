import { PayrollNav } from "@/components/payroll/nav";
import { SalaryRuns } from "@/components/payroll/salary-runs";
import { businessDateToday } from "@/lib/date";
import { getPayrollOptions, getSalaryRuns } from "@/server/payroll/queries";

export default async function Page() {
  const today = businessDateToday().toISOString().slice(0, 10);
  const [runs, options] = await Promise.all([
    getSalaryRuns(),
    getPayrollOptions(),
  ]);
  return (
    <div className="payroll-page">
      <PayrollNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">CALCULATE · REVIEW · POST · PAY</p>
          <h1>Salary calculation</h1>
          <p className="page-lede muted">
            Editable preview before the balanced journal reaches accounts.
          </p>
        </div>
      </div>
      <SalaryRuns
        runs={runs}
        paymentModes={options.paymentModes}
        today={today}
        currentMonth={today.slice(0, 7)}
        editable={options.editable}
      />
    </div>
  );
}
