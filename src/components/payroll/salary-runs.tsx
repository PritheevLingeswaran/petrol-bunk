"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  calculateSalaryMonth,
  paySalaryLines,
  postSalaryRun,
} from "@/server/payroll/actions";
import { formatINR } from "@/lib/format";

type Run = {
  id: string;
  outlet: string;
  month: string;
  status: string;
  totalEarnings: string;
  totalDeductions: string;
  netPayable: string;
  employeeCount: number;
  lines: Array<{
    id: string;
    employee: string;
    daysPayable: string;
    daysPresent: string;
    daysAbsent: string;
    overtimeHours: string;
    grossEarnings: string;
    totalDeductions: string;
    advanceRecovery: string;
    shortRecovery: string;
    netPay: string;
    isPaid: boolean;
    remarks: string;
  }>;
};
export function SalaryRuns({
  runs,
  paymentModes,
  today,
  currentMonth,
  editable,
}: {
  runs: Run[];
  paymentModes: Array<{ id: string; name: string }>;
  today: string;
  currentMonth: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(runs[0]?.id ?? "");
  const run = runs.find((row) => row.id === selected);
  const calculate = (formData: FormData) =>
    start(async () => {
      const result = await calculateSalaryMonth(Object.fromEntries(formData));
      setMessage(
        result.ok ? "Editable salary preview calculated" : result.error,
      );
      if (result.ok) router.refresh();
    });
  const post = (formData: FormData) =>
    start(async () => {
      if (!run) return;
      const lines = run.lines.map((line) => ({
        id: line.id,
        grossEarnings: String(formData.get(`${line.id}:gross`)),
        totalDeductions: String(formData.get(`${line.id}:deduction`)),
        advanceRecovery: String(formData.get(`${line.id}:advance`)),
        shortRecovery: String(formData.get(`${line.id}:short`)),
        netPay: String(formData.get(`${line.id}:net`)),
        remarks: String(formData.get(`${line.id}:remarks`) ?? ""),
      }));
      const result = await postSalaryRun({ runId: run.id, lines });
      setMessage(
        result.ok
          ? "Salary posted to accounts and employee ledgers"
          : result.error,
      );
      if (result.ok) router.refresh();
    });
  const pay = (formData: FormData) =>
    start(async () => {
      if (!run) return;
      const salaryLineIds = run.lines
        .filter((line) => !line.isPaid)
        .map((line) => line.id);
      const result = await paySalaryLines({
        salaryLineIds,
        paymentModeId: formData.get("paymentModeId"),
        businessDate: formData.get("businessDate"),
      });
      setMessage(result.ok ? `${result.count} salaries paid` : result.error);
      if (result.ok) router.refresh();
    });
  return (
    <>
      <div className="panel salary-run-toolbar no-print">
        <form action={calculate} className="toolbar">
          <label className="field">
            <span>Salary month</span>
            <input name="month" type="month" defaultValue={currentMonth} />
          </label>
          <button className="button" disabled={!editable || pending}>
            Calculate preview
          </button>
        </form>
        <label className="field">
          <span>Open run</span>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Choose</option>
            {runs.map((row) => (
              <option value={row.id} key={row.id}>
                {row.month} · {row.outlet} · {row.status}
              </option>
            ))}
          </select>
        </label>
        {message && <div className="info-bar">{message}</div>}
      </div>
      {run && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <p className="label">Gross earnings</p>
              <p className="value">₹ {formatINR(run.totalEarnings)}</p>
            </div>
            <div className="stat">
              <p className="label">Deductions</p>
              <p className="value">₹ {formatINR(run.totalDeductions)}</p>
            </div>
            <div className="stat">
              <p className="label">Net payable</p>
              <p className="value">₹ {formatINR(run.netPayable)}</p>
            </div>
            <div className="stat">
              <p className="label">Status</p>
              <p className="value">{run.status}</p>
              <p className="sub">{run.employeeCount} employees</p>
            </div>
          </div>
          <form action={post} className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="num">Days</th>
                  <th className="num">OT h</th>
                  <th className="num">Gross</th>
                  <th className="num">Deductions</th>
                  <th className="num">Advance</th>
                  <th className="num">Short/excess</th>
                  <th className="num">Net pay</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {run.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <b>{line.employee}</b>
                      <span className="table-sub">
                        P {line.daysPresent} · A {line.daysAbsent}
                        {line.isPaid ? " · Paid" : ""}
                      </span>
                    </td>
                    <td className="num">{line.daysPayable}</td>
                    <td className="num">{line.overtimeHours}</td>
                    {[
                      ["gross", line.grossEarnings],
                      ["deduction", line.totalDeductions],
                      ["advance", line.advanceRecovery],
                      ["short", line.shortRecovery],
                      ["net", line.netPay],
                    ].map(([name, value]) => (
                      <td key={name}>
                        <input
                          className="payroll-cell"
                          name={`${line.id}:${name}`}
                          defaultValue={value}
                          readOnly={run.status !== "DRAFT"}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        className="payroll-cell payroll-note"
                        name={`${line.id}:remarks`}
                        defaultValue={line.remarks}
                        readOnly={run.status !== "DRAFT"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {run.status === "DRAFT" && (
              <div className="save-strip">
                <span>
                  Review and edit before posting. Posting creates one balanced
                  salary journal.
                </span>
                <button className="button" disabled={pending}>
                  Approve & post
                </button>
              </div>
            )}
          </form>
          {run.status === "APPROVED" && (
            <form action={pay} className="panel salary-pay no-print">
              <label className="field">
                <span>Payment mode</span>
                <select name="paymentModeId" required>
                  {paymentModes.map((mode) => (
                    <option value={mode.id} key={mode.id}>
                      {mode.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Payment date</span>
                <input name="businessDate" type="date" defaultValue={today} />
              </label>
              <button
                className="button"
                disabled={pending || run.lines.every((line) => line.isPaid)}
              >
                Pay all unpaid employees
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}
