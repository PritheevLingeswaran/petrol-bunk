"use client";

import { useCallback, useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { formatINR, formatNumber } from "@/lib/format";

// ---------------------------------------------------------------------------
// Numbers — right-aligned, tabular, Indian grouping, red only for losses
// ---------------------------------------------------------------------------

export const Money = ({ value, dp = 2, signed = false }: { value: string | number; dp?: number; signed?: boolean }) => {
  const numeric = Number(value);
  const negative = numeric < 0;
  return (
    <span className={`num ${negative ? "loss" : signed && numeric > 0 ? "gain" : ""}`}>
      {formatINR(Number.isFinite(numeric) ? numeric : 0, dp)}
    </span>
  );
};

export const Litres = ({ value, dp = 2, signed = false }: { value: string | number; dp?: number; signed?: boolean }) => {
  const numeric = Number(value);
  return (
    <span className={`num ${numeric < 0 ? "loss" : signed && numeric > 0 ? "gain" : ""}`}>
      {formatNumber(Number.isFinite(numeric) ? numeric : 0, dp)}
    </span>
  );
};

export const Pct = ({ value, dp = 4 }: { value: string | number; dp?: number }) => {
  const numeric = Number(value);
  return <span className={`num ${numeric < 0 ? "loss" : ""}`}>{formatNumber(Number.isFinite(numeric) ? numeric : 0, dp)} %</span>;
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

// ---------------------------------------------------------------------------
// Keyboard flow: Tab follows the physical order of work, Enter advances,
// Ctrl+S saves from anywhere in the form.
// ---------------------------------------------------------------------------

export function useKeyboardFlow(onSave: () => void) {
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave]);

  /** Enter moves to the next control in DOM order; on the last one it submits. */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
      event.preventDefault();
      const form = formRef.current;
      if (!form) return;
      const fields = Array.from(form.querySelectorAll<HTMLElement>("input, select, textarea")).filter(
        (element) => !(element as HTMLInputElement).disabled && (element as HTMLInputElement).type !== "hidden" && element.tabIndex !== -1,
      );
      const index = fields.indexOf(target);
      if (index >= 0 && index < fields.length - 1) fields[index + 1].focus();
      else onSave();
    },
    [onSave],
  );

  return { formRef, onKeyDown };
}

export function KeyboardForm({ onSave, children, className }: { onSave: () => void; children: ReactNode; className?: string }) {
  const { formRef, onKeyDown } = useKeyboardFlow(onSave);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };
  return (
    <form ref={formRef} className={className} onKeyDown={onKeyDown} onSubmit={submit}>
      {children}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Message bars
// ---------------------------------------------------------------------------

export function Messages({ error, warnings, info }: { error?: string; warnings?: string[]; info?: string }) {
  if (!error && !warnings?.length && !info) return null;
  return (
    <div className="space-y-2">
      {error ? <p className="alert-bar" role="alert">{error}</p> : null}
      {warnings?.map((warning) => (
        <p className="warn-bar" key={warning}>
          {warning}
        </p>
      ))}
      {info ? <p className="info-bar">{info}</p> : null}
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

export function PageHead({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return (
    <div className="section-head no-print">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
