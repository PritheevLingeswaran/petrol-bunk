import { InventoryNav } from "@/components/inventory/nav";
import { getTankStock } from "@/server/inventory/queries";
import { businessDateToday } from "@/lib/date";
import { formatINR, formatLitres } from "@/lib/format";
export default async function Page({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const to = searchParams.to ?? businessDateToday().toISOString().slice(0, 10);
  const from = searchParams.from ?? `${to.slice(0, 8)}01`;
  const rows = await getTankStock({ from, to });
  return (
    <div className="inventory-page">
      <InventoryNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">PHYSICAL VS BOOK</p>
          <h1>Tank-wise stock</h1>
          <p className="muted page-lede">
            Uses the approved Phase 3 variation engine and stored results.
          </p>
        </div>
        <form className="toolbar">
          <input name="from" type="date" defaultValue={from} />
          <input name="to" type="date" defaultValue={to} />
          <button className="button">Apply</button>
        </form>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date / tank</th>
              <th>Product</th>
              <th className="num">Opening</th>
              <th className="num">Receipts</th>
              <th className="num">Sales</th>
              <th className="num">Book</th>
              <th className="num">Physical</th>
              <th className="num">Variation</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky-col">
                  {r.date}
                  <small className="table-sub">
                    {r.tank} · {r.outlet}
                  </small>
                </td>
                <td>{r.product}</td>
                {[r.opening, r.receipts, r.sales, r.book, r.physical].map(
                  (v, i) => (
                    <td className="num" key={i}>
                      {formatLitres(v)}
                    </td>
                  ),
                )}
                <td
                  className={`num ${r.variation.startsWith("-") ? "loss" : "gain"}`}
                >
                  {formatLitres(r.variation)}
                </td>
                <td
                  className={`num ${r.variationValue.startsWith("-") ? "loss" : "gain"}`}
                >
                  {formatINR(r.variationValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
