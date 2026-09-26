"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatNumber } from "@/lib/format";
import type { BalanceSheet, CashFlowReport, DateRange, PeriodicalReport, ProfitAndLoss, TrialBalance } from "@/server/accounts/queries";
import { AsOnBar, BalanceBanner, ExportBar, Money, PageHead, Qty, RangeBar, ReportTable, Stat } from "@/components/accounts/report-ui";

// ===========================================================================
// Trial balance
// ===========================================================================

export function TrialBalanceScreen({ report, today }: { report: TrialBalance; today: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (groupId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Trial balance" description={`As on ${report.asOn} · group-wise`}>
        <AsOnBar asOn={report.asOn} today={today} />
        <ExportBar report="trial-balance" params={{ asOn: report.asOn }} />
      </PageHead>

      <BalanceBanner isBalanced={report.isBalanced} difference={report.difference} />

      {report.unbalancedVouchers.length > 0 ? (
        <div className="alert-bar">
          <strong>{report.unbalancedVouchers.length} voucher(s) are internally out of balance:</strong>{" "}
          {report.unbalancedVouchers.map((voucher) => `${voucher.docNumber} (${voucher.date})`).join(", ")}
        </div>
      ) : null}

      <div className="stat-grid">
        <Stat label="Total debit" value={formatINR(report.totalDebit)} />
        <Stat label="Total credit" value={formatINR(report.totalCredit)} />
        <Stat label="Difference" value={formatINR(report.difference)} tone={report.isBalanced ? "gain" : "loss"} />
        <Stat label="Ledgers with a balance" value={String(report.groups.reduce((total, group) => total + group.accounts.length, 0))} sub={`${report.groups.length} groups`} />
      </div>

      <div className="panel p-3">
        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Group / ledger</th>
                <th>Code</th>
                <th className="num">Debit</th>
                <th className="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              {report.groups.map((group) => (
                <>
                  <tr className="group-row" key={group.groupId} onClick={() => toggle(group.groupId)}>
                    <td className="sticky-col">
                      {collapsed.has(group.groupId) ? <ChevronRight size={13} className="mr-1 inline" /> : <ChevronDown size={13} className="mr-1 inline" />}
                      {group.name}
                      <span className="muted ml-2 text-xs">{group.nature}</span>
                    </td>
                    <td>{group.code}</td>
                    <td className="num">
                      <Money value={group.debit} blankZero />
                    </td>
                    <td className="num">
                      <Money value={group.credit} blankZero />
                    </td>
                  </tr>
                  {!collapsed.has(group.groupId) &&
                    group.accounts.map((account) => (
                      <tr className="child-row" key={account.accountId}>
                        <td className="sticky-col">
                          <a href={`/accounts/ledger?accountId=${account.accountId}`}>{account.name}</a>
                        </td>
                        <td>{account.code}</td>
                        <td className="num">
                          <Money value={account.debit} blankZero />
                        </td>
                        <td className="num">
                          <Money value={account.credit} blankZero />
                        </td>
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                <td />
                <td className="num">
                  <Money value={report.totalDebit} />
                </td>
                <td className="num">
                  <Money value={report.totalCredit} />
                </td>
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>
    </section>
  );
}

// ===========================================================================
// Profit and loss
// ===========================================================================

export function ProfitAndLossScreen({ report, today }: { report: ProfitAndLoss; today: string }) {
  const sections = [
    { title: "Revenue from operations", part: report.revenue },
    { title: "Other income", part: report.otherIncome },
    { title: "Cost of goods sold", part: report.directCost },
  ];

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Profit and loss" description={`${report.range.from} to ${report.range.to} · compared with ${report.comparative.from} to ${report.comparative.to}`}>
        <RangeBar from={report.range.from} to={report.range.to} today={today} />
        <ExportBar report="profit-loss" params={{ from: report.range.from, to: report.range.to }} />
      </PageHead>

      <div className="stat-grid">
        <Stat label="Revenue" value={formatINR(report.revenue.total)} sub={`${formatNumber(report.totalLitres)} litres`} />
        <Stat label="Cost of goods sold" value={formatINR(report.directCost.total)} />
        <Stat label="Gross profit" value={formatINR(report.grossProfit)} sub={`${report.grossMarginPct} % · ₹${report.grossMarginPerLitre}/litre`} tone={Number(report.grossProfit) < 0 ? "loss" : "gain"} />
        <Stat label="Net profit" value={formatINR(report.netProfit)} sub={`${report.netMarginPct} % of revenue`} tone={Number(report.netProfit) < 0 ? "loss" : "gain"} />
        <Stat
          label="Against previous period"
          value={formatINR(String(Number(report.netProfit) - Number(report.netProfitPrevious)))}
          tone={Number(report.netProfit) >= Number(report.netProfitPrevious) ? "gain" : "loss"}
          sub={`was ${formatINR(report.netProfitPrevious)}`}
        />
      </div>

      <div className="panel p-3">
        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Particulars</th>
                <th>Code</th>
                <th className="num">This period</th>
                <th className="num">Previous period</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <>
                  <tr key={section.title}>
                    <td colSpan={5} className="section-title">
                      {section.title}
                    </td>
                  </tr>
                  {section.part.lines.map((line) => (
                    <tr className="pl-line" key={line.accountId}>
                      <td className="sticky-col">
                        <a href={`/accounts/ledger?accountId=${line.accountId}&from=${report.range.from}&to=${report.range.to}`}>{line.name}</a>
                      </td>
                      <td>{line.code}</td>
                      <td className="num">
                        <Money value={line.amount} />
                      </td>
                      <td className="num">
                        <Money value={line.previous} />
                      </td>
                      <td className="num">
                        <Money value={line.change} />
                      </td>
                    </tr>
                  ))}
                  <tr className="pl-total" key={`${section.title}-total`}>
                    <td className="sticky-col">Total {section.title.toLowerCase()}</td>
                    <td />
                    <td className="num">
                      <Money value={section.part.total} />
                    </td>
                    <td className="num">
                      <Money value={section.part.previousTotal} />
                    </td>
                    <td className="num">
                      <Money value={String(Number(section.part.total) - Number(section.part.previousTotal))} />
                    </td>
                  </tr>
                </>
              ))}

              <tr className="totals-row">
                <td className="sticky-col">GROSS PROFIT</td>
                <td />
                <td className="num">
                  <Money value={report.grossProfit} />
                </td>
                <td className="num">
                  <Money value={report.grossProfitPrevious} />
                </td>
                <td className="num">{report.grossMarginPct} %</td>
              </tr>

              <tr>
                <td colSpan={5} className="section-title">
                  Operating and other expenses
                </td>
              </tr>
              {report.expenses.lines.map((line) => (
                <tr className="pl-line" key={line.accountId}>
                  <td className="sticky-col">
                    <a href={`/accounts/ledger?accountId=${line.accountId}&from=${report.range.from}&to=${report.range.to}`}>{line.name}</a>
                  </td>
                  <td>{line.code}</td>
                  <td className="num">
                    <Money value={line.amount} />
                  </td>
                  <td className="num">
                    <Money value={line.previous} />
                  </td>
                  <td className="num">
                    <Money value={line.change} />
                  </td>
                </tr>
              ))}
              <tr className="pl-total">
                <td className="sticky-col">Total expenses</td>
                <td />
                <td className="num">
                  <Money value={report.expenses.total} />
                </td>
                <td className="num">
                  <Money value={report.expenses.previousTotal} />
                </td>
                <td className="num">
                  <Money value={String(Number(report.expenses.total) - Number(report.expenses.previousTotal))} />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">NET PROFIT</td>
                <td />
                <td className="num">
                  <Money value={report.netProfit} />
                </td>
                <td className="num">
                  <Money value={report.netProfitPrevious} />
                </td>
                <td className="num">{report.netMarginPct} %</td>
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>

      <div className="panel p-3">
        <p className="eyebrow">GROSS PROFIT BY PRODUCT</p>
        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Litres</th>
                <th className="num">Revenue</th>
                <th className="num">Cost</th>
                <th className="num">Gross profit</th>
                <th className="num">Margin / litre</th>
                <th className="num">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {report.byProduct.map((product) => (
                <tr key={product.productId}>
                  <td className="sticky-col font-medium">{product.name}</td>
                  <td className="num">
                    <Qty value={product.litres} blankZero />
                  </td>
                  <td className="num">
                    <Money value={product.revenue} />
                  </td>
                  <td className="num">
                    <Money value={product.cost} />
                  </td>
                  <td className="num">
                    <Money value={product.grossProfit} />
                  </td>
                  <td className="num">{Number(product.litres) > 0 ? `₹${product.marginPerLitre}` : "—"}</td>
                  <td className="num">{product.marginPct} %</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                <td className="num">
                  <Qty value={report.totalLitres} />
                </td>
                <td className="num">
                  <Money value={report.revenue.total} />
                </td>
                <td className="num">
                  <Money value={report.directCost.total} />
                </td>
                <td className="num">
                  <Money value={report.grossProfit} />
                </td>
                <td className="num">₹{report.grossMarginPerLitre}</td>
                <td className="num">{report.grossMarginPct} %</td>
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>
    </section>
  );
}

// ===========================================================================
// Balance sheet
// ===========================================================================

export function BalanceSheetScreen({ report, today }: { report: BalanceSheet; today: string }) {
  const side = (caption: string, heads: BalanceSheet["assets"], total: string) => (
    <div className="panel p-3">
      <p className="eyebrow">{caption}</p>
      <ReportTable>
        <table>
          <thead>
            <tr>
              <th>Particulars</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {heads.map((head) => (
              <>
                <tr key={head.head}>
                  <td colSpan={2} className="section-title">
                    {head.title}
                  </td>
                </tr>
                {head.lines.map((line) => (
                  <tr className="pl-line" key={line.accountId}>
                    <td className="sticky-col">
                      {line.accountId === "retained" ? line.name : <a href={`/accounts/ledger?accountId=${line.accountId}`}>{line.name}</a>}
                    </td>
                    <td className="num">
                      <Money value={line.amount} />
                    </td>
                  </tr>
                ))}
                <tr className="pl-total" key={`${head.head}-total`}>
                  <td className="sticky-col">Total {head.title.toLowerCase()}</td>
                  <td className="num">
                    <Money value={head.total} />
                  </td>
                </tr>
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td className="sticky-col">Total {caption.toLowerCase()}</td>
              <td className="num">
                <Money value={total} />
              </td>
            </tr>
          </tfoot>
        </table>
      </ReportTable>
    </div>
  );

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Balance sheet" description={`As on ${report.asOn} · Schedule III presentation`}>
        <AsOnBar asOn={report.asOn} today={today} />
        <ExportBar report="balance-sheet" params={{ asOn: report.asOn }} />
      </PageHead>

      <BalanceBanner isBalanced={report.isBalanced} difference={report.difference} what="balance sheet" />

      <div className="stat-grid">
        <Stat label="Total assets" value={formatINR(report.totalAssets)} />
        <Stat label="Equity and liabilities" value={formatINR(report.totalEquityAndLiabilities)} />
        <Stat label="Profit carried to reserves" value={formatINR(report.retainedEarnings)} tone={Number(report.retainedEarnings) < 0 ? "loss" : "gain"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {side("EQUITY AND LIABILITIES", report.equityAndLiabilities, report.totalEquityAndLiabilities)}
        {side("ASSETS", report.assets, report.totalAssets)}
      </div>
    </section>
  );
}

// ===========================================================================
// Cash flow
// ===========================================================================

export function CashFlowScreen({ report, today }: { report: CashFlowReport; today: string }) {
  const chart = report.sections.map((section) => ({ name: section.title.replace("Cash flow from ", ""), amount: Number(section.total) }));

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Cash flow" description={`${report.range.from} to ${report.range.to} · operating, investing and financing`}>
        <RangeBar from={report.range.from} to={report.range.to} today={today} />
        <ExportBar report="cash-flow" params={{ from: report.range.from, to: report.range.to }} />
      </PageHead>

      <div className="stat-grid">
        <Stat label="Opening cash and bank" value={formatINR(report.opening)} />
        <Stat label="Operating" value={formatINR(report.operating)} tone={Number(report.operating) < 0 ? "loss" : "gain"} />
        <Stat label="Investing" value={formatINR(report.investing)} tone={Number(report.investing) < 0 ? "loss" : "neutral"} />
        <Stat label="Financing" value={formatINR(report.financing)} tone={Number(report.financing) < 0 ? "loss" : "neutral"} />
        <Stat label="Closing cash and bank" value={formatINR(report.closing)} sub={Number(report.difference) === 0 ? "Ties to the ledger" : `Ledger says ${formatINR(report.closingPerLedger)}`} tone={Number(report.difference) === 0 ? "gain" : "loss"} />
      </div>

      {chart.length > 0 ? (
        <div className="panel p-3">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chart} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#1d2d42" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#7b8ca4" fontSize={11} />
              <YAxis stroke="#7b8ca4" fontSize={11} width={78} />
              <Tooltip contentStyle={{ background: "#101b2b", border: "1px solid #26364d", fontSize: 12 }} formatter={(value: number) => formatINR(value)} />
              <Bar dataKey="amount" name="Net cash" fill="#18b6a4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="panel p-3">
        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Particulars</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pl-total">
                <td className="sticky-col">Opening cash and bank balances</td>
                <td className="num">
                  <Money value={report.opening} />
                </td>
              </tr>
              {report.sections.map((section) => (
                <>
                  <tr key={section.category}>
                    <td colSpan={2} className="section-title">
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr className="pl-line" key={`${section.category}-${row.name}`}>
                      <td className="sticky-col">{row.name}</td>
                      <td className="num">
                        <Money value={row.amount} />
                      </td>
                    </tr>
                  ))}
                  {section.rows.length === 0 ? (
                    <tr className="pl-line" key={`${section.category}-none`}>
                      <td className="sticky-col muted">No movement in this period</td>
                      <td className="num muted">—</td>
                    </tr>
                  ) : null}
                  <tr className="pl-total" key={`${section.category}-total`}>
                    <td className="sticky-col">Net cash from {section.title.replace("Cash flow from ", "")}</td>
                    <td className="num">
                      <Money value={section.total} />
                    </td>
                  </tr>
                </>
              ))}
              <tr className="pl-total">
                <td className="sticky-col">Net increase in cash and cash equivalents</td>
                <td className="num">
                  <Money value={report.netChange} />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">Closing cash and bank balances</td>
                <td className="num">
                  <Money value={report.closing} />
                </td>
              </tr>
            </tfoot>
          </table>
        </ReportTable>
        <p className="muted mt-2 text-xs">Direct method: every movement on cash and bank is classified by the ledger on the other side of the entry.</p>
      </div>
    </section>
  );
}

// ===========================================================================
// Month-wise periodicals
// ===========================================================================

export function PeriodicalsScreen({ report }: { report: PeriodicalReport }) {
  const chart = report.months.map((month) => ({
    month: month.label,
    Sale: Number(month.sale),
    Purchase: Number(month.purchase),
    "Gross profit": Number(month.grossProfit),
    "Net profit": Number(month.netProfit),
    Collection: Number(month.collection),
  }));

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="Month-wise summary" description="Sale, purchase, expense, profit and collection over twelve months">
        <ExportBar report="periodicals" params={{ months: report.months.length }} />
      </PageHead>

      <div className="stat-grid">
        <Stat label="Sale" value={formatINR(report.totals.sale)} sub={`${formatNumber(report.totals.litres)} litres`} />
        <Stat label="Purchase" value={formatINR(report.totals.purchase)} />
        <Stat label="Gross profit" value={formatINR(report.totals.grossProfit)} tone={Number(report.totals.grossProfit) < 0 ? "loss" : "gain"} />
        <Stat label="Net profit" value={formatINR(report.totals.netProfit)} tone={Number(report.totals.netProfit) < 0 ? "loss" : "gain"} />
        <Stat label="Collection" value={formatINR(report.totals.collection)} />
      </div>

      <div className="panel p-3">
        <p className="eyebrow">TWELVE-MONTH TREND</p>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chart} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1d2d42" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="#7b8ca4" fontSize={11} />
            <YAxis stroke="#7b8ca4" fontSize={11} width={80} />
            <Tooltip contentStyle={{ background: "#101b2b", border: "1px solid #26364d", fontSize: 12 }} formatter={(value: number) => formatINR(value)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Sale" stroke="#18b6a4" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Purchase" stroke="#7c93ad" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Gross profit" stroke="#e0a232" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Net profit" stroke="#30a46c" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel p-3">
        <ReportTable>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Sale</th>
                <th className="num">Litres</th>
                <th className="num">Purchase</th>
                <th className="num">Gross profit</th>
                <th className="num">Expense</th>
                <th className="num">Net profit</th>
                <th className="num">Collection</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((month) => (
                <tr key={month.month}>
                  <td className="sticky-col font-medium">{month.label}</td>
                  <td className="num">
                    <Money value={month.sale} blankZero />
                  </td>
                  <td className="num">
                    <Qty value={month.litres} blankZero />
                  </td>
                  <td className="num">
                    <Money value={month.purchase} blankZero />
                  </td>
                  <td className="num">
                    <Money value={month.grossProfit} blankZero />
                  </td>
                  <td className="num">
                    <Money value={month.expense} blankZero />
                  </td>
                  <td className="num">
                    <Money value={month.netProfit} blankZero />
                  </td>
                  <td className="num">
                    <Money value={month.collection} blankZero />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td className="sticky-col">Total</td>
                <td className="num">
                  <Money value={report.totals.sale} />
                </td>
                <td className="num">
                  <Qty value={report.totals.litres} />
                </td>
                <td className="num">
                  <Money value={report.totals.purchase} />
                </td>
                <td className="num">
                  <Money value={report.totals.grossProfit} />
                </td>
                <td className="num">
                  <Money value={report.totals.expense} />
                </td>
                <td className="num">
                  <Money value={report.totals.netProfit} />
                </td>
                <td className="num">
                  <Money value={report.totals.collection} />
                </td>
              </tr>
            </tfoot>
          </table>
        </ReportTable>
      </div>
    </section>
  );
}
