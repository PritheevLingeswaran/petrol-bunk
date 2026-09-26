import { PayrollNav } from "@/components/payroll/nav";
import { getSalaryRuns } from "@/server/payroll/queries";
import { formatINR } from "@/lib/format";

export default async function Page({
  searchParams,
}: {
  searchParams: { runId?: string };
}) {
  const runs = await getSalaryRuns();
  const run = runs.find((row) => row.id === searchParams.runId) ?? runs[0];
  return (
    <div className="payroll-page">
      <PayrollNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">SERVER-RENDERED PDF</p>
          <h1>Payslips</h1>
          <p className="page-lede muted">
            Download one employee or a complete salary run.
          </p>
        </div>
      </div>
      <form className="panel toolbar no-print">
        <label className="field">
          <span>Salary run</span>
          <select name="runId" defaultValue={run?.id}>
            {runs.map((row) => (
              <option value={row.id} key={row.id}>
                {row.month} · {row.outlet} · {row.status}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary">Load</button>
        {run && (
          <a className="button" href={`/api/payroll/payslips?runId=${run.id}`}>
            Download all PDF
          </a>
        )}
      </form>
      {run && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th className="num">Days</th>
                <th className="num">Gross</th>
                <th className="num">Deductions</th>
                <th className="num">Net</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {run.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <b>{line.employee}</b>
                  </td>
                  <td className="num">{line.daysPayable}</td>
                  <td className="num">{formatINR(line.grossEarnings)}</td>
                  <td className="num">{formatINR(line.totalDeductions)}</td>
                  <td className="num strong">{formatINR(line.netPay)}</td>
                  <td>
                    <span className={`badge ${line.isPaid ? "ok" : "warn"}`}>
                      {line.isPaid ? "Paid" : "Unpaid"}
                    </span>
                  </td>
                  <td>
                    <a
                      className="button button-secondary"
                      href={`/api/payroll/payslips?runId=${run.id}&lineId=${line.id}`}
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
