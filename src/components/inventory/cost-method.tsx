"use client";
import { useState } from "react";
import { saveCostingMethod } from "@/server/inventory/actions";
export function CostMethod({ method }: { method: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="toolbar"
      action={async (form) => {
        setPending(true);
        const r = await saveCostingMethod(Object.fromEntries(form));
        setPending(false);
        setMessage(r.ok ? "Default costing method saved." : r.error);
      }}
    >
      <label className="field">
        <span>Costing method</span>
        <select name="method" defaultValue={method} disabled={pending}>
          <option value="WEIGHTED_AVERAGE">Weighted average</option>
          <option value="FIFO">FIFO</option>
        </select>
      </label>
      <button className="button" disabled={pending}>{pending ? "Saving…" : "Save default"}</button>
      {message && <span className="muted">{message}</span>}
    </form>
  );
}
