import { PayrollNav } from "@/components/payroll/nav";
import { getEmployeeLedger, getPayrollOptions } from "@/server/payroll/queries";
import { formatINR } from "@/lib/format";

export default async function Page({
  searchParams,
}: {
  searchParams: { employeeId?: string; from?: string; to?: string };
}) {
  const options = await getPayrollOptions();
  const employeeId = searchParams.employeeId ?? options.employees[0]?.id;
  const ledger = employeeId
    ? await getEmployeeLedger(employeeId, searchParams.from, searchParams.to)
    : null;
  return (
    <div className="payroll-page">
      <PayrollNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">ADVANCES · SALARY · RECOVERIES · LOANS</p>
          <h1>Employee ledger</h1>
        </div>
      </div>
      <form className="panel toolbar no-print">
        <label className="field">
          <span>Employee</span>
          <select name="employeeId" defaultValue={employeeId}>
            {options.employees.map((row) => (
              <option value={row.id} key={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input name="from" type="date" defaultValue={searchParams.from} />
        </label>
        <label className="field">
          <span>To</span>
          <input name="to" type="date" defaultValue={searchParams.to} />
        </label>
        <button className="button button-secondary">Apply</button>
      </form>
      {ledger && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <p className="label">Employee</p>
              <p className="value">{ledger.employee.name}</p>
            </div>
            <div className="stat">
              <p className="label">Running balance</p>
              <p className="value">₹ {ledger.balanceDisplay}</p>
              <p className="sub">Debit positive</p>
            </div>
          </div>
          <div className="panel table-wrap report-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Narration</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>{row.document}</td>
                    <td>{row.type}</td>
                    <td>{row.narration}</td>
                    <td className="num">{formatINR(row.debit)}</td>
                    <td className="num">{formatINR(row.credit)}</td>
                    <td className="num strong">{formatINR(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
