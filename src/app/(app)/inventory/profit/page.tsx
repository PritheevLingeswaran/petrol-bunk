import { InventoryNav } from "@/components/inventory/nav";
import { ProfitChart } from "@/components/inventory/profit-chart";
import { CostMethod } from "@/components/inventory/cost-method";
import { getProductProfit } from "@/server/inventory/queries";
import { businessDateToday } from "@/lib/date";
import { formatINR, formatLitres } from "@/lib/format";
export default async function Page({
  searchParams,
}: {
  searchParams: {
    from?: string;
    to?: string;
    method?: "WEIGHTED_AVERAGE" | "FIFO";
  };
}) {
  const to = searchParams.to ?? businessDateToday().toISOString().slice(0, 10);
  const from = searchParams.from ?? `${to.slice(0, 8)}01`;
  const data = await getProductProfit({
    from,
    to,
    method: searchParams.method,
  });
  return (
    <div className="inventory-page">
      <InventoryNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">MARGIN, NOT TURNOVER</p>
          <h1>Product-wise profit / loss</h1>
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
            <span>Method</span>
            <select name="method" defaultValue={data.method}>
              <option value="WEIGHTED_AVERAGE">Weighted average</option>
              <option value="FIFO">FIFO</option>
            </select>
          </label>
          <button className="button">Apply</button>
        </form>
      </div>
      <CostMethod method={data.method} />
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Sale qty</th>
              <th className="num">Sale value</th>
              <th className="num">COGS</th>
              <th className="num">Gross profit</th>
              <th className="num">Margin / unit</th>
              <th className="num">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.productId}>
                <td className="sticky-col">
                  {r.product}
                  {r.fifoWarning && (
                    <small className="table-sub loss">
                      FIFO opening layer unavailable; weighted cost shown
                    </small>
                  )}
                </td>
                <td className="num">{formatLitres(r.quantity)}</td>
                <td className="num">{formatINR(r.saleValue)}</td>
                <td className="num">{formatINR(r.cogs)}</td>
                <td
                  className={`num strong ${r.grossProfit.startsWith("-") ? "loss" : "gain"}`}
                >
                  {formatINR(r.grossProfit)}
                </td>
                <td className="num">{formatINR(r.marginPerLitre, 4)}</td>
                <td className="num">{r.marginPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProfitChart rows={data.chart} />
    </div>
  );
}
