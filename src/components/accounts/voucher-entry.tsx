"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Loader2, Paperclip, Plus, Save, Trash2, X } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatINR } from "@/lib/format";
import { cancelVoucher, saveVoucher } from "@/server/accounts/actions";
import { INSTRUMENT_TYPES, VOUCHER_TYPES } from "@/server/accounts/schemas";
import type { AccountOption, DateRange, Option, VoucherRow } from "@/server/accounts/queries";
import { ExportBar, Field, Money, PageHead, RangeBar, ReportTable } from "@/components/accounts/report-ui";

type Line = { accountId: string; debit: string; credit: string; narration: string };
type Attachment = { fileName: string; url: string; contentType?: string; sizeBytes?: number };

const blankLine = (): Line => ({ accountId: "", debit: "", credit: "", narration: "" });

/** Which side a voucher type naturally starts on, so the first row is right. */
const TYPE_HINT: Record<string, string> = {
  RECEIPT: "Debit the cash or bank you received into, credit the party.",
  PAYMENT: "Debit the party or expense, credit the cash or bank you paid from.",
  CONTRA: "Cash to bank or bank to cash. Both sides are your own accounts.",
  JOURNAL: "Any adjustment that moves no cash.",
  SALES: "Debit the customer or cash, credit the sales ledger.",
  PURCHASE: "Debit stock or expense, credit the supplier.",
  CREDIT_NOTE: "Reduces what a customer owes you.",
  DEBIT_NOTE: "Reduces what you owe a supplier.",
};

