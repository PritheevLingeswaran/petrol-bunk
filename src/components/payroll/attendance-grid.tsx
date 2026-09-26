"use client";
import { EmptyRow } from "@/components/shell/empty-row";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkMarkAttendance,
  importAttendanceCsv,
} from "@/server/payroll/actions";

type Employee = {
  id: string;
  code: string;
  name: string;
  marks: Record<string, { status: string; overtimeHours: string }>;
  summary: { present: string; absent: string; overtime: string };
};
const labels: Record<string, string> = {
  PRESENT: "P",
  ABSENT: "A",
  HALF_DAY: "HD",
  WEEKLY_OFF: "WO",
  CASUAL_LEAVE: "CL",
  SICK_LEAVE: "SL",
  PAID_LEAVE: "PL",
  UNPAID_LEAVE: "UL",
  HOLIDAY: "H",
  OVERTIME: "OT",
};

export function AttendanceGrid({
  month,
  days,
  employees,
  editable,
}: {
  month: string;
  days: string[];
  employees: Employee[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [employeeIds, setEmployees] = useState<string[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [status, setStatus] = useState("PRESENT");
  const [overtimeHours, setOvertime] = useState("0");
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState("");
  const submit = () =>
    start(async () => {
      const result = await bulkMarkAttendance({
        employeeIds,
        dates,
        status,
        overtimeHours,
      });
      setMessage(
        result.ok ? `${result.count} attendance marks saved` : result.error,
      );
      if (result.ok) router.refresh();
    });
  const upload = () =>
    start(async () => {
      const result = await importAttendanceCsv({ csv });
      setMessage(
        result.ok ? `${result.count} biometric rows imported` : result.error,
      );
      if (result.ok) {
        setCsv("");
        router.refresh();
      }
    });
  const toggle = (
    list: string[],
    value: string,
    setter: (next: string[]) => void,
  ) =>
    setter(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value],
    );
  return (
    <div className="attendance-workspace">
      <div className="panel attendance-controls no-print">
        <form action="/payroll/attendance" className="toolbar">
          <label className="field">
            <span>Month</span>
            <input name="month" type="month" defaultValue={month} />
          </label>
          <button className="button button-secondary">Load month</button>
        </form>
        {editable && (
          <>
            <div className="toolbar">
              <label className="field">
                <span>Mark</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {Object.entries(labels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label} — {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>OT hours</span>
                <input
                  inputMode="decimal"
                  value={overtimeHours}
                  onChange={(event) => setOvertime(event.target.value)}
                />
              </label>
              <button
                className="button"
                disabled={pending || !employeeIds.length || !dates.length}
                onClick={submit}
              >
                Mark selected
              </button>
              <span className="muted">
                Select an employee and one or more day columns. Select all days
                to bulk-mark one person; select all employees to bulk-mark a
                day.
              </span>
            </div>
            <details className="csv-import">
              <summary>Biometric CSV import</summary>
              <p className="muted">
                Columns: employee_code,date,mark,overtime_hours. Marks: P, A,
                HD, WO, CL, SL, OT.
              </p>
              <textarea
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                rows={5}
                placeholder="employee_code,date,mark,overtime_hours"
              />
              <button
                className="button button-secondary"
                disabled={pending || !csv.trim()}
                onClick={upload}
              >
                Import CSV
              </button>
            </details>
          </>
        )}
        {message && <div className="info-bar">{message}</div>}
      </div>
      <div className="panel table-wrap attendance-scroll">
        <table className="attendance-table">
          <thead>
            <tr>
              <th className="sticky-col">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={
                      employeeIds.length === employees.length &&
                      employees.length > 0
                    }
                    onChange={() =>
                      setEmployees(
                        employeeIds.length === employees.length
                          ? []
                          : employees.map((employee) => employee.id),
                      )
                    }
                  />
                  Employee
                </label>
              </th>
              {days.map((day) => (
                <th className="num" key={day}>
                  <label>
                    <input
                      type="checkbox"
                      checked={dates.includes(day)}
                      onChange={() => toggle(dates, day, setDates)}
                    />
                    <span>{day.slice(8)}</span>
                  </label>
                </th>
              ))}
              <th className="num">P</th>
              <th className="num">A</th>
              <th className="num">OT h</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && <EmptyRow colSpan={dates.length + 4} message="No active employees for this outlet." hint="Add employees under Admin → Employees to mark attendance." />}
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="sticky-col">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={employeeIds.includes(employee.id)}
                      onChange={() =>
                        toggle(employeeIds, employee.id, setEmployees)
                      }
                    />
                    <span>
                      <b>{employee.code}</b>
                      <small className="table-sub">{employee.name}</small>
                    </span>
                  </label>
                </td>
                {days.map((day) => {
                  const mark = employee.marks[day];
                  return (
                    <td
                      className={`attendance-mark ${mark?.status === "ABSENT" ? "loss" : ""}`}
                      title={
                        mark
                          ? `${mark.status}, OT ${mark.overtimeHours}`
                          : "Not marked"
                      }
                      key={day}
                    >
                      {mark ? (labels[mark.status] ?? mark.status) : "·"}
                    </td>
                  );
                })}
                <td className="num strong">{employee.summary.present}</td>
                <td className="num">{employee.summary.absent}</td>
                <td className="num">{employee.summary.overtime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
