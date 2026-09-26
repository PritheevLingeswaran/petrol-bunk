"use client";
import { EmptyRow } from "@/components/shell/empty-row";
import { useRef, useState, useTransition } from "react";
import { saveInspection } from "@/server/inventory/actions";
type Check = {
  code: string;
  category: string;
  label: string;
  unit?: string;
  expectedValue?: string;
  sortOrder: number;
};
type Row = {
  id: string;
  date: string;
  type: string;
  inspectorName: string;
  organisation: string;
  result: string;
  failed: number;
  itemCount: number;
  photoCount: number;
  outlet: string;
  dueDate: string;
};
export function InspectionScreen({
  rows,
  checklist,
  today,
  editable,
}: {
  rows: Row[];
  checklist: readonly Check[];
  today: string;
  editable: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [photos, setPhotos] = useState<{ url: string; caption?: string }[]>([]);
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const p = point(e);
    const x = canvas.current!.getContext("2d")!;
    x.beginPath();
    x.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const p = point(e);
    const x = canvas.current!.getContext("2d")!;
    x.strokeStyle = "#17212b";
    x.lineWidth = 2;
    x.lineCap = "round";
    x.lineTo(p.x, p.y);
    x.stroke();
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    for (const file of files) {
      const body = new FormData();
      body.set("file", file);
      const r = await fetch("/api/upload", { method: "POST", body });
      const data = await r.json();
      if (data.url) setPhotos((v) => [...v, { url: data.url }]);
    }
  }
  async function submit(form: FormData) {
    const values = Object.fromEntries(form);
    const items = checklist.map((item) => ({
      ...item,
      result: String(values[`result:${item.code}`] ?? "PASS"),
      measuredValue: String(values[`measured:${item.code}`] ?? "") || undefined,
      observation:
        String(values[`observation:${item.code}`] ?? "") || undefined,
      correctiveAction:
        String(values[`action:${item.code}`] ?? "") || undefined,
    }));
    const payload = {
      ...values,
      signatureUrl: canvas.current?.toDataURL("image/png"),
      items,
      photos,
    };
    const r = await saveInspection(payload);
    setMessage(r.ok ? "Inspection report saved." : r.error);
  }
  return (
    <div className="inventory-page">
      {message && <div className="info-bar">{message}</div>}
      {editable && (
        <form action={submit} className="panel inspection-form">
          <div className="inspection-meta">
            <label className="field">
              <span>Date</span>
              <input name="businessDate" type="date" defaultValue={today} />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="type">
                <option>OMC</option>
                <option>LEGAL_METROLOGY</option>
                <option>INTERNAL_AUDIT</option>
                <option>FIRE_SAFETY</option>
                <option>OTHER</option>
              </select>
            </label>
            <label className="field">
              <span>Inspector</span>
              <input name="inspectorName" required />
            </label>
            <label className="field">
              <span>Designation</span>
              <input name="inspectorDesignation" />
            </label>
            <label className="field">
              <span>Organisation</span>
              <input name="organisation" />
            </label>
            <label className="field">
              <span>Reference</span>
              <input name="referenceNo" />
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Checklist item</th>
                  <th>Result</th>
                  <th>Measured</th>
                  <th>Observation</th>
                  <th>Corrective action</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item) => (
                  <tr key={item.code}>
                    <td className="sticky-col">
                      <b>{item.label}</b>
                      <small className="table-sub">
                        {item.category}
                        {item.unit ? ` · ${item.unit}` : ""}
                      </small>
                    </td>
                    <td>
                      <select name={`result:${item.code}`}>
                        <option>PASS</option>
                        <option>FAIL</option>
                        <option>NOT_APPLICABLE</option>
                      </select>
                    </td>
                    <td>
                      <input
                        name={`measured:${item.code}`}
                        inputMode="decimal"
                      />
                    </td>
                    <td>
                      <input name={`observation:${item.code}`} />
                    </td>
                    <td>
                      <input name={`action:${item.code}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inspection-close">
            <label className="field">
              <span>Overall observations</span>
              <textarea name="observations" rows={3} />
            </label>
            <label className="field">
              <span>Corrective action</span>
              <textarea name="correctiveAction" rows={3} />
            </label>
            <label className="field">
              <span>Action due</span>
              <input name="correctiveActionDueDate" type="date" />
            </label>
            <label className="field">
              <span>Photos</span>
              <input type="file" accept="image/*" multiple onChange={upload} />
              <small>{photos.length} uploaded</small>
            </label>
            <div>
              <span className="field-label">Inspector signature</span>
              <canvas
                className="signature-pad"
                ref={canvas}
                width={420}
                height={120}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => (drawing.current = false)}
              />
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  canvas.current?.getContext("2d")?.clearRect(0, 0, 420, 120)
                }
              >
                Clear
              </button>
            </div>
            <button className="button" disabled={pending}>
              Save inspection
            </button>
          </div>
        </form>
      )}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date / outlet</th>
              <th>Type</th>
              <th>Inspector</th>
              <th>Organisation</th>
              <th>Result</th>
              <th>Failures</th>
              <th>Evidence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={8} message="No inspections recorded yet." hint="Close an inspection above and it will appear in this register." />}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky-col">
                  {r.date}
                  <small className="table-sub">{r.outlet}</small>
                </td>
                <td>{r.type}</td>
                <td>{r.inspectorName}</td>
                <td>{r.organisation}</td>
                <td>
                  <span
                    className={`badge ${r.result === "FAIL" ? "alert" : r.result === "PASS" ? "ok" : "warn"}`}
                  >
                    {r.result}
                  </span>
                </td>
                <td className="num">
                  {r.failed}/{r.itemCount}
                </td>
                <td>{r.photoCount} photos</td>
                <td>
                  <a
                    className="button button-secondary"
                    href={`/api/inventory/inspection-pdf?id=${r.id}`}
                  >
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
