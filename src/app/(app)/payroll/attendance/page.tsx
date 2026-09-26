import { AttendanceGrid } from "@/components/payroll/attendance-grid";
import { PayrollNav } from "@/components/payroll/nav";
import { businessDateToday } from "@/lib/date";
import { getAttendanceGrid, getPayrollOptions } from "@/server/payroll/queries";

export default async function Page({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const month =
    searchParams.month ?? businessDateToday().toISOString().slice(0, 7);
  const [grid, options] = await Promise.all([
    getAttendanceGrid(month),
    getPayrollOptions(),
  ]);
  return (
    <div className="payroll-page">
      <PayrollNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">MONTHLY ROSTER</p>
          <h1>Employee attendance</h1>
          <p className="page-lede muted">
            P / A / HD / WO / CL / SL / OT with day and employee bulk marking.
          </p>
        </div>
      </div>
      <AttendanceGrid {...grid} editable={options.editable} />
    </div>
  );
}
