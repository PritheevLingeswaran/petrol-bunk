import { InventoryNav } from "@/components/inventory/nav";
import {
  getInventoryOptions,
  getStockLedger,
} from "@/server/inventory/queries";
import { businessDateToday } from "@/lib/date";
import { formatINR, formatLitres } from "@/lib/format";
export default async function Page({
  searchParams,
}: {
  searchParams: {
    from?: string;
    to?: string;
    productId?: string;
    tankId?: string;
  };
}) {
  const to = searchParams.to ?? businessDateToday().toISOString().slice(0, 10);
  const from = searchParams.from ?? `${to.slice(0, 8)}01`;
  const [report, options] = await Promise.all([
    getStockLedger({
      from,
      to,
      productId: searchParams.productId,
      tankId: searchParams.tankId,
    }),
    getInventoryOptions(),
  ]);
  return (
    <div className="inventory-page">
      <InventoryNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">EVERY LITRE, IN ORDER</p>
          <h1>Stock ledger</h1>
        </div>
        <form className="toolbar">
          <label className="field">
            <span>From</span>
            <input name="from" type="date" defaultValue={from} />
          </label>
          <label className="field">
            <span>To</span>
            <input name="to" type="date" defaultValue={to} />
          </label>
          <label className="field">
            <span>Product</span>
            <select
              name="productId"
              defaultValue={searchParams.productId ?? ""}
            >
              <option value="">All</option>
              {options.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tank</span>
            <select name="tankId" defaultValue={searchParams.tankId ?? ""}>
              <option value="">All</option>
              {options.tanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="button">Apply</button>
        </form>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <p className="label">Closing quantity</p>
          <p className="value">{formatLitres(report.closingQuantity)}</p>
        </div>
        <div className="stat">
          <p className="label">Closing value</p>
          <p className="value">{formatINR(report.closingValue)}</p>
        </div>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date / product</th>
              <th>Tank / batch</th>
              <th>Movement</th>
              <th className="num">Inward</th>
              <th className="num">Outward</th>
              <th className="num">Rate</th>
              <th className="num">Value</th>
              <th className="num">Running litres</th>
              <th className="num">Running value</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky-col">
                  {r.date}
                  <small className="table-sub">
                    {r.product} · {r.outlet}
                  </small>
                </td>
                <td>
                  {r.tank}
                  <small className="table-sub">{r.batch}</small>
                </td>
                <td>{r.type}</td>
                <td className="num">{formatLitres(r.inward)}</td>
                <td className="num">{formatLitres(r.outward)}</td>
                <td className="num">{formatINR(r.rate, 4)}</td>
                <td className={`num ${r.value.startsWith("-") ? "loss" : ""}`}>
                  {formatINR(r.value)}
                </td>
                <td className="num strong">{formatLitres(r.balanceQty)}</td>
                <td className="num strong">{formatINR(r.balanceValue)}</td>
                <td>
                  {r.sourceType}
                  <small className="table-sub">{r.remarks}</small>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={7}>Closing balance</td>
              <td className="num">{formatLitres(report.closingQuantity)}</td>
              <td className="num">{formatINR(report.closingValue)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
