"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, Clock, Loader2, Plus, X } from "lucide-react";
import { formatINR } from "@/lib/format";
import { actOnReminder, saveReminder } from "@/server/pump/actions";
import type { PumpOptions, ReminderRow } from "@/server/pump/queries";
import { Field, KeyboardForm, Messages, PageHead, Stat } from "@/components/pump/ui";

const TYPES = [
  { value: "LICENCE_RENEWAL", label: "Licence renewal" },
  { value: "CALIBRATION_DUE", label: "Stamping / calibration due" },
  { value: "INSURANCE_RENEWAL", label: "Insurance" },
  { value: "CHEQUE_DUE", label: "Cheque due" },
  { value: "AMC_DUE", label: "AMC" },
  { value: "STATUTORY_FILING", label: "Statutory filing" },
  { value: "CUSTOMER_FOLLOWUP", label: "Customer follow-up" },
  { value: "OTHER", label: "Other" },
];

const REPEATS = [
  { value: "NONE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export function RemindersScreen({ rows, open, overdue, options, today }: { rows: ReminderRow[]; open: number; overdue: number; options: PumpOptions; today: string }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("LIVE");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "LIVE") return row.status === "OPEN" || row.status === "SNOOZED";
        if (filter === "OVERDUE") return row.overdue;
        if (filter === "DONE") return row.status === "DONE";
        return true;
      }),
    [rows, filter],
  );

  const act = async (id: string, action: "DONE" | "SNOOZE" | "CANCEL" | "REOPEN") => {
    setBusy(id);
    setError("");
    const snoozedTill = action === "SNOOZE" ? window.prompt("Snooze until (YYYY-MM-DD)", today) ?? "" : undefined;
    if (action === "SNOOZE" && !snoozedTill) {
      setBusy("");
      return;
    }
    const result = await actOnReminder({ id, action, snoozedTill });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <PageHead eyebrow="COMPLIANCE" title="Reminders" description="Licences, calibration, insurance, cheques and follow-ups.">
        <button className="button" type="button" onClick={() => setShowForm((current) => !current)}>
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? "Close" : "New reminder"}
        </button>
      </PageHead>

      <Messages error={error} />

      <div className="stat-grid">
        <Stat label="Open" value={String(open)} />
        <Stat label="Overdue" value={String(overdue)} tone={overdue > 0 ? "loss" : "gain"} sub="Shown on the dashboard" />
        <Stat label="Due soon" value={String(rows.filter((row) => row.dueSoon).length)} />
      </div>

      {showForm ? <ReminderForm options={options} today={today} onDone={() => window.location.reload()} /> : null}

      <div className="panel space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          {[
            ["LIVE", "Open & snoozed"],
            ["OVERDUE", "Overdue"],
            ["DONE", "Completed"],
            ["ALL", "All"],
          ].map(([value, label]) => (
            <button key={value} type="button" className={`button ${filter === value ? "" : "button-secondary"}`} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Due</th>
                <th>Repeat</th>
                <th>Linked to</th>
                <th>Assigned</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={row.status === "DONE" || row.status === "CANCELLED" ? "opacity-50" : ""}>
                  <td className="sticky-col font-medium">
                    {row.title}
                    {row.notes ? <div className="muted text-xs">{row.notes}</div> : null}
                  </td>
                  <td>{TYPES.find((type) => type.value === row.type)?.label ?? row.type}</td>
                  <td>
                    {row.dueDate}
                    {row.dueTime ? ` ${row.dueTime}` : ""}
                    {row.overdue ? <span className="badge alert ml-2">{Math.abs(row.daysToDue)}d overdue</span> : null}
                    {row.dueSoon ? <span className="badge warn ml-2">in {row.daysToDue}d</span> : null}
                  </td>
                  <td>{REPEATS.find((repeat) => repeat.value === row.repeat)?.label ?? row.repeat}</td>
                  <td>{row.party || "—"}</td>
                  <td>{row.assignedTo || "—"}</td>
                  <td className="num">{row.amount ? formatINR(row.amount) : "—"}</td>
                  <td>
                    <span className={`badge ${row.status === "DONE" ? "ok" : row.overdue ? "alert" : ""}`}>{row.status}</span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {row.status === "OPEN" || row.status === "SNOOZED" ? (
                        <>
                          <button className="icon-button" aria-label="Mark done" disabled={busy === row.id} onClick={() => act(row.id, "DONE")}>
                            {busy === row.id ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                          </button>
                          <button className="icon-button" aria-label="Snooze" disabled={busy === row.id} onClick={() => act(row.id, "SNOOZE")}>
                            <Clock size={15} />
                          </button>
                          <button className="icon-button" aria-label="Cancel" disabled={busy === row.id} onClick={() => act(row.id, "CANCEL")}>
                            <X size={15} />
                          </button>
                        </>
                      ) : (
                        <button className="icon-button" aria-label="Reopen" disabled={busy === row.id} onClick={() => act(row.id, "REOPEN")}>
                          <BellRing size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    Nothing here. Add a reminder for the next licence or calibration due.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ReminderForm({ options, today, onDone }: { options: PumpOptions; today: string; onDone: () => void }) {
  const [state, setState] = useState({
    title: "",
    notes: "",
    type: "LICENCE_RENEWAL",
    dueDate: today,
    dueTime: "",
    repeat: "NONE",
    alertBefore: "30",
    amount: "",
    referenceNo: "",
    customerId: "",
    supplierId: "",
    employeeId: "",
    assignedToId: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    const result = await saveReminder({
      ...state,
      notes: state.notes || undefined,
      dueTime: state.dueTime || undefined,
      amount: state.amount || undefined,
      referenceNo: state.referenceNo || undefined,
      customerId: state.customerId || undefined,
      supplierId: state.supplierId || undefined,
      employeeId: state.employeeId || undefined,
      assignedToId: state.assignedToId || undefined,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  };

  const set = (patch: Partial<typeof state>) => setState((current) => ({ ...current, ...patch }));

  return (
    <KeyboardForm onSave={save} className="panel space-y-3 p-3">
      <h2>New reminder</h2>
      <Messages error={error} />
      <div className="collection-row">
        <Field label="Title">
          <input type="text" value={state.title} onChange={(event) => set({ title: event.target.value })} required />
        </Field>
        <Field label="Category">
          <select value={state.type} onChange={(event) => set({ type: event.target.value })}>
            {TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input type="date" value={state.dueDate} onChange={(event) => set({ dueDate: event.target.value })} required />
        </Field>
        <Field label="Due time">
          <input type="time" value={state.dueTime} onChange={(event) => set({ dueTime: event.target.value })} />
        </Field>
        <Field label="Repeat">
          <select value={state.repeat} onChange={(event) => set({ repeat: event.target.value })}>
            {REPEATS.map((repeat) => (
              <option key={repeat.value} value={repeat.value}>
                {repeat.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Alert days before">
          <input type="number" min="0" step="1" className="num" value={state.alertBefore} onChange={(event) => set({ alertBefore: event.target.value })} />
        </Field>
        <Field label="Amount ₹">
          <input type="number" step="0.01" className="num" value={state.amount} onChange={(event) => set({ amount: event.target.value })} />
        </Field>
        <Field label="Reference no">
          <input type="text" value={state.referenceNo} onChange={(event) => set({ referenceNo: event.target.value })} />
        </Field>
        <Field label="Customer">
          <select value={state.customerId} onChange={(event) => set({ customerId: event.target.value })}>
            <option value="">—</option>
            {options.customers.map((customer) => (
              <option key={customer.value} value={customer.value}>
                {customer.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier">
          <select value={state.supplierId} onChange={(event) => set({ supplierId: event.target.value })}>
            <option value="">—</option>
            {options.suppliers.map((supplier) => (
              <option key={supplier.value} value={supplier.value}>
                {supplier.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employee">
          <select value={state.employeeId} onChange={(event) => set({ employeeId: event.target.value })}>
            <option value="">—</option>
            {options.employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assign to">
          <select value={state.assignedToId} onChange={(event) => set({ assignedToId: event.target.value })}>
            <option value="">—</option>
            {options.users.map((user) => (
              <option key={user.value} value={user.value}>
                {user.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} value={state.notes} onChange={(event) => set({ notes: event.target.value })} />
      </Field>
      <div className="flex justify-end">
        <button className="button" type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Save reminder
        </button>
      </div>
    </KeyboardForm>
  );
}
