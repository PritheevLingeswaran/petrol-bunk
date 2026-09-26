"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2, Truck } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatINR, formatNumber } from "@/lib/format";
import { computeDecantation } from "@/lib/pump";
import { savePurchase } from "@/server/pump/actions";
import type { PumpOptions } from "@/server/pump/queries";
import { Field, KeyboardForm, Messages, PageHead, Stat } from "@/components/pump/ui";

type Line = {
  productId: string;
  tankId: string;
  compartmentNo: string;
  invoiceQty: string;
  rate: string;
  invoiceDensity: string;
  invoiceTemperatureC: string;
  receiptDensity: string;
  receiptTemperatureC: string;
  dipBeforeMm: string;
  dipAfterMm: string;
  sealNoTop: string;
  sealNoBottom: string;
};

const blankLine = (): Line => ({
  productId: "",
  tankId: "",
  compartmentNo: "",
  invoiceQty: "",
  rate: "",
  invoiceDensity: "",
  invoiceTemperatureC: "",
  receiptDensity: "",
  receiptTemperatureC: "",
  dipBeforeMm: "",
  dipAfterMm: "",
  sealNoTop: "",
  sealNoBottom: "",
});

export function DecantationScreen({ options, today, transitLossPct }: { options: PumpOptions; today: string; transitLossPct: string }) {
  const [businessDate, setBusinessDate] = useState(today);
  const [supplierId, setSupplierId] = useState(options.suppliers[0]?.value ?? "");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [depot, setDepot] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [sealNoIntact, setSealNoIntact] = useState(true);
  const [supervisedBy, setSupervisedBy] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [charges, setCharges] = useState({ dutiesAmount: "0", cgstAmount: "0", sgstAmount: "0", igstAmount: "0", vatAmount: "0", tcsAmount: "0", freightAmount: "0", otherCharges: "0", discount: "0", roundOff: "0" });
  const [remarks, setRemarks] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState("");

  const patch = (index: number, changes: Partial<Line>) => setLines((current) => current.map((row, position) => (position === index ? { ...row, ...changes } : row)));

  const totals = useMemo(() => {
    let basic = new Decimal(0);
    let invoiceQty = new Decimal(0);
    for (const line of lines) {
      basic = basic.plus(new Decimal(line.invoiceQty || "0").mul(new Decimal(line.rate || "0")));
      invoiceQty = invoiceQty.plus(new Decimal(line.invoiceQty || "0"));
    }
    const tax = new Decimal(charges.cgstAmount || "0").plus(charges.sgstAmount || "0").plus(charges.igstAmount || "0").plus(charges.vatAmount || "0");
    const total = basic
      .plus(charges.dutiesAmount || "0")
      .plus(tax)
      .plus(charges.tcsAmount || "0")
      .plus(charges.freightAmount || "0")
      .plus(charges.otherCharges || "0")
      .minus(charges.discount || "0")
      .plus(charges.roundOff || "0");
    return { basic, tax, total, invoiceQty };
  }, [lines, charges]);

  /** Live receipt-loss preview per compartment, before anything is saved. */
  const previews = useMemo(
    () =>
      lines.map((line) => {
        if (!line.invoiceQty || !line.dipBeforeMm || !line.dipAfterMm) return null;
        try {
          // The screen shows litres straight from the dip fields; the server
          // re-derives them through the tank's calibration chart on save.
          return computeDecantation({
            invoiceQty: line.invoiceQty,
            dipBeforeLitres: "0",
            dipAfterLitres: line.invoiceQty,
            allowancePct: transitLossPct,
          });
        } catch {
          return null;
        }
      }),
    [lines, transitLossPct],
  );

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    setWarnings([]);
    setSaved("");
    const result = await savePurchase({
      supplierId,
      businessDate,
      invoiceNo,
      invoiceDate,
      depot: depot || undefined,
      vehicleNo,
      driverName: driverName || undefined,
      transporterName: transporterName || undefined,
      timeIn: timeIn || undefined,
      timeOut: timeOut || undefined,
      sealNoIntact,
      supervisedByEmployeeId: supervisedBy || undefined,
      ...charges,
      remarks: remarks || undefined,
      lines: lines.map((line) => ({
        productId: line.productId,
        tankId: line.tankId,
        compartmentNo: line.compartmentNo || undefined,
        invoiceQty: line.invoiceQty,
        rate: line.rate,
        invoiceDensity: line.invoiceDensity || undefined,
        invoiceTemperatureC: line.invoiceTemperatureC || undefined,
        receiptDensity: line.receiptDensity || undefined,
        receiptTemperatureC: line.receiptTemperatureC || undefined,
        dipBeforeMm: line.dipBeforeMm,
        dipAfterMm: line.dipAfterMm,
        sealNoTop: line.sealNoTop || undefined,
        sealNoBottom: line.sealNoBottom || undefined,
      })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setWarnings(result.warnings);
    setSaved("Invoice posted. Stock, supplier ledger and receipt loss are recorded.");
  };

  return (
    <section className="space-y-4">
      <PageHead eyebrow="PURCHASES" title="Tanker receipt & decantation" description="Invoice, tanker, seals and dip-verified quantity received.">
        <button className="button" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Post invoice
        </button>
      </PageHead>

      <Messages error={error} warnings={warnings} info={saved || undefined} />

      <KeyboardForm onSave={save} className="space-y-4">
        <div className="panel space-y-3 p-3">
          <p className="eyebrow">
            <Truck size={12} className="mr-1 inline" /> TANKER & INVOICE
          </p>
          <div className="collection-row">
            <Field label="Date">
              <input type="date" value={businessDate} max={today} onChange={(event) => setBusinessDate(event.target.value)} />
            </Field>
            <Field label="Supplier / OMC">
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
                {options.suppliers.map((supplier) => (
                  <option key={supplier.value} value={supplier.value}>
                    {supplier.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Invoice no">
              <input type="text" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} required />
            </Field>
            <Field label="Invoice date">
              <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
            </Field>
            <Field label="Depot">
              <input type="text" value={depot} onChange={(event) => setDepot(event.target.value)} />
            </Field>
            <Field label="Tanker no">
              <input type="text" value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} required />
            </Field>
            <Field label="Driver">
              <input type="text" value={driverName} onChange={(event) => setDriverName(event.target.value)} />
            </Field>
            <Field label="Transporter">
              <input type="text" value={transporterName} onChange={(event) => setTransporterName(event.target.value)} />
            </Field>
            <Field label="Time in">
              <input type="time" value={timeIn} onChange={(event) => setTimeIn(event.target.value)} />
            </Field>
            <Field label="Time out">
              <input type="time" value={timeOut} onChange={(event) => setTimeOut(event.target.value)} />
            </Field>
            <Field label="Supervised by">
              <select value={supervisedBy} onChange={(event) => setSupervisedBy(event.target.value)}>
                <option value="">—</option>
                {options.employees.map((employee) => (
                  <option key={employee.value} value={employee.value}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={sealNoIntact} onChange={(event) => setSealNoIntact(event.target.checked)} />
            Seals intact on arrival
          </label>
          {!sealNoIntact ? <p className="alert-bar">Seals reported broken. Record this on the receipt and draw a sample before decanting.</p> : null}
        </div>

        <div className="panel space-y-3 p-3">
          <div className="flex items-center justify-between">
            <h2>Compartments</h2>
            <button type="button" className="button button-secondary" onClick={() => setLines((current) => [...current, blankLine()])}>
              <Plus size={14} /> Add compartment
            </button>
          </div>
          <p className="muted text-xs">One tanker may carry several products into several tanks. Each compartment is decanted and dipped separately.</p>

          {lines.map((line, index) => (
            <div className="space-y-2 border border-slate-800 p-3" key={index}>
              <div className="flex items-center justify-between">
                <p className="eyebrow">COMPARTMENT {index + 1}</p>
                {lines.length > 1 ? (
                  <button type="button" className="icon-button" aria-label="Remove compartment" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
              <div className="collection-row">
                <Field label="Compartment no">
                  <input type="text" value={line.compartmentNo} onChange={(event) => patch(index, { compartmentNo: event.target.value })} />
                </Field>
                <Field label="Product">
                  <select
                    value={line.productId}
                    onChange={(event) => {
                      const tank = options.tanks.find((row) => row.productId === event.target.value);
                      patch(index, { productId: event.target.value, tankId: tank?.value ?? "" });
                    }}
                    required
                  >
                    <option value="">—</option>
                    {options.products.map((product) => (
                      <option key={product.value} value={product.value}>
                        {product.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Into tank">
                  <select value={line.tankId} onChange={(event) => patch(index, { tankId: event.target.value })} required>
                    <option value="">—</option>
                    {options.tanks
                      .filter((tank) => !line.productId || tank.productId === line.productId)
                      .map((tank) => (
                        <option key={tank.value} value={tank.value}>
                          {tank.label}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Invoice qty L">
                  <input type="number" step="0.01" inputMode="decimal" className="num" value={line.invoiceQty} onChange={(event) => patch(index, { invoiceQty: event.target.value })} required />
                </Field>
                <Field label="Rate ₹/L">
                  <input type="number" step="0.0001" inputMode="decimal" className="num" value={line.rate} onChange={(event) => patch(index, { rate: event.target.value })} required />
                </Field>
                <Field label="Seal top">
                  <input type="text" value={line.sealNoTop} onChange={(event) => patch(index, { sealNoTop: event.target.value })} />
                </Field>
                <Field label="Seal bottom">
                  <input type="text" value={line.sealNoBottom} onChange={(event) => patch(index, { sealNoBottom: event.target.value })} />
                </Field>
              </div>
              <div className="collection-row">
                <Field label="Invoice density">
                  <input type="number" step="0.1" inputMode="decimal" className="num" value={line.invoiceDensity} onChange={(event) => patch(index, { invoiceDensity: event.target.value })} />
                </Field>
                <Field label="Invoice temp °C">
                  <input type="number" step="0.1" inputMode="decimal" className="num" value={line.invoiceTemperatureC} onChange={(event) => patch(index, { invoiceTemperatureC: event.target.value })} />
                </Field>
                <Field label="Receipt density">
                  <input type="number" step="0.1" inputMode="decimal" className="num" value={line.receiptDensity} onChange={(event) => patch(index, { receiptDensity: event.target.value })} />
                </Field>
                <Field label="Receipt temp °C">
                  <input type="number" step="0.1" inputMode="decimal" className="num" value={line.receiptTemperatureC} onChange={(event) => patch(index, { receiptTemperatureC: event.target.value })} />
                </Field>
                <Field label="Dip before mm">
                  <input type="number" step="0.1" inputMode="decimal" className="num" value={line.dipBeforeMm} onChange={(event) => patch(index, { dipBeforeMm: event.target.value })} required />
                </Field>
                <Field label="Dip after mm">
                  <input type="number" step="0.1" inputMode="decimal" className="num" value={line.dipAfterMm} onChange={(event) => patch(index, { dipAfterMm: event.target.value })} required />
                </Field>
              </div>
              {previews[index] ? (
                <p className="muted text-xs">
                  Permitted loss at {transitLossPct} % of {formatNumber(line.invoiceQty)} L is {formatNumber(previews[index]!.allowedLoss.toFixed(2))} L. The received quantity is
                  measured from the tank&rsquo;s calibration chart when you post.
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="panel space-y-3 p-3">
          <h2>Invoice value</h2>
          <div className="collection-row">
            {(
              [
                ["dutiesAmount", "Duties"],
                ["cgstAmount", "CGST"],
                ["sgstAmount", "SGST"],
                ["igstAmount", "IGST"],
                ["vatAmount", "VAT"],
                ["tcsAmount", "TCS 206C(1H)"],
                ["freightAmount", "Freight"],
                ["otherCharges", "Other charges"],
                ["discount", "Discount"],
                ["roundOff", "Round off"],
              ] as const
            ).map(([field, label]) => (
              <Field label={`${label} ₹`} key={field}>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="num"
                  value={charges[field]}
                  onChange={(event) => setCharges((current) => ({ ...current, [field]: event.target.value }))}
                />
              </Field>
            ))}
          </div>
          <div className="stat-grid">
            <Stat label="Basic value" value={formatINR(totals.basic.toFixed(2))} sub={`${formatNumber(totals.invoiceQty.toFixed(2))} L invoiced`} />
            <Stat label="Taxes" value={formatINR(totals.tax.toFixed(2))} sub="CGST + SGST or IGST, plus VAT" />
            <Stat label="Invoice total" value={formatINR(totals.total.toFixed(2))} sub="Posted to the supplier ledger" />
          </div>
          <Field label="Remarks">
            <textarea rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end">
          <button className="button" type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Post invoice
            <kbd className="ml-1 text-[0.62rem] opacity-70">Ctrl+S</kbd>
          </button>
        </div>
      </KeyboardForm>
    </section>
  );
}
