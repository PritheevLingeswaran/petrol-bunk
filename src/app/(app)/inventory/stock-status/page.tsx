import { InventoryNav } from "@/components/inventory/nav";
import { getStockStatus } from "@/server/inventory/queries";
import { formatINR, formatLitres } from "@/lib/format";
export default async function Page() {
  const data = await getStockStatus();
  return (
    <div className="inventory-page">
      <InventoryNav />
      <div className="section-head">
        <div>
          <p className="eyebrow">LIVE BOOK STOCK</p>
          <h1>Stock status</h1>
          <p className="muted page-lede">
            Tank fill, ullage and cover from the last 30 days of sales.
          </p>
        </div>
        {data.alerts > 0 && (
          <span className="badge alert">{data.alerts} low-stock alerts</span>
        )}
      </div>
      <div className="tank-grid">
        {data.rows.map((r) => (
          <article
            className={`panel tank-card ${r.low ? "is-low" : ""}`}
            key={r.id}
          >
            <header>
              <div>
                <p className="eyebrow">
                  {r.tank} · {r.outlet}
                </p>
                <h2>{r.product}</h2>
              </div>
              <span className={`badge ${r.low ? "alert" : "ok"}`}>
                {r.low ? "Reorder" : "Normal"}
              </span>
            </header>
            <div className="tank-gauge" aria-label={`${r.fillPct}% full`}>
              <div style={{ height: `${r.fillPct}%` }} />
            </div>
            <div className="tank-readouts">
              <strong>{formatLitres(r.litres)}</strong>
              <span>of {formatLitres(r.capacity)}</span>
              <dl>
                <dt>Value</dt>
                <dd>{formatINR(r.value)}</dd>
                <dt>Days cover</dt>
                <dd>{r.daysCover}</dd>
                <dt>30-day avg</dt>
                <dd>{formatLitres(r.averageDailySale)}/day</dd>
                <dt>Ullage</dt>
                <dd>{formatLitres(r.ullage)}</dd>
                <dt>Reorder</dt>
                <dd>{formatLitres(r.reorderLevel)}</dd>
              </dl>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
