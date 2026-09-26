"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Printer, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { saveSample } from "@/server/pump/actions";
import type { PumpOptions, SampleRow } from "@/server/pump/queries";
import { Field, KeyboardForm, Messages, PageHead, Stat } from "@/components/pump/ui";

const TYPES = [
  { value: "RETAINED_DECANTATION", label: "Retained (decantation)" },
  { value: "FILTER_PAPER", label: "Filter paper" },
  { value: "DENSITY_CHECK", label: "Density check" },
  { value: "AUTHORITY_DRAWN", label: "Drawn by authority" },
];

export function SamplesScreen({
  rows,
  expired,
  sheet,
  options,
  today,
  qrBySample,
}: {
  rows: SampleRow[];
  expired: number;
  sheet: { rows: number; columns: number };
  options: PumpOptions;
  today: string;
  qrBySample: Record<string, string>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [columns, setColumns] = useState(String(sheet.columns));
  const [sheetRows, setSheetRows] = useState(String(sheet.rows));

  const perSheet = Number(columns) * Number(sheetRows);
  const toPrint = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected]);
  const pages = useMemo(() => {
    const chunks: SampleRow[][] = [];
    for (let index = 0; index < toPrint.length; index += perSheet) chunks.push(toPrint.slice(index, index + perSheet));
    return chunks;
  }, [toPrint, perSheet]);

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  return (
    <section className="space-y-4">
      <PageHead eyebrow="QUALITY" title="Retained sample register" description="Every sample drawn, sealed and retained — with printable stickers.">
        <button className="button button-secondary" type="button" onClick={() => window.print()} disabled={toPrint.length === 0}>
          <Printer size={16} /> Print {toPrint.length || ""} sticker{toPrint.length === 1 ? "" : "s"}
        </button>
        <button className="button" type="button" onClick={() => setShowForm((current) => !current)}>
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? "Close" : "Draw sample"}
        </button>
      </PageHead>

      <div className="stat-grid no-print">
        <Stat label="Samples held" value={String(rows.filter((row) => !row.isDisposed).length)} />
        <Stat label="Past retention" value={String(expired)} tone={expired > 0 ? "loss" : "gain"} sub="Dispose or re-seal" />
        <Stat label="Selected to print" value={String(toPrint.length)} />
      </div>

      {expired > 0 ? <p className="alert-bar no-print">{expired} sample(s) have passed their retention period.</p> : null}

      {showForm ? <SampleForm options={options} today={today} onDone={() => window.location.reload()} /> : null}

      <div className="panel space-y-3 p-3 no-print">
        <div className="toolbar">
          <Field label="Stickers per row">
            <input type="number" min="1" max="6" className="num" value={columns} onChange={(event) => setColumns(event.target.value)} />
          </Field>
          <Field label="Rows per A4 sheet">
            <input type="number" min="1" max="12" className="num" value={sheetRows} onChange={(event) => setSheetRows(event.target.value)} />
          </Field>
          <button className="button button-secondary" type="button" onClick={() => setSelected(rows.filter((row) => !row.isDisposed).map((row) => row.id))}>
            Select all held
          </button>
          <button className="button button-secondary" type="button" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>

        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Print</th>
                <th>Date</th>
                <th>Product</th>
                <th>Tank</th>
                <th>Type</th>
                <th className="num">Litres</th>
                <th>Tanker</th>
                <th>Invoice</th>
                <th className="num">Density @15</th>
                <th>Seal</th>
                <th>Sealed by</th>
                <th>Retained till</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.isDisposed ? "opacity-50" : ""}>
                  <td>
                    <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={`Print sticker for ${row.id}`} />
                  </td>
                  <td className="sticky-col font-medium">{row.date}</td>
                  <td>{row.product}</td>
                  <td>{row.tank || "—"}</td>
                  <td>{TYPES.find((type) => type.value === row.type)?.label ?? row.type}</td>
                  <td className="num">{formatNumber(row.quantity)}</td>
                  <td>{row.tankerNo || "—"}</td>
                  <td>{row.invoiceNo || "—"}</td>
                  <td className="num">{row.densityAt15C ? formatNumber(row.densityAt15C, 1) : "—"}</td>
                  <td>{row.sealNo || "—"}</td>
                  <td>{row.sealedBy || "—"}</td>
                  <td>{row.retainedTill || "—"}</td>
                  <td>
                    {row.isDisposed ? (
                      <span className="badge">Disposed</span>
                    ) : row.expired ? (
                      <span className="badge alert">Expired</span>
                    ) : (
                      <span className="badge ok">{row.daysLeft}d left</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-slate-500">
                    No samples drawn yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {pages.map((page, index) => (
        <div className="sticker-sheet" key={index} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {page.map((row) => (
            <div className="sticker" key={row.id}>
              <div>
                <h4>RETAINED FUEL SAMPLE</h4>
                <dl>
                  <dt>Product</dt>
                  <dd>{row.product}</dd>
                  <dt>Date</dt>
                  <dd>{row.date}</dd>
                  <dt>Tank</dt>
                  <dd>{row.tank || "—"}</dd>
                  <dt>Tanker</dt>
                  <dd>{row.tankerNo || "—"}</dd>
                  <dt>Invoice</dt>
                  <dd>{row.invoiceNo || "—"}</dd>
                  <dt>Density@15</dt>
                  <dd>{row.densityAt15C ? `${formatNumber(row.densityAt15C, 1)} kg/m³` : "—"}</dd>
                  <dt>Temp</dt>
                  <dd>{row.temperatureC ? `${formatNumber(row.temperatureC, 1)} °C` : "—"}</dd>
                  <dt>Seal no</dt>
                  <dd>{row.sealNo || "—"}</dd>
                  <dt>Sealed by</dt>
                  <dd>{row.sealedBy || "—"}</dd>
                  <dt>Retain till</dt>
                  <dd>{row.retainedTill || "—"}</dd>
                </dl>
              </div>
              {/* QR encodes the sample id so the physical bottle links back to the register. */}
              <div dangerouslySetInnerHTML={{ __html: qrBySample[row.id] ?? "" }} />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function SampleForm({ options, today, onDone }: { options: PumpOptions; today: string; onDone: () => void }) {
  const [state, setState] = useState({
    businessDate: today,
    productId: options.products[0]?.value ?? "",
    tankId: "",
    type: "RETAINED_DECANTATION",
    quantity: "1",
    tankerNo: "",
    invoiceNo: "",
    observedDensity: "",
    temperatureC: "",
    sealNo: "",
    sealedBy: "",
    drawnByEmployeeId: "",
    witnessName: "",
    retainedTill: "",
    storageRef: "",
    result: "",
    remarks: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<typeof state>) => setState((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    const result = await saveSample(
      Object.fromEntries(Object.entries(state).map(([field, value]) => [field, value === "" ? undefined : value])) as Record<string, string | undefined>,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone();
  };

  return (
    <KeyboardForm onSave={save} className="panel space-y-3 p-3 no-print">
      <h2>Draw a sample</h2>
      <Messages error={error} />
      <div className="collection-row">
        <Field label="Date">
          <input type="date" value={state.businessDate} max={today} onChange={(event) => set({ businessDate: event.target.value })} />
        </Field>
        <Field label="Product">
          <select value={state.productId} onChange={(event) => set({ productId: event.target.value })} required>
            {options.products.map((product) => (
              <option key={product.value} value={product.value}>
                {product.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tank">
          <select value={state.tankId} onChange={(event) => set({ tankId: event.target.value })}>
            <option value="">—</option>
            {options.tanks.map((tank) => (
              <option key={tank.value} value={tank.value}>
                {tank.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={state.type} onChange={(event) => set({ type: event.target.value })}>
            {TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Litres">
          <input type="number" step="0.01" className="num" value={state.quantity} onChange={(event) => set({ quantity: event.target.value })} required />
        </Field>
        <Field label="Tanker no">
          <input type="text" value={state.tankerNo} onChange={(event) => set({ tankerNo: event.target.value })} />
        </Field>
        <Field label="Invoice no">
          <input type="text" value={state.invoiceNo} onChange={(event) => set({ invoiceNo: event.target.value })} />
        </Field>
        <Field label="Observed density">
          <input type="number" step="0.1" className="num" value={state.observedDensity} onChange={(event) => set({ observedDensity: event.target.value })} />
        </Field>
        <Field label="Temp °C">
          <input type="number" step="0.1" className="num" value={state.temperatureC} onChange={(event) => set({ temperatureC: event.target.value })} />
        </Field>
        <Field label="Seal no">
          <input type="text" value={state.sealNo} onChange={(event) => set({ sealNo: event.target.value })} />
        </Field>
        <Field label="Sealed by">
          <input type="text" value={state.sealedBy} onChange={(event) => set({ sealedBy: event.target.value })} />
        </Field>
        <Field label="Drawn by">
          <select value={state.drawnByEmployeeId} onChange={(event) => set({ drawnByEmployeeId: event.target.value })}>
            <option value="">—</option>
            {options.employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Witness">
          <input type="text" value={state.witnessName} onChange={(event) => set({ witnessName: event.target.value })} />
        </Field>
        <Field label="Retain until" hint="Defaults to the configured retention period">
          <input type="date" value={state.retainedTill} onChange={(event) => set({ retainedTill: event.target.value })} />
        </Field>
        <Field label="Storage ref">
          <input type="text" value={state.storageRef} onChange={(event) => set({ storageRef: event.target.value })} />
        </Field>
        <Field label="Result">
          <input type="text" value={state.result} onChange={(event) => set({ result: event.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end">
        <button className="button" type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Save sample
        </button>
      </div>
    </KeyboardForm>
  );
}
