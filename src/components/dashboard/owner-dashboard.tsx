"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Download,
  Droplet,
  Minus,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatNumber } from "@/lib/format";
import type { Alert, DashboardData, Severity } from "@/server/dashboard/queries";
import { useT } from "@/i18n/provider";

/** Slate/teal ramp — never a rainbow (PROJECT_SPEC § 8). */
const SERIES = ["#18b6a4", "#3f9fd0", "#7c93ad", "#e0a232", "#5c7a92", "#9aa8b8"];
const SEVERITY_TONE: Record<Severity, string> = { CRITICAL: "alert", HIGH: "alert", MEDIUM: "warn", LOW: "" };

const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--text)", fontSize: 12 };

function Delta({ value, pct, label, tone }: { value: string; pct: string; label: string; tone: "neutral" | "loss" | "gain" }) {
  const numeric = Number(value);
  const Icon = numeric > 0 ? ArrowUpRight : numeric < 0 ? ArrowDownRight : Minus;
  return (
    <p className={`kpi-delta ${tone === "loss" ? "loss" : tone === "gain" ? "gain" : "muted"}`}>
      <Icon size={13} />
      {formatINR(Math.abs(numeric))} · {formatNumber(Math.abs(Number(pct)))} % <span className="muted">{label}</span>
    </p>
  );
}

