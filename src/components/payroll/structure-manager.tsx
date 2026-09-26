"use client";
import { EmptyRow } from "@/components/shell/empty-row";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSalaryStructure } from "@/server/payroll/actions";
import { formatINR } from "@/lib/format";

type Option = { id: string; code: string; name: string };
type Row = {
  id: string;
  employee: string;
  code: string;
  name: string;
  type: string;
  amount: string;
  perDayRate: string;
  perHourRate: string;
  perShiftRate: string;
  perLitreRate: string;
  effectiveFrom: string;
  account: string;
};
export function StructureManager({
  rows,
  employees,
  accounts,
  today,
  editable,
}: {
  rows: Row[];
  employees: Option[];
  accounts: Option[];
  today: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const submit = (formData: FormData) =>
    start(async () => {
      const payload = Object.fromEntries(formData);
      const result = await saveSalaryStructure(payload);
      setMessage(result.ok ? "Salary component saved" : result.error);
      if (result.ok) router.refresh();
    });
  return (
    <>
      <form action={submit} className="panel salary-structure-form no-print">
        <label className="field">
          <span>Employee</span>
          <select name="employeeId" required>
            {employees.map((row) => (
              <option value={row.id} key={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Component code</span>
          <input name="componentCode" required placeholder="BASIC" />
        </label>
        <label className="field">
          <span>Component name</span>
          <input name="componentName" required placeholder="Basic salary" />
        </label>
        <label className="field">
          <span>Type</span>
          <select name="type">
            <option value="EARNING">Earning</option>
            <option value="DEDUCTION">Deduction</option>
            <option value="EMPLOYER_CONTRIBUTION">Employer contribution</option>
          </select>
        </label>
        <label className="field">
          <span>Flat amount</span>
          <input name="amount" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Per day</span>
          <input name="perDayRate" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Per OT hour</span>
          <input name="perHourRate" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Per shift</span>
          <input name="perShiftRate" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Per litre sold</span>
          <input name="perLitreRate" inputMode="decimal" />
        </label>
        <label className="field">
          <span>Effective from</span>
          <input name="effectiveFrom" type="date" defaultValue={today} />
        </label>
        <label className="field">
          <span>Posting ledger</span>
          <select name="accountId">
            <option value="">Default payroll ledger</option>
            {accounts.map((row) => (
              <option value={row.id} key={row.id}>
                {row.code} · {row.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button" disabled={!editable || pending}>
          Save component
        </button>
        {message && <p className="info-bar">{message}</p>}
      </form>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee / component</th>
              <th>Type</th>
              <th className="num">Flat</th>
              <th className="num">Per day</th>
              <th className="num">Per OT h</th>
              <th className="num">Per shift</th>
              <th className="num">Per litre</th>
              <th>From</th>
              <th>Ledger</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={9} message="No salary components set up yet." hint="Add a component above for an employee to build their salary structure." />}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <b>{row.employee}</b>
                  <span className="table-sub">
                    {row.code} · {row.name}
                  </span>
                </td>
                <td>
                  <span className="badge">{row.type}</span>
                </td>
                <td className="num">
                  {row.amount ? formatINR(row.amount) : "—"}
                </td>
                <td className="num">
                  {row.perDayRate ? formatINR(row.perDayRate) : "—"}
                </td>
                <td className="num">
                  {row.perHourRate ? formatINR(row.perHourRate) : "—"}
                </td>
                <td className="num">
                  {row.perShiftRate ? formatINR(row.perShiftRate) : "—"}
                </td>
                <td className="num">
                  {row.perLitreRate ? formatINR(row.perLitreRate, 4) : "—"}
                </td>
                <td>{row.effectiveFrom}</td>
                <td>{row.account || "Default"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
