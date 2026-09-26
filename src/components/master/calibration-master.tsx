"use client";

import { useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { MasterScreen, type Field } from "@/components/master/master-screen";
import { importCalibrationCsv } from "@/server/master/actions";
import type { MasterRecord, SelectOption } from "@/server/master/queries";

export function CalibrationMaster({ records, fields, tanks }: { records: MasterRecord[]; fields: Field[]; tanks: SelectOption[] }) {
  const [tankId, setTankId] = useState(tanks[0]?.value ?? ""); const [chartType, setChartType] = useState<"FUEL" | "WATER">("FUEL"); const [csv, setCsv] = useState(""); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (pending) return; setPending(true); const result = await importCalibrationCsv(tankId, chartType, csv); if (result.ok) { window.location.reload(); return; } setPending(false); setMessage(result.error); };
  return <div className="space-y-4"><MasterScreen entity="calibration" title="Dip calibration charts" description="Certified dip mm to litre tables. Fuel and water charts remain separate." records={records} fields={fields} columns={["tank", "chartType", "dipMm", "litres"]}/><form className="panel grid gap-3 p-4 md:grid-cols-[1fr_160px_1fr_auto]" onSubmit={submit}><label className="field"><span>Tank</span><select value={tankId} onChange={(event) => setTankId(event.target.value)} disabled={pending}>{tanks.map((tank) => <option key={tank.value} value={tank.value}>{tank.label}</option>)}</select></label><label className="field"><span>Chart</span><select value={chartType} onChange={(event) => setChartType(event.target.value as "FUEL" | "WATER")} disabled={pending}><option value="FUEL">Fuel</option><option value="WATER">Water</option></select></label><label className="field"><span>Paste CSV</span><textarea required rows={2} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="dip_mm,litres&#10;10,100.00" disabled={pending}/></label><button className="button self-end" disabled={pending}><Upload size={16}/> {pending ? "Importing…" : "Import CSV"}</button>{message && <p className="text-sm text-amber-300 md:col-span-4">{message}</p>}</form></div>;
}