function Sparkline({ points, tone }: { points: number[]; tone: string }) {
  if (points.length < 2) return <div className="kpi-spark" aria-hidden />;
  const data = points.map((value, index) => ({ index, value }));
  const stroke = tone === "loss" ? "var(--red)" : tone === "gain" ? "var(--green)" : "var(--teal)";
  return (
    <div className="kpi-spark" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={1.5} fill={`url(#spark-${tone})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OwnerDashboard({ data, today, canSeeMoney }: { data: DashboardData; today: string; canSeeMoney: boolean }) {
  const t = useT();
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const apply = (nextFrom: string, nextTo: string) => {
    window.location.search = `?${new URLSearchParams({ from: nextFrom, to: nextTo }).toString()}`;
  };

  const preset = (days: number) => {
    const end = new Date(`${today}T00:00:00.000Z`);
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    apply(start.toISOString().slice(0, 10), today);
  };

  const visibleAlerts = showAllAlerts ? data.alerts : data.alerts.slice(0, 8);
  const criticalCount = data.alerts.filter((alert) => alert.severity === "CRITICAL").length;

  const hasTradingData = data.glance.productMix.length > 0 || data.glance.shiftComparison.length > 0;

  return (
    <section className="space-y-4 dashboard">
      <div className="section-head no-print">
        <div>
          <p className="eyebrow">{t("dashboard.eyebrow")}</p>
          <h1>{t("dashboard.title")}</h1>
          <p className="page-lede muted">{t("dashboard.lede")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="field">
            <span>{t("common.from")}</span>
            <input type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">
            <span>{t("common.to")}</span>
            <input type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button className="button" type="button" onClick={() => apply(from, to)}>
            {t("common.apply")}
          </button>
          <a className="button button-secondary" href={`/api/reports/dsr?date=${data.range.to}`}>
            <Download size={15} /> {t("dashboard.dsr")}
          </a>
        </div>
      </div>

      <div className="preset-row no-print">
        <button type="button" className={data.range.from === today && data.range.to === today ? "active" : ""} onClick={() => apply(today, today)}>
          {t("dashboard.today")}
        </button>
        <button type="button" onClick={() => preset(7)}>{t("dashboard.days7")}</button>
        <button type="button" onClick={() => preset(30)}>{t("dashboard.days30")}</button>
        <button type="button" onClick={() => preset(90)}>{t("dashboard.days90")}</button>
        <span className="muted ml-auto text-xs">{t("dashboard.builtIn")} {data.elapsedMs} ms</span>
      </div>

      {/* ---- Row 1: KPI cards -------------------------------------------- */}
      <div className="kpi-grid">
        {data.kpis
          .filter((kpi) => canSeeMoney || kpi.unit === "L")
          .map((kpi) => (
            <Link className={`kpi ${kpi.tone === "loss" ? "is-loss" : kpi.tone === "gain" ? "is-gain" : ""}`} href={kpi.href} key={kpi.key}>
              <p className="kpi-label">{t(`kpi.${kpi.key}`, kpi.label)}</p>
              <p className="kpi-value">
                {kpi.unit === "INR" ? formatINR(kpi.value) : formatNumber(kpi.value)}
                <span className="kpi-unit">{kpi.unit === "L" ? " L" : ""}</span>
              </p>
              <Delta value={kpi.delta} pct={kpi.deltaPct} label={kpi.deltaLabel} tone={kpi.tone} />
              <Sparkline points={kpi.spark} tone={kpi.tone} />
            </Link>
          ))}
      </div>

      {/* ---- Row 2: today at a glance ------------------------------------ */}
      {hasTradingData ? (
        <div className="glance-grid">
          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.productMix")}</p>
            {data.glance.productMix.length === 0 ? (
              <EmptyPanel message={t("dashboard.noSales")} />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={data.glance.productMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2} isAnimationActive={false}>
                    {data.glance.productMix.map((slice, index) => (
                      <Cell key={slice.name} fill={SERIES[index % SERIES.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [formatINR(value), name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.paymentSplit")}</p>
            {data.glance.paymentSplit.length === 0 ? (
              <EmptyPanel message={t("dashboard.noCollections")} />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={[Object.fromEntries([["name", t("dashboard.collected")], ...data.glance.paymentSplit.map((row) => [row.mode, row.amount])])]} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} width={70} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatINR(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.glance.paymentSplit.map((row, index) => (
                    <Bar key={row.mode} dataKey={row.mode} stackId="collections" fill={SERIES[index % SERIES.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.shiftCompare")}</p>
            {data.glance.shiftComparison.length === 0 ? (
              <EmptyPanel message={t("dashboard.noShifts")} />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={data.glance.shiftComparison} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="shift" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} width={70} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatINR(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="today" name={t("dashboard.thisPeriod")} fill={SERIES[0]} />
                  <Bar dataKey="previous" name={t("dashboard.previousPeriod")} fill={SERIES[2]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      ) : (
        <div className="panel empty-state">
          <Droplet size={26} />
          <p className="empty-title">{t("dashboard.nothingYet")}</p>
          <p className="muted">{t("dashboard.nothingYetHint")}</p>
          <Link className="button" href="/pump/shift-entry">
            {t("dashboard.openShiftEntry")} <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* ---- Row 3: alerts ------------------------------------------------ */}
      <div className="panel">
        <div className="alerts-head">
          <div>
            <p className="eyebrow">{t("dashboard.alerts")}</p>
            <p className="muted text-xs">{t("dashboard.alertsHint")}</p>
          </div>
          <span className={`badge ${criticalCount > 0 ? "alert" : data.alerts.length > 0 ? "warn" : "ok"}`}>
            {data.alerts.length === 0 ? t("dashboard.allClear") : `${data.alerts.length} ${t("dashboard.open")}`}
            {criticalCount > 0 ? ` · ${criticalCount} ${t("dashboard.critical")}` : ""}
          </span>
        </div>
        {data.alerts.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">{t("dashboard.allClearTitle")}</p>
            <p className="muted">{t("dashboard.allClearHint")}</p>
          </div>
        ) : (
          <>
            <ul className="alert-list">
              {visibleAlerts.map((alert) => (
                <AlertRow alert={alert} key={alert.id} canSeeMoney={canSeeMoney} />
              ))}
            </ul>
            {data.alerts.length > 8 ? (
              <button type="button" className="alert-more no-print" onClick={() => setShowAllAlerts((current) => !current)}>
                {showAllAlerts ? t("dashboard.showFewer") : `${t("dashboard.showAll")} ${data.alerts.length}`}
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* ---- Row 4: trends ------------------------------------------------ */}
      {canSeeMoney ? (
        <div className="trend-grid">
          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.trend30")}</p>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={data.trends.daily} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} interval={4} />
                <YAxis stroke="var(--muted)" fontSize={11} width={72} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatINR(value)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="sale" name={t("dashboard.sale")} stroke={SERIES[0]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name={t("dashboard.grossProfit")} stroke={SERIES[3]} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.trend12m")}</p>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data.trends.monthly} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} />
                <YAxis stroke="var(--muted)" fontSize={11} width={72} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatINR(value)} />
                <Bar dataKey="profit" name={t("dashboard.netProfit")} fill={SERIES[0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.marginTrend")}</p>
            {data.trends.margin.length === 0 ? (
              <EmptyPanel message={t("dashboard.noMargin")} />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={data.trends.margin} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} interval={4} />
                  <YAxis stroke="var(--muted)" fontSize={11} width={58} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => `₹${formatNumber(value, 4)}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {data.trends.marginProducts.map((product, index) => (
                    <Line key={product} type="monotone" dataKey={product} stroke={SERIES[index % SERIES.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      ) : null}

      {/* ---- Row 5: league tables ---------------------------------------- */}
      <div className="league-grid">
        {canSeeMoney ? (
          <div className="panel p-3">
            <p className="eyebrow">{t("dashboard.topCustomers")}</p>
            {data.customers.length === 0 ? (
              <EmptyPanel message={t("dashboard.noOutstanding")} />
            ) : (
              <div className="overflow-auto">
                <table>
                  <thead>
                    <tr>
                      <th>{t("common.customer")}</th>
                      <th className="num">{t("common.outstanding")}</th>
                      <th className="num">{t("common.limit")}</th>
                      <th className="num">{t("common.daysOverdue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="sticky-col">
                          <Link href={`/accounts/statements?customerId=${customer.id}`}>{customer.name}</Link>
                          <span className="table-sub">{customer.code}</span>
                        </td>
                        <td className="num strong">{formatINR(customer.outstanding)}</td>
                        <td className="num">{formatINR(customer.creditLimit)}</td>
                        <td className={`num ${customer.overdueDays > 0 ? "loss" : ""}`}>{customer.overdueDays || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        <div className="panel p-3">
          <p className="eyebrow">{t("dashboard.salesmanLeague")}</p>
          {data.salesmen.length === 0 ? (
            <EmptyPanel message={t("dashboard.noSalesmen")} />
          ) : (
            <div className="overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>{t("common.salesman")}</th>
                    <th className="num">{t("common.shifts")}</th>
                    <th className="num">{t("common.litres")}</th>
                    {canSeeMoney ? <th className="num">{t("common.sale")}</th> : null}
                    <th className="num">{t("common.shortExcess")}</th>
                    {canSeeMoney ? <th className="num">{t("common.recoverable")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.salesmen.map((salesman) => (
                    <tr key={salesman.id}>
                      <td className="sticky-col">
                        {salesman.name}
                        <span className="table-sub">{salesman.code}</span>
                      </td>
                      <td className="num">{salesman.shifts}</td>
                      <td className="num">{formatNumber(salesman.litres)}</td>
                      {canSeeMoney ? <td className="num">{formatINR(salesman.amount)}</td> : null}
                      <td className={`num ${Number(salesman.shortExcess) < 0 ? "loss" : Number(salesman.shortExcess) > 0 ? "gain" : ""}`}>
                        {formatINR(salesman.shortExcess)}
                      </td>
                      {canSeeMoney ? (
                        <td className={`num ${Number(salesman.recoverable) > 0 ? "loss" : ""}`}>{formatINR(salesman.recoverable)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AlertRow({ alert, canSeeMoney }: { alert: Alert; canSeeMoney: boolean }) {
  return (
    <li>
      <Link className={`alert-row tone-${SEVERITY_TONE[alert.severity] || "low"}`} href={alert.href}>
        <AlertTriangle size={15} />
        <div className="alert-body">
          <p className="alert-title">{alert.title}</p>
          <p className="alert-detail muted">{alert.detail}</p>
        </div>
        {alert.amount && canSeeMoney ? <span className={`alert-amount num ${Number(alert.amount) < 0 ? "loss" : ""}`}>{formatINR(alert.amount)}</span> : null}
        <span className={`badge ${SEVERITY_TONE[alert.severity]}`}>{alert.severity}</span>
        <ArrowRight size={14} className="alert-go" />
      </Link>
    </li>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="empty-panel">
      <p className="muted">{message}</p>
    </div>
  );
}
