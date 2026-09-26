"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatNumber } from "@/lib/format";
import { computeAndSaveVariation } from "@/server/pump/actions";
import type { DateRange, DensityRegisterRow, PumpOptions, TankerLossRow, TankerLossSummary, VariationMonth, VariationRow } from "@/server/pump/queries";
import { Field, Litres, Messages, Money, PageHead, Pct, Stat } from "@/components/pump/ui";

function RangeBar({ range, today }: { range: DateRange; today: string }) {
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  return (
    <div className="panel p-3 no-print">
      <div className="toolbar">
        <Field label="From">
          <input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <button className="button" type="button" onClick={() => (window.location.search = `?from=${from}&to=${to}`)}>
          Apply
        </button>
        <button className="button button-secondary" type="button" onClick={() => window.print()}>
          Print
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock variation register — the report that reveals fuel theft
// ---------------------------------------------------------------------------

export function VariationRegister({
  rows,
  months,
  totals,
  range,
  today,
  options,
}: {
  rows: VariationRow[];
  months: VariationMonth[];
  totals: { sales: string; variationLitres: string; excessLossLitres: string; variationValue: string; breaches: number };
  range: DateRange;
  today: string;
  options: PumpOptions;
}) {
  const [tankId, setTankId] = useState(options.tanks[0]?.value ?? "");
  const [businessDate, setBusinessDate] = useState(today);
  const [ownUse, setOwnUse] = useState("0");
  const [returns, setReturns] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const recompute = async () => {
    setPending(true);
    setError("");
    setInfo("");
    const result = await computeAndSaveVariation({ businessDate, tankId, ownUseLitres: ownUse || "0", returnsLitres: returns || "0" });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo(`Variation ${result.variationLitres} L — ${result.withinAllowance ? "within the permitted allowance" : "beyond the permitted allowance"}.`);
    window.location.reload();
  };

  const trend = months.map((month) => ({
    month: month.month,
    variation: Number(month.variationLitres),
    excess: Number(month.excessLossLitres),
    pct: Number(month.variationPct),
  }));

  return (
    <section className="space-y-4">
      <PageHead eyebrow="INVENTORY" title="Stock variation register" description="Book stock against physical dip, valued at purchase cost." />
      <RangeBar range={range} today={today} />

      <div className="stat-grid">
        <Stat label="Sales in period" value={`${formatNumber(totals.sales)} L`} />
        <Stat label="Net variation" value={`${formatNumber(totals.variationLitres)} L`} tone={Number(totals.variationLitres) < 0 ? "loss" : "neutral"} />
        <Stat label="Excess loss" value={`${formatNumber(totals.excessLossLitres)} L`} tone={Number(totals.excessLossLitres) > 0 ? "loss" : "neutral"} sub="Beyond the permitted allowance" />
        <Stat label="Value at cost" value={formatINR(totals.variationValue)} tone={Number(totals.variationValue) < 0 ? "loss" : "neutral"} />
        <Stat label="Days out of limit" value={String(totals.breaches)} tone={totals.breaches > 0 ? "loss" : "gain"} />
      </div>

      <div className="panel space-y-3 p-3 no-print">
        <h2>Compute a day&rsquo;s variation</h2>
        <div className="toolbar">
          <Field label="Date">
            <input type="date" value={businessDate} max={today} onChange={(event) => setBusinessDate(event.target.value)} />
          </Field>
          <Field label="Tank">
            <select value={tankId} onChange={(event) => setTankId(event.target.value)}>
              {options.tanks.map((tank) => (
                <option key={tank.value} value={tank.value}>
                  {tank.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Own use L" hint="Unmetered issues only">
            <input type="number" step="0.01" className="num" value={ownUse} onChange={(event) => setOwnUse(event.target.value)} />
          </Field>
          <Field label="Returns L">
            <input type="number" step="0.01" className="num" value={returns} onChange={(event) => setReturns(event.target.value)} />
          </Field>
          <button className="button" type="button" onClick={recompute} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />} Reconcile
          </button>
        </div>
        <Messages error={error} info={info || undefined} />
      </div>

      {trend.length > 0 ? (
        <div className="panel p-3">
          <p className="eyebrow">MONTHLY TREND</p>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={trend} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1d2d42" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#7b8ca4" fontSize={11} />
              <YAxis stroke="#7b8ca4" fontSize={11} width={62} />
              <Tooltip contentStyle={{ background: "#101b2b", border: "1px solid #26364d", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="variation" name="Variation L" stroke="#18b6a4" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="excess" name="Excess loss L" stroke="#e5484d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {months.length > 0 ? (
        <div className="panel p-3">
          <p className="eyebrow">MONTHLY ROLL-UP</p>
          <div className="overflow-auto">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Sales L</th>
                  <th className="num">Variation L</th>
                  <th className="num">Variation %</th>
                  <th className="num">Excess loss L</th>
                  <th className="num">Value ₹</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month}>
                    <td className="sticky-col font-medium">{month.month}</td>
                    <td className="num"><Litres value={month.sales} /></td>
                    <td className="num"><Litres value={month.variationLitres} /></td>
                    <td className="num"><Pct value={month.variationPct} /></td>
                    <td className="num"><Litres value={month.excessLossLitres} /></td>
                    <td className="num"><Money value={month.variationValue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel p-3">
        <p className="eyebrow">DAILY REGISTER</p>
        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tank</th>
                <th>Product</th>
                <th className="num">Opening</th>
                <th className="num">Receipts</th>
                <th className="num">Sales</th>
                <th className="num">Book</th>
                <th className="num">Physical</th>
                <th className="num">Variation</th>
                <th className="num">Variation %</th>
                <th className="num">Permissible</th>
                <th className="num">Excess</th>
                <th className="num">Value ₹</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="sticky-col font-medium">{row.date}</td>
                  <td>{row.tank}</td>
                  <td>{row.product}</td>
                  <td className="num"><Litres value={row.openingStock} /></td>
                  <td className="num"><Litres value={row.receipts} /></td>
                  <td className="num"><Litres value={row.sales} /></td>
                  <td className="num"><Litres value={row.bookStock} /></td>
                  <td className="num"><Litres value={row.dipStock} /></td>
                  <td className="num font-semibold"><Litres value={row.variationLitres} /></td>
                  <td className="num"><Pct value={row.variationPct} /></td>
                  <td className="num"><Litres value={row.allowedLitres} /></td>
                  <td className="num"><Litres value={row.excessLossLitres} /></td>
                  <td className="num"><Money value={row.variationValue} /></td>
                  <td>{row.withinAllowance ? <span className="badge ok">In limit</span> : <span className="badge alert">Excess</span>}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-10 text-center text-slate-500">
                    No variation has been reconciled in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="totals-row">
                  <td className="sticky-col">Total</td>
                  <td colSpan={4} />
                  <td className="num"><Litres value={totals.sales} /></td>
                  <td colSpan={2} />
                  <td className="num"><Litres value={totals.variationLitres} /></td>
                  <td />
                  <td />
                  <td className="num"><Litres value={totals.excessLossLitres} /></td>
                  <td className="num"><Money value={totals.variationValue} /></td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Density register
// ---------------------------------------------------------------------------

export function DensityRegister({ rows, toleranceKgM3, breaches, range, today }: { rows: DensityRegisterRow[]; toleranceKgM3: string; breaches: number; range: DateRange; today: string }) {
  return (
    <section className="space-y-4">
      <PageHead eyebrow="QUALITY" title="Density register" description={`Receipt density against invoice density, band ±${toleranceKgM3} kg/m³ at 15 °C.`} />
      <RangeBar range={range} today={today} />

      <div className="stat-grid">
        <Stat label="Readings" value={String(rows.length)} />
        <Stat label="Out of band" value={String(breaches)} tone={breaches > 0 ? "loss" : "gain"} sub="Investigate supply quality" />
        <Stat label="Tolerance" value={`± ${toleranceKgM3}`} sub="kg/m³, configurable" />
      </div>

      <div className="panel p-3">
        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tank</th>
                <th>Product</th>
                <th className="num">Observed</th>
                <th className="num">Temp °C</th>
                <th className="num">At 15 °C</th>
                <th className="num">Invoice</th>
                <th className="num">Deviation</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.date}-${row.tank}-${index}`}>
                  <td className="sticky-col font-medium">{row.date}</td>
                  <td>{row.tank}</td>
                  <td>{row.product}</td>
                  <td className="num">{formatNumber(row.observedDensity, 1)}</td>
                  <td className="num">{formatNumber(row.temperatureC, 1)}</td>
                  <td className="num font-semibold">{formatNumber(row.densityAt15C, 1)}</td>
                  <td className="num">{row.invoiceDensity ? formatNumber(row.invoiceDensity, 1) : "—"}</td>
                  <td className={`num ${row.withinTolerance ? "" : "loss"}`}>{row.deviation ? formatNumber(row.deviation, 1) : "—"}</td>
                  <td>{row.withinTolerance ? <span className="badge ok">In band</span> : <span className="badge alert">Out of band</span>}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No density readings in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tanker-wise receipt loss
// ---------------------------------------------------------------------------

export function TankerLossReport({
  rows,
  byVehicle,
  byTransporter,
  byDriver,
  totals,
  range,
  today,
}: {
  rows: TankerLossRow[];
  byVehicle: TankerLossSummary[];
  byTransporter: TankerLossSummary[];
  byDriver: TankerLossSummary[];
  totals: { invoiceQty: string; transitLoss: string; lossPct: string; lossValue: string; excessTrips: number };
  range: DateRange;
  today: string;
}) {
  const chart = byVehicle.slice(0, 12).map((row) => ({ name: row.key, loss: Number(row.transitLoss), pct: Number(row.lossPct) }));

  return (
    <section className="space-y-4">
      <PageHead eyebrow="PURCHASES" title="Tanker-wise receipt loss" description="Loss by tanker, driver and transporter — a pattern here is not evaporation." />
      <RangeBar range={range} today={today} />

      <div className="stat-grid">
        <Stat label="Invoiced" value={`${formatNumber(totals.invoiceQty)} L`} />
        <Stat label="Receipt loss" value={`${formatNumber(totals.transitLoss)} L`} tone={Number(totals.transitLoss) > 0 ? "loss" : "neutral"} />
        <Stat label="Loss %" value={`${formatNumber(totals.lossPct, 4)} %`} tone={Number(totals.lossPct) > 0 ? "loss" : "neutral"} />
        <Stat label="Value at cost" value={formatINR(totals.lossValue)} tone={Number(totals.lossValue) > 0 ? "loss" : "neutral"} />
        <Stat label="Trips over limit" value={String(totals.excessTrips)} tone={totals.excessTrips > 0 ? "loss" : "gain"} />
      </div>

      {chart.length > 0 ? (
        <div className="panel p-3">
          <p className="eyebrow">LOSS BY TANKER</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={chart} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1d2d42" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#7b8ca4" fontSize={10} />
              <YAxis stroke="#7b8ca4" fontSize={11} width={58} />
              <Tooltip contentStyle={{ background: "#101b2b", border: "1px solid #26364d", fontSize: 12 }} />
              <Bar dataKey="loss" name="Loss L" fill="#18b6a4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {(
          [
            ["By tanker", byVehicle],
            ["By transporter", byTransporter],
            ["By driver", byDriver],
          ] as const
        ).map(([title, summary]) => (
          <div className="panel p-3" key={title}>
            <p className="eyebrow">{title.toUpperCase()}</p>
            <div className="overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>{title.replace("By ", "")}</th>
                    <th className="num">Trips</th>
                    <th className="num">Loss L</th>
                    <th className="num">Loss %</th>
                    <th className="num">Over</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.key}>
                      <td className="sticky-col font-medium">{row.key}</td>
                      <td className="num">{row.trips}</td>
                      <td className="num"><Litres value={row.transitLoss} /></td>
                      <td className="num"><Pct value={row.lossPct} /></td>
                      <td className={`num ${row.excessTrips > 0 ? "loss" : ""}`}>{row.excessTrips}</td>
                    </tr>
                  ))}
                  {summary.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No receipts in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <div className="panel p-3">
        <p className="eyebrow">EVERY RECEIPT</p>
        <div className="overflow-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th>Tanker</th>
                <th>Driver</th>
                <th>Transporter</th>
                <th>Product</th>
                <th>Tank</th>
                <th className="num">Invoice L</th>
                <th className="num">Received L</th>
                <th className="num">Loss L</th>
                <th className="num">Loss %</th>
                <th className="num">Allowed L</th>
                <th className="num">Excess L</th>
                <th className="num">Value ₹</th>
                <th className="num">Density dev</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.invoiceNo}-${index}`}>
                  <td className="sticky-col font-medium">{row.date}</td>
                  <td>{row.invoiceNo}</td>
                  <td>{row.vehicleNo}</td>
                  <td>{row.driverName || "—"}</td>
                  <td>{row.transporterName || "—"}</td>
                  <td>{row.product}</td>
                  <td>{row.tank}</td>
                  <td className="num"><Litres value={row.invoiceQty} /></td>
                  <td className="num"><Litres value={row.receivedQty} /></td>
                  <td className="num font-semibold"><Litres value={row.transitLoss} /></td>
                  <td className="num"><Pct value={row.lossPct} /></td>
                  <td className="num"><Litres value={row.allowedLoss} /></td>
                  <td className="num"><Litres value={row.excessLoss} /></td>
                  <td className="num"><Money value={row.lossValue} /></td>
                  <td className={`num ${row.densityDeviation && Math.abs(Number(row.densityDeviation)) > 3 ? "loss" : ""}`}>{row.densityDeviation || "—"}</td>
                  <td>{row.withinAllowance ? <span className="badge ok">In limit</span> : <span className="badge alert">Excess</span>}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-10 text-center text-slate-500">
                    No tanker receipts in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="totals-row">
                  <td className="sticky-col">Total</td>
                  <td colSpan={6} />
                  <td className="num"><Litres value={totals.invoiceQty} /></td>
                  <td />
                  <td className="num"><Litres value={totals.transitLoss} /></td>
                  <td className="num"><Pct value={totals.lossPct} /></td>
                  <td colSpan={2} />
                  <td className="num"><Money value={totals.lossValue} /></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}
