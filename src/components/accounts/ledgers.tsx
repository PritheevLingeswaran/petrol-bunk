"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Mail, MessageSquare } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";
import { setReconciled } from "@/server/accounts/actions";
import type { AccountOption, AgeingReport, BookReport, CustomerStatement, DateRange, DebtorsReport, LedgerReport, Option } from "@/server/accounts/queries";
import { AsOnBar, ExportBar, Field, Money, PageHead, RangeBar, ReportTable, Stat } from "@/components/accounts/report-ui";

/** Drill-through target for a ledger line. */
const sourceHref = (kind: string, id: string) => {
  switch (kind) {
    case "bill":
      return `/billing/bills?billId=${id}`;
    case "purchase":
      return `/pump/decantation?purchaseId=${id}`;
    case "shift":
      return `/pump/settlement?shiftEntryId=${id}`;
    default:
      return `/accounts/vouchers?voucherId=${id}`;
  }
};

// ===========================================================================
// Ledger
// ===========================================================================

export function LedgerScreen({ report, accounts, accountId, range, today }: { report: LedgerReport | null; accounts: AccountOption[]; accountId: string; range: DateRange; today: string }) {
  const change = (value: string) => {
    window.location.search = `?${new URLSearchParams({ accountId: value, from: range.from, to: range.to }).toString()}`;
  };

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Ledger" description="Any account, any period, with a running balance and drill-through">
        <Field label="Ledger">
          <select value={accountId} onChange={(event) => change(event.target.value)}>
            <option value="">Choose a ledger</option>
            {accounts.map((account) => (
              <option key={account.value} value={account.value}>
                {account.label}
              </option>
            ))}
          </select>
        </Field>
        <RangeBar from={range.from} to={range.to} today={today} extra={{ accountId }} />
        <ExportBar report="ledger" params={{ accountId, from: range.from, to: range.to }} />
      </PageHead>

      {!report ? (
        <p className="info-bar">Choose a ledger to open it.</p>
      ) : (
        <>
          <div className="stat-grid">
            <Stat label="Opening balance" value={formatINR(report.openingBalance)} sub={report.openingSide} />
            <Stat label="Debit in period" value={formatINR(report.totalDebit)} />
            <Stat label="Credit in period" value={formatINR(report.totalCredit)} />
            <Stat label="Closing balance" value={formatINR(report.closingBalance)} sub={`${report.closingSide} · ${report.account.groupName}`} />
          </div>

          <div className="panel p-3">
            <ReportTable>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Type</th>
                    <th>Particulars</th>
                    <th>Narration</th>
                    <th>Instrument</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                    <th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  <tr className="pl-total">
                    <td className="sticky-col" colSpan={6}>
                      Opening balance
                    </td>
                    <td colSpan={2} />
                    <td className="num">
                      {formatINR(report.openingBalance)} {report.openingSide}
                    </td>
                    <td className="no-print" />
                  </tr>
                  {report.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="sticky-col">{entry.date}</td>
                      <td className="font-medium">{entry.docNumber}</td>
                      <td>{entry.type.replaceAll("_", " ")}</td>
                      <td>{entry.particulars}</td>
                      <td>{entry.narration}</td>
                      <td>{entry.instrument}</td>
                      <td className="num">
                        <Money value={entry.debit} blankZero />
                      </td>
                      <td className="num">
                        <Money value={entry.credit} blankZero />
                      </td>
                      <td className="num">{formatINR(entry.runningBalance)}</td>
                      <td className="no-print">
                        <a className="icon-button" href={sourceHref(entry.sourceKind, entry.sourceId)} aria-label="Open source document">
                          <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {report.entries.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-500">
                        No entries in this period.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    <td className="sticky-col" colSpan={6}>
                      Closing balance ({report.closingSide})
                    </td>
                    <td className="num">
                      <Money value={report.totalDebit} />
                    </td>
                    <td className="num">
                      <Money value={report.totalCredit} />
                    </td>
                    <td className="num">{formatINR(report.closingBalance)}</td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </ReportTable>
          </div>
        </>
      )}
    </section>
  );
}

// ===========================================================================
// Cash book / bank book with reconciliation
// ===========================================================================

export function BookScreen({ report, accounts, accountId, range, today }: { report: BookReport | null; accounts: AccountOption[]; accountId: string; range: DateRange; today: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [clearedOn, setClearedOn] = useState(today);
  const [bankRef, setBankRef] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [onlyUncleared, setOnlyUncleared] = useState(false);

  const visible = useMemo(() => (report ? report.rows.filter((row) => !onlyUncleared || !row.isReconciled) : []), [report, onlyUncleared]);

  const mark = async (reconciled: boolean) => {
    if (selected.length === 0 || pending) return;
    setPending(true);
    setError("");
    const result = await setReconciled({ lineIds: selected, clearedOn, bankRef: bankRef || undefined, reconciled });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.location.reload();
  };

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title={report?.account.isBank ? "Bank book" : "Cash book"} description="Receipts and payments, with bank reconciliation">
        <Field label="Account">
          <select value={accountId} onChange={(event) => (window.location.search = `?${new URLSearchParams({ accountId: event.target.value, from: range.from, to: range.to }).toString()}`)}>
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.value} value={account.value}>
                {account.label}
              </option>
            ))}
          </select>
        </Field>
        <RangeBar from={range.from} to={range.to} today={today} extra={{ accountId }} />
        <ExportBar report="book" params={{ accountId, from: range.from, to: range.to }} />
      </PageHead>

      {!report ? (
        <p className="info-bar">Choose a cash or bank account.</p>
      ) : (
        <>
          {error ? <p className="alert-bar">{error}</p> : null}

          <div className="stat-grid">
            <Stat label="Balance as per books" value={formatINR(report.reconciliation.bookBalance)} />
            <Stat label="Receipts not yet credited" value={formatINR(report.reconciliation.unclearedReceipts)} />
            <Stat label="Payments not yet presented" value={formatINR(report.reconciliation.unclearedPayments)} />
            <Stat label="Balance as per bank" value={formatINR(report.reconciliation.reconciledBalance)} sub={`${report.reconciliation.unclearedCount} item(s) unreconciled`} tone={report.reconciliation.unclearedCount > 0 ? "loss" : "gain"} />
          </div>

          <div className="panel space-y-3 p-3">
            <div className="toolbar no-print">
              <label className="check-row">
                <input type="checkbox" checked={onlyUncleared} onChange={(event) => setOnlyUncleared(event.target.checked)} />
                Show only unreconciled
              </label>
              <Field label="Cleared on">
                <input type="date" value={clearedOn} max={today} onChange={(event) => setClearedOn(event.target.value)} />
              </Field>
              <Field label="Bank reference">
                <input type="text" value={bankRef} onChange={(event) => setBankRef(event.target.value)} />
              </Field>
              <button className="button" type="button" disabled={selected.length === 0 || pending} onClick={() => mark(true)}>
                {pending ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Mark {selected.length || ""} cleared
              </button>
              <button className="button button-secondary" type="button" disabled={selected.length === 0 || pending} onClick={() => mark(false)}>
                Un-mark
              </button>
            </div>

            <ReportTable>
              <table>
                <thead>
                  <tr>
                    <th className="no-print">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={visible.length > 0 && selected.length === visible.length}
                        onChange={(event) => setSelected(event.target.checked ? visible.map((row) => row.id) : [])}
                      />
                    </th>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Particulars</th>
                    <th>Instrument</th>
                    <th className="num">Receipt</th>
                    <th className="num">Payment</th>
                    <th className="num">Balance</th>
                    <th>Cleared</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id} className={row.isReconciled ? "" : "opacity-95"}>
                      <td className="no-print">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.docNumber}`}
                          checked={selected.includes(row.id)}
                          onChange={(event) => setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))}
                        />
                      </td>
                      <td className="sticky-col">{row.date}</td>
                      <td className="font-medium">{row.docNumber}</td>
                      <td>{row.particulars}</td>
                      <td>{row.instrument}</td>
                      <td className="num">
                        <Money value={row.debit} blankZero />
                      </td>
                      <td className="num">
                        <Money value={row.credit} blankZero />
                      </td>
                      <td className="num">{formatINR(row.runningBalance)}</td>
                      <td>{row.isReconciled ? <span className="badge ok">{row.clearedOn || "Yes"}</span> : <span className="badge warn">Pending</span>}</td>
                    </tr>
                  ))}
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        Nothing to show.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    <td className="no-print" />
                    <td className="sticky-col" colSpan={4}>
                      Total · closing {report.closing}
                    </td>
                    <td className="num">
                      <Money value={report.totalDebit} />
                    </td>
                    <td className="num">
                      <Money value={report.totalCredit} />
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </ReportTable>
          </div>

          <div className="panel p-3">
            <p className="eyebrow">BANK RECONCILIATION STATEMENT</p>
            <table>
              <tbody>
                <tr>
                  <td>Balance as per books</td>
                  <td className="num">
                    <Money value={report.reconciliation.bookBalance} />
                  </td>
                </tr>
                <tr>
                  <td>Less: receipts recorded but not yet credited by the bank</td>
                  <td className="num">
                    <Money value={report.reconciliation.unclearedReceipts} />
                  </td>
                </tr>
                <tr>
                  <td>Add: payments issued but not yet presented</td>
                  <td className="num">
                    <Money value={report.reconciliation.unclearedPayments} />
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td>Balance as per bank statement</td>
                  <td className="num">
                    <Money value={report.reconciliation.reconciledBalance} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ===========================================================================
// Debtors
// ===========================================================================

export function DebtorsScreen({ report, today }: { report: DebtorsReport; today: string }) {
  const [filter, setFilter] = useState("ALL");
  const rows = useMemo(() => (filter === "ALL" ? report.rows : report.rows.filter((row) => row.status === filter)), [report.rows, filter]);

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Debtors" description="Credit limit, outstanding, available limit and payment behaviour">
        <AsOnBar asOn={report.asOn} today={today} />
        <ExportBar report="debtors" params={{ asOn: report.asOn }} />
      </PageHead>

      <div className="stat-grid">
        <Stat label="Total outstanding" value={formatINR(report.totals.outstanding)} sub={`${report.rows.length} customers`} />
        <Stat label="Overdue" value={formatINR(report.totals.overdue)} tone={Number(report.totals.overdue) > 0 ? "loss" : "gain"} />
        <Stat label="Credit limits granted" value={formatINR(report.totals.creditLimit)} />
        <Stat label="Over their limit" value={String(report.rows.filter((row) => row.status === "BLOCK").length)} tone={report.rows.some((row) => row.status === "BLOCK") ? "loss" : "gain"} sub="Billing blocks these" />
      </div>

      <div className="panel space-y-3 p-3">
        <div className="flex flex-wrap gap-2 no-print">
          {[
            ["ALL", "All"],
            ["BLOCK", "Over limit"],
            ["WARN", "Warn"],
            ["OK", "Healthy"],
          ].map(([value, label]) => (
            <button key={value} type="button" className={`button ${filter === value ? "" : "button-secondary"}`} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>

        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer</th>
                <th className="num">Credit limit</th>
                <th className="num">Outstanding</th>
                <th className="num">Available</th>
                <th className="num">Used %</th>
                <th className="num">Overdue</th>
                <th className="num">Days overdue</th>
                <th className="num">Credit days</th>
                <th>Last payment</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="sticky-col">{row.code}</td>
                  <td className="font-medium">{row.name}</td>
                  <td className="num">
                    <Money value={row.creditLimit} blankZero />
                  </td>
                  <td className="num">
                    <Money value={row.outstanding} />
                  </td>
                  <td className="num">
                    <Money value={row.availableLimit} />
                  </td>
                  <td className="num">{row.utilisationPct} %</td>
                  <td className="num">
                    <Money value={row.overdue} blankZero />
                  </td>
                  <td className="num">{row.oldestDays || "—"}</td>
                  <td className="num">{row.creditDays}</td>
                  <td>{row.lastPaymentDate || "—"}</td>
                  <td className="num">{row.lastPaymentAmount ? <Money value={row.lastPaymentAmount} /> : "—"}</td>
                  <td>
                    <span className={`badge ${row.status === "BLOCK" ? "alert" : row.status === "WARN" ? "warn" : "ok"}`}>{row.status}</span>
                  </td>
                  <td className="no-print">
                    <a className="icon-button" href={`/accounts/statements?customerId=${row.customerId}`} aria-label="Open statement">
                      <ExternalLink size={14} />
                    </a>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-slate-500">
                    No customers in this bucket.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col" colSpan={2}>
                  Total
                </td>
                <td className="num">
                  <Money value={report.totals.creditLimit} />
                </td>
                <td className="num">
                  <Money value={report.totals.outstanding} />
                </td>
                <td colSpan={2} />
                <td className="num">
                  <Money value={report.totals.overdue} />
                </td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>
    </section>
  );
}

// ===========================================================================
// Ageing
// ===========================================================================

export function AgeingScreen({ report, today }: { report: AgeingReport; today: string }) {
  const palette = ["#18b6a4", "#3f9fd0", "#7c93ad", "#e0a232", "#e07a32", "#e5484d"];
  const chart = report.rows.slice(0, 12).map((row) => ({
    name: row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name,
    ...Object.fromEntries(report.labels.map((label) => [label, Number(row.buckets[label as keyof typeof row.buckets])])),
  }));

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Outstanding ageing" description="0-15, 16-30, 31-45, 46-60, 61-90 and 90+ days">
        <AsOnBar asOn={report.asOn} today={today} />
        <ExportBar report="ageing" params={{ asOn: report.asOn }} />
      </PageHead>

      <div className="stat-grid">
        {report.labels.map((label, index) => (
          <Stat
            key={label}
            label={`${label} days`}
            value={formatINR(report.totals[label as keyof typeof report.totals])}
            tone={index >= 4 && Number(report.totals[label as keyof typeof report.totals]) > 0 ? "loss" : "neutral"}
          />
        ))}
        <Stat label="Total outstanding" value={formatINR(report.totals.total)} />
      </div>

      {chart.length > 0 ? (
        <div className="panel p-3">
          <p className="eyebrow">AGEING BY CUSTOMER</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chart} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1d2d42" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#7b8ca4" fontSize={10} interval={0} angle={-18} textAnchor="end" height={62} />
              <YAxis stroke="#7b8ca4" fontSize={11} width={78} />
              <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", fontSize: 12 }} formatter={(value: number) => formatINR(value)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {report.labels.map((label, index) => (
                <Bar key={label} dataKey={label} stackId="ageing" fill={palette[index % palette.length]} name={`${label} days`} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="panel p-3">
        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer</th>
                {report.labels.map((label) => (
                  <th key={label} className="num">
                    {label} days
                  </th>
                ))}
                <th className="num">Total</th>
                <th className="num">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.customerId}>
                  <td className="sticky-col">{row.code}</td>
                  <td className="font-medium">
                    <a href={`/accounts/statements?customerId=${row.customerId}`}>{row.name}</a>
                  </td>
                  {report.labels.map((label) => (
                    <td key={label} className="num">
                      <Money value={row.buckets[label as keyof typeof row.buckets]} blankZero />
                    </td>
                  ))}
                  <td className="num font-semibold">
                    <Money value={row.total} />
                  </td>
                  <td className="num">{row.oldestDays || "—"}</td>
                </tr>
              ))}
              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={report.labels.length + 4} className="py-10 text-center text-slate-500">
                    Nothing outstanding.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col" colSpan={2}>
                  Total
                </td>
                {report.labels.map((label) => (
                  <td key={label} className="num">
                    <Money value={report.totals[label as keyof typeof report.totals]} />
                  </td>
                ))}
                <td className="num">
                  <Money value={report.totals.total} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>
    </section>
  );
}

// ===========================================================================
// Customer statement
// ===========================================================================

export function StatementScreen({ report, customers, customerId, range, today }: { report: CustomerStatement | null; customers: Option[]; customerId: string; range: DateRange; today: string }) {
  const mailto = report
    ? `mailto:${report.customer.email}?subject=${encodeURIComponent(`Statement of account — ${report.customer.name}`)}&body=${encodeURIComponent(
        `Dear ${report.customer.name},\n\nPlease find your statement of account for ${range.from} to ${range.to}.\n\nClosing balance: INR ${report.closing} ${report.closingSide}.\nOf which overdue beyond 90 days: INR ${report.ageing.buckets["90+"]}.\n\nDownload: ${typeof window === "undefined" ? "" : window.location.origin}/api/accounts/export?report=statement&format=pdf&customerId=${customerId}&from=${range.from}&to=${range.to}\n\nRegards,\n${report.outlet.name}`,
      )}`
    : "";

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Customer statement" description="Opening balance, transactions, closing balance and ageing">
        <Field label="Customer">
          <select value={customerId} onChange={(event) => (window.location.search = `?${new URLSearchParams({ customerId: event.target.value, from: range.from, to: range.to }).toString()}`)}>
            <option value="">Choose a customer</option>
            {customers.map((customer) => (
              <option key={customer.value} value={customer.value}>
                {customer.label}
              </option>
            ))}
          </select>
        </Field>
        <RangeBar from={range.from} to={range.to} today={today} extra={{ customerId }} />
        <ExportBar report="statement" params={{ customerId, from: range.from, to: range.to }} />
        {report?.customer.email ? (
          <a className="button button-secondary no-print" href={mailto}>
            <Mail size={15} /> Email
          </a>
        ) : null}
      </PageHead>

      {!report ? (
        <p className="info-bar">Choose a customer to open their statement.</p>
      ) : (
        <>
          <div className="panel p-3">
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="eyebrow">BILL TO</p>
                <p className="font-semibold">{report.customer.name}</p>
                <p className="muted text-xs">{report.customer.address}</p>
                <p className="muted text-xs">
                  {report.customer.phone} {report.customer.gstin ? `· GSTIN ${report.customer.gstin}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="eyebrow">TERMS</p>
                <p className="text-sm">
                  Credit limit {formatINR(report.customer.creditLimit)} · {report.customer.creditDays} days
                </p>
                <p className="muted text-xs">
                  {report.outlet.name} · {report.outlet.gstin}
                </p>
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <Stat label="Opening balance" value={formatINR(report.opening)} sub={report.openingSide} />
            <Stat label="Debits" value={formatINR(report.totalDebit)} />
            <Stat label="Credits" value={formatINR(report.totalCredit)} />
            <Stat label="Closing balance" value={formatINR(report.closing)} sub={report.closingSide} tone={Number(report.closing) > 0 ? "loss" : "neutral"} />
          </div>

          <div className="panel p-3">
            <ReportTable>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Particulars</th>
                    <th>Instrument</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="pl-total">
                    <td className="sticky-col" colSpan={5}>
                      Opening balance ({report.openingSide})
                    </td>
                    <td colSpan={2} />
                    <td className="num">{formatINR(report.opening)}</td>
                  </tr>
                  {report.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="sticky-col">{entry.date}</td>
                      <td className="font-medium">{entry.docNumber}</td>
                      <td>{entry.type.replaceAll("_", " ")}</td>
                      <td>{entry.particulars}</td>
                      <td>{entry.instrument}</td>
                      <td className="num">
                        <Money value={entry.debit} blankZero />
                      </td>
                      <td className="num">
                        <Money value={entry.credit} blankZero />
                      </td>
                      <td className="num">{formatINR(entry.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="totals-row">
                    <td className="sticky-col" colSpan={5}>
                      Closing balance ({report.closingSide})
                    </td>
                    <td className="num">
                      <Money value={report.totalDebit} />
                    </td>
                    <td className="num">
                      <Money value={report.totalCredit} />
                    </td>
                    <td className="num">{formatINR(report.closing)}</td>
                  </tr>
                </tfoot>
              </table>
            </ReportTable>
          </div>

          <div className="panel p-3">
            <p className="eyebrow">AGEING OF THE CLOSING BALANCE</p>
            <table>
              <thead>
                <tr>
                  {Object.keys(report.ageing.buckets).map((label) => (
                    <th key={label} className="num">
                      {label} days
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {Object.entries(report.ageing.buckets).map(([label, value]) => (
                    <td key={label} className="num">
                      <Money value={value} blankZero />
                    </td>
                  ))}
                  <td className="num font-semibold">
                    <Money value={report.ageing.total} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
