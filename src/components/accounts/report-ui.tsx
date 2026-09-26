"use client";

import { useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { formatINR, formatNumber } from "@/lib/format";

export type ExportParams = Record<string, string | number | undefined>;

/** Money, right-aligned and tabular. Red is reserved for losses. */
export const Money = ({ value, dp = 2, blankZero = false }: { value: string | number; dp?: number; blankZero?: boolean }) => {
  const numeric = Number(value ?? 0);
  if (blankZero && numeric === 0) return <span className="num muted">—</span>;
  return <span className={`num ${numeric < 0 ? "loss" : ""}`}>{formatINR(Number.isFinite(numeric) ? numeric : 0, dp)}</span>;
};

export const Qty = ({ value, dp = 2, blankZero = false }: { value: string | number; dp?: number; blankZero?: boolean }) => {
  const numeric = Number(value ?? 0);
  if (blankZero && numeric === 0) return <span className="num muted">—</span>;
  return <span className={`num ${numeric < 0 ? "loss" : ""}`}>{formatNumber(Number.isFinite(numeric) ? numeric : 0, dp)}</span>;
};

export function Stat({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "neutral" | "loss" | "gain" }) {
  return (
    <div className={`stat ${tone === "loss" ? "is-loss" : tone === "gain" ? "is-gain" : ""}`}>
      <p className="label">{label}</p>
      <p className="value">{value}</p>
      {sub ? <p className="sub">{sub}</p> : null}
    </div>
  );
}

/** Excel, PDF and print, on every report. */
export function ExportBar({ report, params }: { report: string; params: ExportParams }) {
  const query = (format: "excel" | "pdf") => {
    const search = new URLSearchParams({ report, format });
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    return `/api/accounts/export?${search.toString()}`;
  };
  return (
    <div className="flex flex-wrap gap-2 no-print">
      <a className="button button-secondary" href={query("excel")}>
        <FileSpreadsheet size={15} /> Excel
      </a>
      <a className="button button-secondary" href={query("pdf")}>
        <Download size={15} /> PDF
      </a>
      <button className="button button-secondary" type="button" onClick={() => window.print()}>
        <Printer size={15} /> Print
      </button>
    </div>
  );
}

export function PageHead({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="section-head no-print">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap items-end gap-2">{children}</div> : null}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/** A date-range toolbar that reloads the page with the chosen window. */
export function RangeBar({ from, to, today, extra }: { from: string; to: string; today: string; extra?: Record<string, string> }) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const apply = () => {
    const search = new URLSearchParams({ from: start, to: end, ...(extra ?? {}) });
    window.location.search = `?${search.toString()}`;
  };
  return (
    <>
      <Field label="From">
        <input type="date" value={start} max={today} onChange={(event) => setStart(event.target.value)} />
      </Field>
      <Field label="To">
        <input type="date" value={end} max={today} onChange={(event) => setEnd(event.target.value)} />
      </Field>
      <button className="button" type="button" onClick={apply}>
        Apply
      </button>
    </>
  );
}

export function AsOnBar({ asOn, today, extra }: { asOn: string; today: string; extra?: Record<string, string> }) {
  const [date, setDate] = useState(asOn);
  return (
    <>
      <Field label="As on">
        <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <button className="button" type="button" onClick={() => (window.location.search = `?${new URLSearchParams({ asOn: date, ...(extra ?? {}) }).toString()}`)}>
        Apply
      </button>
    </>
  );
}

/**
 * The banner the trial balance shows when it does not balance. Loud on
 * purpose: a ledger that is out is the single most important thing on screen.
 */
export function BalanceBanner({ isBalanced, difference, what = "trial balance" }: { isBalanced: boolean; difference: string; what?: string }) {
  if (isBalanced) {
    return (
      <p className="info-bar">
        Debits equal credits. The {what} is in balance.
      </p>
    );
  }
  return (
    <p className="alert-bar" role="alert">
      <strong>THE {what.toUpperCase()} DOES NOT BALANCE.</strong> Out by {formatINR(difference)}. Do not file or publish these figures until this is resolved.
    </p>
  );
}

/** Wraps a table so it scrolls on its own and the totals row stays put. */
export function ReportTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`report-scroll overflow-auto ${className}`}>{children}</div>;
}
