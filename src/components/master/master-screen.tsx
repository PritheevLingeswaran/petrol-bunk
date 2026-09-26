"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { saveMaster, softDeleteMaster } from "@/server/master/actions";
import type { MasterEntity } from "@/server/master/schemas";
import type { MasterRecord, SelectOption } from "@/server/master/queries";

type FieldKind = "text" | "number" | "date" | "datetime-local" | "time" | "textarea" | "checkbox" | "select" | "vehicles" | "file";
export type Field = { key: string; label: string; kind?: FieldKind; required?: boolean; options?: SelectOption[]; hidden?: boolean; readOnlyOnEdit?: boolean };
type Props = { entity: MasterEntity; title: string; description: string; records: MasterRecord[]; fields: Field[]; columns: string[]; options?: SelectOption[]; immutable?: boolean };

const stringValue = (value: string | boolean | string[] | undefined): string => Array.isArray(value) ? value.join(", ") : String(value ?? "");

export function MasterScreen({ entity, title, description, records, fields, columns, immutable = false }: Props) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<MasterRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const filterable = fields.filter((field) => ["select", "checkbox"].includes(field.kind ?? "text")).slice(0, 4);
  const visible = useMemo(() => records.filter((record) => {
    const haystack = Object.values(record.values).map(stringValue).join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase()) && Object.entries(filters).every(([key, value]) => !value || stringValue(record.values[key]).toLowerCase() === value.toLowerCase());
  }), [filters, query, records]);
  const edit = (record?: MasterRecord) => {
    setEditing(record ?? null);
    const values = record?.values ?? {};
    setForm(Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? (field.kind === "checkbox" ? false : field.kind === "vehicles" ? "[]" : "")])) as Record<string, string | boolean>);
    setMessage(""); setOpen(true);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPending(true); setMessage("");
    const data: Record<string, unknown> = { ...form };
    if (entity === "customer") {
      try { data.vehicles = JSON.parse(String(form.vehicles || "[]")); } catch { setPending(false); setMessage("Vehicle list must be valid JSON"); return; }
    }
    if (entity === "firm") {
      try { data.documentSeries = JSON.parse(String(form.documentSeries || "[]")); } catch { setPending(false); setMessage("Document series must be valid JSON"); return; }
    }
    const result = await saveMaster({ entity, id: editing?.id, data });
    setPending(false);
    if (result.ok) { setOpen(false); window.location.reload(); }
    else setMessage(result.error);
  };
  const deactivate = async (record: MasterRecord) => {
    if (!window.confirm(`Deactivate ${record.values.name ?? record.values.code}?`)) return;
    const result = await softDeleteMaster(entity, record.id);
    if (result.ok) window.location.reload(); else setMessage(result.error);
  };
  const upload = async (file: File, key: string) => {
    const data = new FormData(); data.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: data });
    const result = await response.json() as { url?: string; error?: string };
    const url = result.url;
    if (url) setForm((current) => ({ ...current, [key]: url })); else setMessage(result.error ?? "Upload failed");
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-4">
      <div><p className="eyebrow">MASTER CONTROL</p><h1>{title}</h1><p className="text-sm text-slate-400">{description}</p></div>
      <div className="flex gap-2"><a className="button button-secondary" href={`/api/export/${entity}`}><Download size={16} /> Excel</a><button className="button" onClick={() => edit()}><Plus size={16} /> Add {title.replace(/s$/, "")}</button></div>
    </div>
    {message && <p className="rounded border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">{message}</p>}
    <div className="panel space-y-3 p-3">
      <div className="flex flex-wrap gap-2"><label className="search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all columns" /></label>{filterable.map((field) => <select className="filter" key={field.key} value={filters[field.key] ?? ""} onChange={(event) => setFilters((old) => ({ ...old, [field.key]: event.target.value }))}><option value="">All {field.label}</option>{Array.from(new Set(records.map((record) => stringValue(record.values[field.key])))).filter(Boolean).map((value) => <option key={value} value={value}>{value}</option>)}</select>)}</div>
      <div className="overflow-auto"><table><thead><tr>{columns.map((column) => <th key={column}>{fields.find((field) => field.key === column)?.label ?? column}</th>)}<th className="text-right">Actions</th></tr></thead><tbody>{visible.map((record) => <tr key={record.id} className={record.inactive ? "opacity-45" : ""}>{columns.map((column, index) => <td key={column} className={index === 0 ? "sticky-col font-medium" : ""}>{typeof record.values[column] === "boolean" ? record.values[column] ? "Yes" : "No" : stringValue(record.values[column]) || "—"}</td>)}<td><div className="flex justify-end gap-1"><button aria-label="Edit" className="icon-button" onClick={() => edit(record)} disabled={immutable}><Pencil size={15}/></button><button aria-label="Deactivate" className="icon-button" onClick={() => deactivate(record)}><Trash2 size={15}/></button></div></td></tr>)}{visible.length === 0 && <tr><td colSpan={columns.length + 1} className="py-10 text-center text-slate-500">No matching records. Add the first one.</td></tr>}</tbody></table></div>
    </div>
    {open && <div className="drawer-backdrop" role="presentation"><aside className="drawer" role="dialog" aria-modal="true"><div className="flex items-center justify-between border-b border-slate-800 pb-3"><div><p className="eyebrow">{editing ? "EDIT" : "CREATE"}</p><h2>{editing ? `Edit ${title.replace(/s$/, "")}` : `Add ${title.replace(/s$/, "")}`}</h2></div><button className="icon-button" onClick={() => setOpen(false)}><X/></button></div><form className="mt-5 space-y-4" onSubmit={submit}>{fields.filter((field) => !field.hidden).map((field) => <FieldInput key={field.key} field={field} value={form[field.key]} disabled={immutable && Boolean(editing)} onChange={(value) => setForm((old) => ({ ...old, [field.key]: value }))} onFile={(file) => upload(file, field.key)}/>) }{message && <p className="text-sm text-amber-300">{message}</p>}<div className="flex justify-end gap-2 border-t border-slate-800 pt-4"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button></div></form></aside></div>}
  </section>;
}

function FieldInput({ field, value, onChange, onFile, disabled }: { field: Field; value: string | boolean | undefined; onChange: (value: string | boolean) => void; onFile: (file: File) => void; disabled: boolean }) {
  const kind = field.kind ?? "text";
  if (kind === "checkbox") return <label className="check-row"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} disabled={disabled}/>{field.label}</label>;
  if (kind === "select") return <label className="field"><span>{field.label}{field.required && " *"}</span><select required={field.required} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} disabled={disabled || (field.readOnlyOnEdit && Boolean(value))}><option value="">Select {field.label}</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (kind === "textarea" || kind === "vehicles") return <label className="field"><span>{field.label}{field.required && " *"}</span><textarea rows={kind === "vehicles" ? 7 : 3} required={field.required} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={kind === "vehicles" ? '[{"vehicleNo":"TN 01 AB 1234","driverName":"","allowedProductCodes":["MS"],"monthlyLimit":"0"}]' : undefined}/></label>;
  if (kind === "file") return <label className="field"><span>{field.label}</span><input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])}/>{value && <small>{String(value)}</small>}</label>;
  return <label className="field"><span>{field.label}{field.required && " *"}</span><input type={kind} required={field.required} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} disabled={disabled}/></label>;
}
