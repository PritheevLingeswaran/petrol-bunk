"use client";
import { EmptyRow } from "@/components/shell/empty-row";
import { useState, useTransition } from "react";
import { postBatchMovement, saveBatch } from "@/server/inventory/actions";
import { formatINR } from "@/lib/format";
type Row = {
  id: string;
  productId: string;
  product: string;
  batchNo: string;
  mrp: string;
  purchaseRate: string;
  manufacturedOn: string;
  expiryDate: string;
  barcode: string;
  quantity: string;
  quantityDisplay: string;
  value: string;
  expired: boolean;
  expiringSoon: boolean;
  outlet: string;
};
export function BatchManager({
  rows,
  products,
  today,
  editable,
}: {
  rows: Row[];
  products: { id: string; name: string; code: string; isFuel: boolean }[];
  today: string;
  editable: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  async function submit(form: FormData) {
    const r = await saveBatch(Object.fromEntries(form));
    setMessage(r.ok ? "Batch saved." : r.error);
  }
  async function move(form: FormData) {
    const r = await postBatchMovement(Object.fromEntries(form));
    setMessage(r.ok ? "Stock movement posted." : r.error);
  }
  return (
    <div className="inventory-page">
      {message && <div className="info-bar">{message}</div>}
      {editable && (
        <div className="inventory-split">
          <form action={submit} className="panel compact-form">
            <h2>Add or update batch</h2>
            <label className="field">
              <span>Product</span>
              <select name="productId" required>
                {products
                  .filter((p) => !p.isFuel)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Batch</span>
              <input name="batchNo" required />
            </label>
            <label className="field">
              <span>MRP</span>
              <input name="mrp" inputMode="decimal" />
            </label>
            <label className="field">
              <span>Purchase rate</span>
              <input name="purchaseRate" inputMode="decimal" required />
            </label>
            <label className="field">
              <span>Manufactured</span>
              <input name="manufacturedOn" type="date" />
            </label>
            <label className="field">
              <span>Expiry</span>
              <input name="expiryDate" type="date" />
            </label>
            <label className="field">
              <span>Barcode</span>
              <input name="barcode" />
            </label>
            <button className="button" disabled={pending}>
              Save batch
            </button>
          </form>
          <form action={move} className="panel compact-form">
            <h2>Post batch movement</h2>
            <label className="field">
              <span>Batch</span>
              <select name="batchId" required>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.product} · {r.batchNo} · {r.quantity}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input
                name="businessDate"
                type="date"
                defaultValue={today}
                required
              />
            </label>
            <label className="field">
              <span>Direction</span>
              <select name="direction">
                <option value="IN">Inward</option>
                <option value="OUT">Outward</option>
              </select>
            </label>
            <label className="field">
              <span>Quantity</span>
              <input name="quantity" inputMode="decimal" required />
            </label>
            <label className="field wide">
              <span>Reason</span>
              <input name="remarks" required />
            </label>
            <button className="button" disabled={pending}>
              Post movement
            </button>
          </form>
        </div>
      )}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product / batch</th>
              <th>MRP</th>
              <th>Cost</th>
              <th>Expiry</th>
              <th className="num">Available</th>
              <th className="num">Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7} message="No batches recorded yet." hint="Batches appear here once a purchase with an MRP and expiry is posted." />}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky-col">
                  {r.product}
                  <small className="table-sub">
                    {r.batchNo} · {r.outlet}
                  </small>
                </td>
                <td className="num">{r.mrp ? formatINR(r.mrp) : "—"}</td>
                <td className="num">{formatINR(r.purchaseRate, 4)}</td>
                <td>{r.expiryDate || "—"}</td>
                <td className="num">{r.quantityDisplay}</td>
                <td className="num">{formatINR(r.value)}</td>
                <td>
                  <span
                    className={`badge ${r.expired ? "alert" : r.expiringSoon ? "warn" : "ok"}`}
                  >
                    {r.expired
                      ? "Expired"
                      : r.expiringSoon
                        ? "Expiring"
                        : "Usable"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
