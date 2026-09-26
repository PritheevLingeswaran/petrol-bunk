"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, Save } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatINR, formatNumber } from "@/lib/format";
import { computeNozzleSale, PumpArithmeticError } from "@/lib/pump";
import { loadShiftEntryForm, saveShiftEntry, type NozzleCard, type ShiftEntryForm } from "@/server/pump/actions";
import type { Option } from "@/server/pump/queries";
import { Field, KeyboardForm, Messages, PageHead, Stat } from "@/components/pump/ui";

type RowState = {
  closingReading: string;
  testingLitres: string;
  meterRollover: boolean;
  salesmanEmployeeId: string;
  outOfService: boolean;
  outOfServiceReason: string;
  remarks: string;
};

type Props = {
  today: string;
  shifts: (Option & { startTime: string; endTime: string })[];
  employees: Option[];
};

const blankRow = (): RowState => ({
  closingReading: "",
  testingLitres: "0",
  meterRollover: false,
  salesmanEmployeeId: "",
  outOfService: false,
  outOfServiceReason: "",
  remarks: "",
});

const key = (nozzleId: string, segment: number) => `${nozzleId}:${segment}`;

export function ShiftEntryScreen({ today, shifts, employees }: Props) {
  const [businessDate, setBusinessDate] = useState(today);
  const [shiftId, setShiftId] = useState(shifts[0]?.value ?? "");
  const [form, setForm] = useState<ShiftEntryForm | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [cashier, setCashier] = useState("");
  const [openingFloat, setOpeningFloat] = useState("0");
  const [counterSale, setCounterSale] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!shiftId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSaved("");
    void loadShiftEntryForm(businessDate, shiftId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setForm(null);
        setError(result.error);
        return;
      }
      setForm(result.form);
      const next: Record<string, RowState> = {};
      for (const nozzle of result.form.nozzles) {
        for (const segment of nozzle.segments) {
          const existing = result.form.saved[key(nozzle.nozzleId, segment.segment)];
          next[key(nozzle.nozzleId, segment.segment)] = existing
            ? {
                closingReading: existing.closingReading,
                testingLitres: existing.testingLitres,
                meterRollover: false,
                salesmanEmployeeId: existing.salesmanEmployeeId,
                outOfService: existing.outOfService,
                outOfServiceReason: existing.outOfServiceReason,
                remarks: "",
              }
            : blankRow();
        }
      }
      setRows(next);
    });
    return () => {
      cancelled = true;
    };
  }, [businessDate, shiftId]);

  /**
   * Opening for segment 2 onward is the closing typed at the changeover, so
   * the salesman reads the meter once per rate change and nothing is inferred.
   */
  const openingFor = (nozzle: NozzleCard, segment: number): string => {
    if (segment === 1) return nozzle.openingReading;
    return rows[key(nozzle.nozzleId, segment - 1)]?.closingReading || "";
  };

  const lines = useMemo(() => {
    if (!form) return [];
    return form.nozzles.flatMap((nozzle) =>
      nozzle.segments.map((segment) => {
        const row = rows[key(nozzle.nozzleId, segment.segment)] ?? blankRow();
        const opening = openingFor(nozzle, segment.segment);
        let saleLitres = "";
        let saleAmount = "";
        let lineError = "";
        if (opening && row.closingReading) {
          try {
            const sale = computeNozzleSale({
              openingReading: opening,
              closingReading: row.closingReading,
              testingLitres: row.testingLitres || "0",
              rate: segment.rate,
              meterDigits: nozzle.meterDigits,
              meterRollover: row.meterRollover,
            });
            saleLitres = sale.saleLitres.toFixed(2);
            saleAmount = sale.saleAmount.toFixed(2);
          } catch (caught) {
            lineError = caught instanceof PumpArithmeticError ? caught.message : "Check this reading";
          }
        }
        const average = new Decimal(nozzle.thirtyDayAverage);
        const spike = saleLitres !== "" && average.gt(0) && new Decimal(saleLitres).gt(average.mul(3));
        const zero = saleLitres !== "" && new Decimal(saleLitres).isZero() && average.gt(0);
        return { nozzle, segment, row, opening, saleLitres, saleAmount, lineError, spike, zero };
      }),
    );
  }, [form, rows]);

  const totals = useMemo(() => {
    let litres = new Decimal(0);
    let amount = new Decimal(0);
    for (const line of lines) {
      if (line.saleLitres) litres = litres.plus(line.saleLitres);
      if (line.saleAmount) amount = amount.plus(line.saleAmount);
    }
    return { litres, amount, total: amount.plus(new Decimal(counterSale || "0")) };
  }, [lines, counterSale]);

  const update = (nozzleId: string, segment: number, patch: Partial<RowState>) =>
    setRows((current) => ({ ...current, [key(nozzleId, segment)]: { ...(current[key(nozzleId, segment)] ?? blankRow()), ...patch } }));

  const save = async () => {
    if (!form || pending) return;
    setPending(true);
    setError("");
    setWarnings([]);
    setSaved("");

    const payload = {
      id: form.existingId ?? undefined,
      businessDate,
      shiftId,
      cashierEmployeeId: cashier || undefined,
      openingFloat: openingFloat || "0",
      counterSaleAmount: counterSale || "0",
      remarks: remarks || undefined,
      readings: lines
        .filter((line) => line.row.closingReading !== "")
        .map((line) => ({
          nozzleId: line.nozzle.nozzleId,
          rateSegment: line.segment.segment,
          openingReading: line.opening,
          closingReading: line.row.closingReading,
          testingLitres: line.row.testingLitres || "0",
          meterRollover: line.row.meterRollover,
          salesmanEmployeeId: line.row.salesmanEmployeeId || undefined,
          outOfService: line.row.outOfService,
          outOfServiceReason: line.row.outOfServiceReason || undefined,
          remarks: line.row.remarks || undefined,
        })),
    };

    const result = await saveShiftEntry(payload);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWarnings(result.warnings);
    setSaved(`Shift saved at ${new Date().toLocaleTimeString("en-IN")}.`);
    const reloaded = await loadShiftEntryForm(businessDate, shiftId);
    if (reloaded.ok) setForm(reloaded.form);
  };

  return (
    <section className="space-y-4">
      <PageHead eyebrow="PUMP OPERATIONS" title="Shift entry" description="Meter readings, nozzle allocation and testing litres.">
        <button className="button" onClick={save} disabled={pending || !form || form.locked}>
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save shift
          <kbd className="ml-1 text-[0.62rem] opacity-70">Ctrl+S</kbd>
        </button>
      </PageHead>

      <div className="panel space-y-3 p-3">
        <div className="toolbar">
          <Field label="Date">
            <input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} max={today} />
          </Field>
          <Field label="Shift">
            <select value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
              {shifts.map((shift) => (
                <option key={shift.value} value={shift.value}>
                  {shift.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cashier on duty">
            <select value={cashier} onChange={(event) => setCashier(event.target.value)}>
              <option value="">Not recorded</option>
              {employees.map((employee) => (
                <option key={employee.value} value={employee.value}>
                  {employee.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opening float ₹">
            <input type="number" step="0.01" className="num" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} />
          </Field>
          <Field label="Counter / lube sales ₹">
            <input type="number" step="0.01" className="num" value={counterSale} onChange={(event) => setCounterSale(event.target.value)} />
          </Field>
          {form ? <span className={`badge ${form.status === "APPROVED" ? "ok" : ""}`}>{form.status}</span> : null}
        </div>
      </div>

      <Messages
        error={error}
        warnings={warnings}
        info={
          form?.hasRateSplit
            ? "The price changed inside this shift. Each nozzle is split into rate segments — enter the meter reading at the changeover in segment 1, and the shift close in segment 2."
            : saved || undefined
        }
      />
      {form?.locked ? <p className="warn-bar">This shift is approved. Ask a manager to reopen it before editing.</p> : null}

      <div className="stat-grid">
        <Stat label="Sale litres" value={formatNumber(totals.litres.toFixed(2))} sub="Testing litres excluded" />
        <Stat label="Fuel sale value" value={formatINR(totals.amount.toFixed(2))} />
        <Stat label="Counter sales" value={formatINR(counterSale || "0")} />
        <Stat label="Total sale value" value={formatINR(totals.total.toFixed(2))} sub="Carried to settlement" />
      </div>

      {loading ? (
        <p className="panel p-6 text-center text-slate-400">Loading nozzles…</p>
      ) : (
        <KeyboardForm onSave={save} className="nozzle-grid">
          {lines.map((line) => {
            const id = key(line.nozzle.nozzleId, line.segment.segment);
            return (
              <article className={`nozzle-card ${line.spike || line.zero || line.lineError ? "flagged" : ""} ${line.row.outOfService ? "offline" : ""}`} key={id}>
                <header>
                  <div>
                    <h3>
                      {line.nozzle.nozzleCode} · {line.nozzle.productName}
                    </h3>
                    <p className="meta">
                      {line.nozzle.dispensingUnit} · Tank {line.nozzle.tankCode} · {line.nozzle.meterDigits}-digit meter
                    </p>
                  </div>
                  {line.nozzle.segments.length > 1 ? (
                    <span className="badge warn">
                      Segment {line.segment.segment} @ ₹{line.segment.rate}
                    </span>
                  ) : (
                    <span className="badge">₹{line.segment.rate}/L</span>
                  )}
                </header>

                <div className="reading-row">
                  <div className="readout locked">
                    <span>Opening (carried)</span>
                    <strong>{line.opening ? formatNumber(line.opening) : "—"}</strong>
                  </div>
                  <Field label="Closing reading">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={line.row.closingReading}
                      disabled={form?.locked}
                      onChange={(event) => update(line.nozzle.nozzleId, line.segment.segment, { closingReading: event.target.value })}
                    />
                  </Field>
                </div>

                <div className="reading-row">
                  <Field label="Testing litres" hint="Returned to the tank">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={line.row.testingLitres}
                      disabled={form?.locked}
                      onChange={(event) => update(line.nozzle.nozzleId, line.segment.segment, { testingLitres: event.target.value })}
                    />
                  </Field>
                  <Field label="Salesman">
                    <select
                      value={line.row.salesmanEmployeeId}
                      disabled={form?.locked}
                      onChange={(event) => update(line.nozzle.nozzleId, line.segment.segment, { salesmanEmployeeId: event.target.value })}
                    >
                      <option value="">Unallocated</option>
                      {employees.map((employee) => (
                        <option key={employee.value} value={employee.value}>
                          {employee.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="reading-row">
                  <div className="readout big">
                    <span>Sale litres</span>
                    <strong>{line.saleLitres ? formatNumber(line.saleLitres) : "—"}</strong>
                  </div>
                  <div className="readout big">
                    <span>Sale value</span>
                    <strong>{line.saleAmount ? formatINR(line.saleAmount) : "—"}</strong>
                  </div>
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={line.row.meterRollover}
                    disabled={form?.locked}
                    onChange={(event) => update(line.nozzle.nozzleId, line.segment.segment, { meterRollover: event.target.checked })}
                  />
                  <RotateCcw size={14} /> Meter rolled over
                </label>
                {line.row.meterRollover ? <p className="warn-bar">Sale = (10^{line.nozzle.meterDigits} − opening) + closing. A manager must approve this shift.</p> : null}

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={line.row.outOfService}
                    disabled={form?.locked}
                    onChange={(event) => update(line.nozzle.nozzleId, line.segment.segment, { outOfService: event.target.checked })}
                  />
                  Taken out of service mid-shift
                </label>
                {line.row.outOfService ? (
                  <Field label="Reason">
                    <input
                      type="text"
                      value={line.row.outOfServiceReason}
                      disabled={form?.locked}
                      onChange={(event) => update(line.nozzle.nozzleId, line.segment.segment, { outOfServiceReason: event.target.value })}
                    />
                  </Field>
                ) : null}

                {line.lineError ? (
                  <p className="alert-bar">
                    <AlertTriangle size={13} className="mr-1 inline" />
                    {line.lineError}
                  </p>
                ) : null}
                {line.spike ? <p className="warn-bar">Above 3× the 30-day average of {formatNumber(line.nozzle.thirtyDayAverage)} L. Saved anyway — check the reading.</p> : null}
                {line.zero ? <p className="warn-bar">No sale recorded, but this nozzle normally sells {formatNumber(line.nozzle.thirtyDayAverage)} L.</p> : null}
              </article>
            );
          })}
        </KeyboardForm>
      )}

      <div className="panel p-3">
        <Field label="Shift remarks">
          <textarea rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={form?.locked} />
        </Field>
      </div>

      {saved ? (
        <p className="info-bar">
          <Check size={13} className="mr-1 inline" />
          {saved}
        </p>
      ) : null}
    </section>
  );
}
