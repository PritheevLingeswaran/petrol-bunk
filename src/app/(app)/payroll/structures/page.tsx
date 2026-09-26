import { PayrollNav } from "@/components/payroll/nav";
import { StructureManager } from "@/components/payroll/structure-manager";
import { businessDateToday } from "@/lib/date";
import {
  getPayrollOptions,
  getSalaryStructures,
} from "@/server/payroll/queries";

export default async function Page() {
  const [rows, options] = await Promise.all([
    getSalaryStructures(),
    getPayrollOptions(),
  ]);
  return (
    <div className="payroll-page">
      <PayrollNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">EFFECTIVE-DATED COMPONENTS</p>
          <h1>Salary structure</h1>
          <p className="page-lede muted">
            Flat, attendance, shift, litre and overtime-linked earnings and
            deductions.
          </p>
        </div>
      </div>
      <StructureManager
        rows={rows}
        employees={options.employees}
        accounts={options.accounts}
        today={businessDateToday().toISOString().slice(0, 10)}
        editable={options.editable}
      />
    </div>
  );
}
