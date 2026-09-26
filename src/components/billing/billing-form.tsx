"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CirclePlus, CloudOff, Minus, Save, Trash2 } from "lucide-react";
import { Decimal } from "decimal.js";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { computeBillLine, computeBillTotals } from "@/lib/billing";
import { formatINR, formatNumber } from "@/lib/format";
import { saveBill } from "@/server/billing/actions";
import { billSchema } from "@/server/billing/schemas";
import type { getBillingOptions } from "@/server/billing/queries";
import { pendingBills, queueBill, removePendingBill } from "@/components/billing/offline-queue";
import { BillingNav } from "@/components/billing/nav";

type Options = Awaited<ReturnType<typeof getBillingOptions>>;
type FormValues = z.input<typeof billSchema>;
type Props = { title: string; description: string; billType: "CASH" | "CREDIT" | "COUNTER" | "CREDIT_NOTE"; today: string; time: string; options: Options; mobile?: boolean };

const emptyLine = { productId: "", quantity: "1", discountPerUnit: "0" };

export function BillingForm({ title, description, billType, today, time, options, mobile = false }: Props) {
  const [message, setMessage] = useState<string>();
  const [saved, setSaved] = useState<{ id: string; docNumber: string }>();
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const syncing = useRef(false);
  const form = useForm<FormValues>({ resolver: zodResolver(billSchema), defaultValues: { billType, invoiceKind: billType === "COUNTER" ? "GST_INVOICE" : "BILL_OF_SUPPLY", channel: mobile ? "MOBILE" : "DESKTOP", businessDate: today, billedTime: time, customerId: "", vehicleId: "", vehicleNo: "", driverName: "", salesmanEmployeeId: "", nozzleId: "", shiftEntryId: "", paymentModeId: "", paymentReference: "", remarks: "", originalBillId: "", autoRoundOff: true, sendSms: false, sendEmail: false, creditOverrideReason: "", lines: [{ ...emptyLine }] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const values = form.watch();
  const selectedCustomer = options.customers.find((customer) => customer.id === values.customerId);
  const vehicles = selectedCustomer?.vehicles ?? [];
  const preview = useMemo(() => {
    try {
      const lines = values.lines.flatMap((line) => {
        const product = options.products.find((entry) => entry.id === line.productId);
        if (!product?.rate || !line.quantity) return [];
        return [computeBillLine({ productId: product.id, quantity: line.quantity, rate: product.rate, discountPerUnit: line.discountPerUnit || "0", gstPct: product.gstPct, taxTreatment: values.invoiceKind === "GST_INVOICE" && !product.isFuel ? "INTRA_STATE" : "EXEMPT" })];
      });
      return lines.length ? computeBillTotals(lines, Boolean(values.autoRoundOff)) : null;
    } catch { return null; }
  }, [options.products, values]);

  async function refreshPending() { if (mobile && "indexedDB" in window) setPending((await pendingBills()).length); }
  async function syncQueue() {
    if (!mobile || syncing.current || !navigator.onLine) return;
    syncing.current = true;
    try {
      for (const item of await pendingBills()) {
        const result = await saveBill(item.payload);
        if (result.ok) await removePendingBill(item.clientRequestId);
        else { setMessage(`Sync paused: ${result.error}`); break; }
      }
      await refreshPending();
    } finally { syncing.current = false; }
  }
  useEffect(() => {
    if (!mobile) return;
    setOnline(navigator.onLine); void refreshPending(); void syncQueue();
    const cameOnline = () => { setOnline(true); void syncQueue(); }; const wentOffline = () => setOnline(false);
    window.addEventListener("online", cameOnline); window.addEventListener("offline", wentOffline); return () => { window.removeEventListener("online", cameOnline); window.removeEventListener("offline", wentOffline); };
  }, [mobile]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void form.handleSubmit(submit)(); }
      if (event.key === "Escape" && form.formState.isDirty && confirm("Discard unsaved bill changes?")) form.reset();
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  });

  async function submit(data: FormValues) {
    setMessage(undefined); setSaved(undefined);
    const payload = { ...data, clientRequestId: data.clientRequestId || (mobile ? crypto.randomUUID() : undefined) } as Record<string, unknown>;
    if (mobile) {
      const clientRequestId = await queueBill(payload); await refreshPending();
      if (!navigator.onLine) { setMessage("Bill saved offline. It will sync automatically when the network returns."); form.reset({ ...form.getValues(), lines: [{ ...emptyLine }], clientRequestId: "" }); return; }
      try {
        const result = await saveBill(payload);
        if (!result.ok) { await removePendingBill(clientRequestId); await refreshPending(); setMessage(result.error); return; }
        await removePendingBill(clientRequestId); await refreshPending(); setSaved(result); setMessage(`${result.duplicate ? "Already synced" : "Saved"}: ${result.docNumber}`); form.reset({ ...form.getValues(), lines: [{ ...emptyLine }], clientRequestId: "" }); return;
      } catch { setMessage("Connection interrupted. The bill remains queued with the same request ID and will retry without duplication."); return; }
    }
    const result = await saveBill(payload);
    if (!result.ok) { setMessage(result.error); return; }
    setSaved(result); setMessage(`${result.duplicate ? "Already synced" : "Saved"}: ${result.docNumber}${result.warnings.length ? ` · ${result.warnings.join(" · ")}` : ""}`);
    form.reset({ ...form.getValues(), lines: [{ ...emptyLine }], clientRequestId: "" });
  }

  if (!options.editable) return <div className="page"><BillingNav /><div className="info-bar">Choose one outlet in the header to create a bill. The bill register can remain in All Outlets mode.</div></div>;
  return <div className="page billing-page">
    <BillingNav />
    <div className="section-head"><div><p className="eyebrow">{billType.replace("_", " ")}</p><h1>{title}</h1><p className="muted page-lede">{description}</p></div>{mobile && <div className={`sync-pill ${pending ? "pending" : ""}`}><CloudOff size={15} /> Pending sync: {pending} bills <button type="button" onClick={() => void syncQueue()}>Sync</button></div>}</div>
    {message && <div className={message.startsWith("Sync paused") || message.includes("Correct") ? "alert-bar" : "info-bar"}>{message}</div>}
    <form className="billing-workspace" onSubmit={form.handleSubmit(submit)}>
      <aside className="billing-context panel">
        <p className="eyebrow">CONTEXT</p>
        <label className="field"><span>Business date</span><input type="date" {...form.register("businessDate")} /></label>
        <label className="field"><span>Bill time</span><input type="time" {...form.register("billedTime")} /></label>
        <label className="field"><span>Document</span><select {...form.register("invoiceKind")}><option value="BILL_OF_SUPPLY">Bill of supply</option><option value="GST_INVOICE">GST invoice</option></select></label>
        {billType === "CREDIT_NOTE" && <label className="field"><span>Original bill</span><select {...form.register("originalBillId")}><option value="">Select</option>{options.originalBills.map((bill) => <option value={bill.id} key={bill.id}>{bill.label}</option>)}</select></label>}
        <label className="field"><span>{billType === "CREDIT" ? "Credit customer" : "Customer (optional)"}</span><select {...form.register("customerId", { onChange: (event) => { const customer = options.customers.find((entry) => entry.id === event.target.value); if (customer) form.setValue("lines.0.discountPerUnit", customer.discountPerLitre); } })}><option value="">Walk-in</option>{options.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.code} · {customer.name}</option>)}</select></label>
        {selectedCustomer && <div className="credit-meter"><span>Limit {formatINR(selectedCustomer.creditLimit)}</span><span>{selectedCustomer.creditDays} credit days</span></div>}
        {billType === "CREDIT" && <label className="field"><span>Manager override reason</span><textarea rows={2} placeholder="Only needed when policy blocks this sale" {...form.register("creditOverrideReason")} /></label>}
        <label className="field"><span>Vehicle</span><select {...form.register("vehicleId", { onChange: (event) => { const vehicle = vehicles.find((entry) => entry.id === event.target.value); form.setValue("vehicleNo", vehicle?.vehicleNo ?? ""); form.setValue("driverName", vehicle?.driverName ?? ""); } })}><option value="">Manual / none</option>{vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.vehicleNo}</option>)}</select></label>
        <label className="field"><span>Vehicle number</span><input {...form.register("vehicleNo")} /></label>
        <label className="field"><span>Driver name</span><input {...form.register("driverName")} /></label>
        <label className="field"><span>Salesman</span><select {...form.register("salesmanEmployeeId")}><option value="">Select</option>{options.employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.code} · {employee.name}</option>)}</select></label>
        <label className="field"><span>Nozzle</span><select {...form.register("nozzleId")}><option value="">Counter / none</option>{options.nozzles.map((nozzle) => <option value={nozzle.id} key={nozzle.id}>{nozzle.label}</option>)}</select></label>
        <label className="field"><span>Shift</span><select {...form.register("shiftEntryId")}><option value="">Not linked</option>{options.shiftEntries.map((shift) => <option value={shift.id} key={shift.id}>{shift.label}</option>)}</select></label>
      </aside>
      <section className="billing-main panel">
        <div className="line-toolbar"><div><p className="eyebrow">PRODUCT LINES</p><h2>Invoice items</h2></div><button className="button button-secondary" type="button" onClick={() => append({ ...emptyLine })}><CirclePlus size={15} /> Add line</button></div>
        <div className="table-wrap"><table className="bill-lines"><thead><tr><th>#</th><th>Product</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Disc/unit</th><th className="num">Taxable</th><th className="num">GST</th><th className="num">Line total</th><th /></tr></thead><tbody>{fields.map((field, index) => {
          const row = values.lines[index]; const product = options.products.find((entry) => entry.id === row?.productId); let calculated: ReturnType<typeof computeBillLine> | null = null;
          try { if (product?.rate && row?.quantity) calculated = computeBillLine({ productId: product.id, quantity: row.quantity, rate: product.rate, discountPerUnit: row.discountPerUnit || "0", gstPct: product.gstPct, taxTreatment: values.invoiceKind === "GST_INVOICE" && !product.isFuel ? "INTRA_STATE" : "EXEMPT" }); } catch { calculated = null; }
          return <tr key={field.id}><td>{index + 1}</td><td><select {...form.register(`lines.${index}.productId`)}><option value="">Select product</option>{options.products.filter((entry) => billType !== "COUNTER" || !entry.isFuel).map((entry) => <option value={entry.id} key={entry.id}>{entry.code} · {entry.name}</option>)}</select></td><td><input className="num" inputMode="decimal" {...form.register(`lines.${index}.quantity`)} /></td><td className="num">{product?.rate ? formatNumber(product.rate) : "—"}</td><td><input className="num" inputMode="decimal" {...form.register(`lines.${index}.discountPerUnit`)} /></td><td className="num">{calculated ? formatNumber(calculated.taxableValue) : "—"}</td><td className="num">{calculated ? formatNumber(calculated.gstAmount) : "—"}</td><td className="num strong">{calculated ? formatNumber(calculated.amount) : "—"}</td><td><button aria-label="Remove line" className="icon-button" disabled={fields.length === 1} type="button" onClick={() => remove(index)}><Trash2 size={14} /></button></td></tr>;
        })}</tbody></table></div>
        <div className="bill-settlement">
          <div className="settlement-fields">
            {billType !== "CREDIT" && billType !== "CREDIT_NOTE" && <label className="field"><span>Payment mode</span><select {...form.register("paymentModeId")}><option value="">Select</option>{options.paymentModes.filter((mode) => mode.type !== "CREDIT").map((mode) => <option value={mode.id} key={mode.id}>{mode.name}</option>)}</select></label>}
            <label className="field"><span>Reference</span><input {...form.register("paymentReference")} /></label>
            <label className="field wide"><span>Remarks</span><input {...form.register("remarks")} /></label>
            <label className="check-row"><input type="checkbox" {...form.register("sendSms")} /> SMS on save</label><label className="check-row"><input type="checkbox" {...form.register("sendEmail")} /> Email on save</label><label className="check-row"><input type="checkbox" {...form.register("autoRoundOff")} /> Auto round-off</label>
          </div>
          <div className="settlement-total"><span>Grand total</span><strong>{formatINR(preview?.grandTotal ?? 0)}</strong><small>Round-off {formatINR(preview?.roundOff ?? 0)}</small></div>
        </div>
        <div className="save-strip"><span>{Object.keys(form.formState.errors).length ? "Correct the marked fields before saving" : "Ctrl+S saves · Esc discards"}</span><button className="button" disabled={form.formState.isSubmitting} type="submit"><Save size={15} /> {form.formState.isSubmitting ? "Saving…" : mobile && !online ? "Queue offline" : "Save bill"}</button></div>
        {saved && <div className="saved-actions"><strong>{saved.docNumber}</strong><Link className="button button-secondary" href={`/billing/print?ids=${saved.id}&layout=A5`}>Print</Link><a className="button button-secondary" href={`/api/billing/pdf?ids=${saved.id}&layout=A5`}>PDF</a></div>}
      </section>
      <aside className="invoice-tape panel"><p className="eyebrow">LIVE TOTAL</p><h2>{options.outlet.name}</h2><p className="muted">{values.invoiceKind === "GST_INVOICE" ? "GST Tax Invoice" : "Bill of Supply"}</p><div className="tape-rule" />{values.lines.map((line, index) => { const product = options.products.find((entry) => entry.id === line.productId); return product ? <div className="tape-line" key={`${product.id}-${index}`}><span>{product.code}<small>{line.quantity || "0"} × {product.rate}</small></span><b>{formatINR(new Decimal(line.quantity || 0).mul(product.rate || 0))}</b></div> : null; })}<div className="tape-rule" /><dl><dt>Taxable</dt><dd>{formatINR(preview?.taxableValue ?? 0)}</dd><dt>GST</dt><dd>{formatINR(preview?.gstAmount ?? 0)}</dd><dt>Round-off</dt><dd>{formatINR(preview?.roundOff ?? 0)}</dd></dl><div className="tape-grand"><span>PAYABLE</span><strong>{formatINR(preview?.grandTotal ?? 0)}</strong></div></aside>
    </form>
  </div>;
}