export function VoucherScreen({
  rows,
  total,
  accounts,
  range,
  today,
  activeType,
}: {
  rows: VoucherRow[];
  total: string;
  accounts: AccountOption[];
  range: DateRange;
  today: string;
  activeType: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const cancel = async (voucher: VoucherRow) => {
    const reason = window.prompt(`Cancel ${voucher.docNumber}? This posts a reversing entry — nothing is deleted.\n\nReason:`);
    if (!reason) return;
    setBusy(voucher.id);
    setError("");
    const result = await cancelVoucher({ id: voucher.id, reason });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${voucher.docNumber} reversed by ${result.reversalDocNumber}.`);
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Vouchers" description="Receipt, payment, journal, contra, sales, purchase and notes.">
        <ExportBar report="vouchers" params={{ from: range.from, to: range.to, type: activeType }} />
        <button className="button" type="button" onClick={() => setShowForm((current) => !current)}>
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? "Close" : "New voucher"}
        </button>
      </PageHead>

      {error ? <p className="alert-bar">{error}</p> : null}
      {message ? <p className="info-bar">{message}</p> : null}

      {showForm ? <VoucherForm accounts={accounts} today={today} onSaved={() => window.location.reload()} /> : null}

      <div className="panel space-y-3 p-3">
        <div className="toolbar">
          <RangeBar from={range.from} to={range.to} today={today} extra={{ type: activeType }} />
          <Field label="Type">
            <select
              value={activeType}
              onChange={(event) => (window.location.search = `?${new URLSearchParams({ from: range.from, to: range.to, type: event.target.value }).toString()}`)}
            >
              <option value="ALL">All types</option>
              {VOUCHER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Type</th>
                <th>Party</th>
                <th>Instrument</th>
                <th>Narration</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th className="text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((voucher) => (
                <tr key={voucher.id} className={voucher.status === "CANCELLED" ? "opacity-50" : ""}>
                  <td className="sticky-col">{voucher.date}</td>
                  <td className="font-medium">{voucher.docNumber}</td>
                  <td>{voucher.type.replaceAll("_", " ")}</td>
                  <td>{voucher.party || "—"}</td>
                  <td>{voucher.instrument}</td>
                  <td>
                    {voucher.narration}
                    {voucher.attachments > 0 ? (
                      <span className="badge ml-2">
                        <Paperclip size={10} className="inline" /> {voucher.attachments}
                      </span>
                    ) : null}
                  </td>
                  <td className="num">
                    <Money value={voucher.amount} />
                  </td>
                  <td>
                    <span className={`badge ${voucher.status === "CANCELLED" ? "alert" : "ok"}`}>{voucher.status}</span>
                  </td>
                  <td className="no-print">
                    <div className="flex justify-end">
                      <button className="icon-button" aria-label="Cancel voucher" disabled={busy === voucher.id || voucher.status === "CANCELLED"} onClick={() => cancel(voucher)}>
                        {busy === voucher.id ? <Loader2 className="animate-spin" size={15} /> : <Ban size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No vouchers in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                <td colSpan={5}>{rows.length} voucher(s)</td>
                <td className="num">
                  <Money value={total} />
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>
    </section>
  );
}

function VoucherForm({ accounts, today, onSaved }: { accounts: AccountOption[]; today: string; onSaved: () => void }) {
  const [type, setType] = useState<string>("RECEIPT");
  const [businessDate, setBusinessDate] = useState(today);
  const [narration, setNarration] = useState("");
  const [partyAccountId, setPartyAccountId] = useState("");
  const [instrumentType, setInstrumentType] = useState("CASH");
  const [instrumentNo, setInstrumentNo] = useState("");
  const [instrumentDate, setInstrumentDate] = useState("");
  const [bankName, setBankName] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    let debit = new Decimal(0);
    let credit = new Decimal(0);
    for (const line of lines) {
      debit = debit.plus(new Decimal(line.debit || "0"));
      credit = credit.plus(new Decimal(line.credit || "0"));
    }
    return { debit, credit, difference: debit.minus(credit) };
  }, [lines]);

  const balanced = totals.difference.isZero() && totals.debit.gt(0);

  const patch = (index: number, changes: Partial<Line>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...changes } : line)));

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const result = (await response.json()) as { url?: string; error?: string };
    if (result.url) setAttachments((current) => [...current, { fileName: file.name, url: result.url!, contentType: file.type, sizeBytes: file.size }]);
    else setError(result.error ?? "Upload failed");
  };

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    const result = await saveVoucher({
      type,
      businessDate,
      narration: narration || undefined,
      partyAccountId: partyAccountId || undefined,
      instrumentType,
      instrumentNo: instrumentNo || undefined,
      instrumentDate: instrumentDate || undefined,
      bankName: bankName || undefined,
      attachments,
      lines: lines
        .filter((line) => line.accountId && (Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0))
        .map((line) => ({ accountId: line.accountId, debit: line.debit || "0", credit: line.credit || "0", narration: line.narration || undefined })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>New voucher</h2>
        <p className="muted text-xs">{TYPE_HINT[type]}</p>
      </div>
      {error ? <p className="alert-bar">{error}</p> : null}

      <div className="collection-row">
        <Field label="Type">
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {VOUCHER_TYPES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={businessDate} max={today} onChange={(event) => setBusinessDate(event.target.value)} />
        </Field>
        <Field label="Party ledger" hint="Shown on the voucher register">
          <select value={partyAccountId} onChange={(event) => setPartyAccountId(event.target.value)}>
            <option value="">—</option>
            {accounts.map((account) => (
              <option key={account.value} value={account.value}>
                {account.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Instrument">
          <select value={instrumentType} onChange={(event) => setInstrumentType(event.target.value)}>
            {INSTRUMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        {instrumentType !== "CASH" && instrumentType !== "ADJUSTMENT" ? (
          <>
            <Field label="Instrument no">
              <input type="text" value={instrumentNo} onChange={(event) => setInstrumentNo(event.target.value)} />
            </Field>
            <Field label="Instrument date">
              <input type="date" value={instrumentDate} onChange={(event) => setInstrumentDate(event.target.value)} />
            </Field>
            <Field label="Bank">
              <input type="text" value={bankName} onChange={(event) => setBankName(event.target.value)} />
            </Field>
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="voucher-grid">
          <span>Ledger</span>
          <span className="text-right">Debit</span>
          <span className="text-right">Credit</span>
          <span>Line narration</span>
          <span />
        </div>
        {lines.map((line, index) => (
          <div className="voucher-grid" key={index}>
            <select value={line.accountId} onChange={(event) => patch(index, { accountId: event.target.value })}>
              <option value="">Choose a ledger</option>
              {accounts.map((account) => (
                <option key={account.value} value={account.value}>
                  {account.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className="num"
              value={line.debit}
              // A line is one side or the other; typing in one clears the other.
              onChange={(event) => patch(index, { debit: event.target.value, credit: event.target.value ? "" : line.credit })}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className="num"
              value={line.credit}
              onChange={(event) => patch(index, { credit: event.target.value, debit: event.target.value ? "" : line.debit })}
            />
            <input type="text" value={line.narration} onChange={(event) => patch(index, { narration: event.target.value })} />
            <button type="button" className="icon-button" aria-label="Remove line" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="button button-secondary" onClick={() => setLines((current) => [...current, blankLine()])}>
          <Plus size={14} /> Add line
        </button>
      </div>

      <div className="balance-strip">
        <span>
          Debit <b>{formatINR(totals.debit.toFixed(2))}</b>
        </span>
        <span>
          Credit <b>{formatINR(totals.credit.toFixed(2))}</b>
        </span>
        <span>
          Difference{" "}
          <b className={totals.difference.isZero() ? "ok" : "loss"}>
            {formatINR(totals.difference.toFixed(2))}
          </b>
        </span>
        {balanced ? (
          <span className="badge ok">
            <Check size={11} className="inline" /> Balanced
          </span>
        ) : (
          <span className="badge alert">Not balanced</span>
        )}
      </div>

      <div className="collection-row">
        <Field label="Narration">
          <input type="text" value={narration} onChange={(event) => setNarration(event.target.value)} />
        </Field>
        <Field label="Attach a document" hint="Cheque, bill or bank advice">
          <input type="file" onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
        </Field>
      </div>
      {attachments.length > 0 ? (
        <ul className="muted text-xs">
          {attachments.map((file) => (
            <li key={file.url}>
              <Paperclip size={11} className="mr-1 inline" />
              {file.fileName}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end gap-2">
        <button className="button" type="button" onClick={save} disabled={pending || !balanced}>
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Post voucher
        </button>
      </div>
      {!balanced ? <p className="muted text-right text-xs">Debits must equal credits before the voucher can be posted.</p> : null}
    </div>
  );
}
