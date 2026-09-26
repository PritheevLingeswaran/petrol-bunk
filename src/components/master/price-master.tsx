"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MasterScreen, type Field } from "@/components/master/master-screen";
import type { MasterRecord, SelectOption } from "@/server/master/queries";

export function PriceMaster({ records, fields, productOptions }: { records: MasterRecord[]; fields: Field[]; productOptions: SelectOption[] }) {
  const [productId, setProductId] = useState(productOptions[0]?.value ?? "");
  const points = useMemo(() => records.filter((record) => record.values.productId === productId && !record.inactive).slice().reverse().map((record) => ({ at: String(record.values.effectiveFrom).replace("T", " "), rate: Number(record.values.rate), purchase: Number(record.values.purchaseRate || 0) })), [productId, records]);
  return <div className="space-y-4"><MasterScreen entity="price" title="Price master" description="Effective-dated retail rates. History is immutable; a change always creates the next record." records={records} fields={fields} columns={["product", "rate", "purchaseRate", "effectiveFrom", "reason", "enteredBy"]} immutable/>
    <section className="panel p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">RATE TIMELINE</p><h2>Product price history</h2></div><select className="filter" value={productId} onChange={(event) => setProductId(event.target.value)}>{productOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="h-72">{points.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={points}><CartesianGrid stroke="#1e293b" vertical={false}/><XAxis dataKey="at" stroke="#94a3b8" tick={{ fontSize: 11 }}/><YAxis stroke="#94a3b8" tick={{ fontSize: 11 }}/><Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}/><Line type="stepAfter" dataKey="rate" name="Selling rate" stroke="#14b8a6" strokeWidth={2}/><Line type="stepAfter" dataKey="purchase" name="Purchase rate" stroke="#64748b" strokeWidth={2}/></LineChart></ResponsiveContainer> : <p className="pt-24 text-center text-sm text-slate-500">No active price history for this product.</p>}</div></section></div>;
}
