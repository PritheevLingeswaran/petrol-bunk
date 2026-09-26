"use client";
import { EmptyRow } from "@/components/shell/empty-row";

import { CheckCircle2, Download, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { saveEInvoiceResponse } from "@/server/billing/actions";
import type { listEInvoiceBills } from "@/server/billing/queries";
import { BillingNav } from "@/components/billing/nav";

type Row = Awaited<ReturnType<typeof listEInvoiceBills>>[number];
export function EInvoiceScreen({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = useState<Row | null>(rows[0] ?? null); const [message, setMessage] = useState<string>();
  async function submit(data: FormData) { const result = await saveEInvoiceResponse({ ...Object.fromEntries(data), billId: selected?.id }); setMessage(result.ok ? "IRN, acknowledgement and signed QR stored on the invoice." : result.error); }
  return <div className="page billing-page"><BillingNav /><div className="section-head"><div><p className="eyebrow">GST SCHEMA V1.1</p><h1>E-invoice workbench</h1><p className="muted page-lede">Validate the mandatory GST fields before downloading IRN-ready JSON, then retain the portal response.</p></div></div>{message && <div className="info-bar">{message}</div>}
    <div className="einvoice-grid"><div className="panel register-panel"><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>GSTIN</th><th className="num">Total</th><th>Readiness</th></tr></thead><tbody>{rows.length === 0 && <EmptyRow colSpan={5} message="No GST invoices found." hint="Lubricant and counter-goods bills with GST appear here." />}{rows.map((row) => <tr className={selected?.id === row.id ? "selected-row" : ""} key={row.id} onClick={() => setSelected(row)}><td>{row.docNumber}<small className="table-sub">{row.date} · {row.outlet}</small></td><td>{row.customer}</td><td>{row.gstin || "—"}</td><td className="num strong">{row.total}</td><td>{row.ready ? <span className="badge ok">Ready</span> : <span className="badge alert">{row.missing.length} missing</span>}</td></tr>)}</tbody></table></div></div>
      <aside className="panel validation-panel">{selected ? <><p className="eyebrow">VALIDATION PANEL</p><h2>{selected.docNumber}</h2>{selected.ready ? <div className="validation-ok"><CheckCircle2 size={22} /><span>All mandatory v1.1 fields are present.</span></div> : <><div className="validation-bad"><TriangleAlert size={20} /> Download is locked</div><ul>{selected.missing.map((field) => <li key={field}>{field}</li>)}</ul></>}<a className="button" aria-disabled={!selected.ready} href={selected.ready ? `/api/billing/e-invoice?id=${selected.id}` : undefined} download={`${selected.docNumber}.json`}><Download size={15} /> Download JSON</a><div className="tape-rule" /><h2>Paste portal response</h2><form action={submit}><label className="field"><span>IRN</span><textarea name="irn" rows={3} defaultValue={selected.irn ?? ""} required /></label><label className="field"><span>Acknowledgement number</span><input name="acknowledgementNo" defaultValue={selected.acknowledgementNo ?? ""} required /></label><label className="field"><span>Acknowledgement time (ISO)</span><input name="acknowledgementAt" defaultValue={new Date().toISOString()} required /></label><label className="field"><span>Signed QR data</span><textarea name="signedQr" rows={5} required /></label><button className="button" disabled={!selected.ready} type="submit">Store IRN response</button></form></> : <p>No GST invoices found.</p>}</aside>
    </div>
  </div>;
}
