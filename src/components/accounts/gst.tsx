"use client";

import { useState } from "react";
import { formatINR, formatNumber } from "@/lib/format";
import type { DateRange, Gstr1Report, Gstr3bReport } from "@/server/accounts/queries";
import { ExportBar, Money, PageHead, Qty, RangeBar, ReportTable, Stat } from "@/components/accounts/report-ui";

export function GstScreen({ gstr1, gstr3b, range, today }: { gstr1: Gstr1Report; gstr3b: Gstr3bReport; range: DateRange; today: string }) {
  const [tab, setTab] = useState<"b2b" | "b2c" | "hsn" | "gstr3b">("b2b");

  return (
    <section className="space-y-4">
      <PageHead eyebrow="ACCOUNTS" title="GST returns" description={`GSTR-1 and GSTR-3B · ${range.from} to ${range.to}`}>
        <RangeBar from={range.from} to={range.to} today={today} />
        <ExportBar report="gstr1" params={{ from: range.from, to: range.to }} />
      </PageHead>

      <div className="stat-grid">
        <Stat label="Taxable value" value={formatINR(gstr1.totals.taxable)} />
        <Stat label="CGST" value={formatINR(gstr1.totals.cgst)} />
        <Stat label="SGST" value={formatINR(gstr1.totals.sgst)} />
        <Stat label="IGST" value={formatINR(gstr1.totals.igst)} />
        <Stat label="Net tax payable in cash" value={formatINR(gstr3b.netPayable)} tone={Number(gstr3b.netPayable) > 0 ? "loss" : "gain"} sub="GSTR-3B" />
      </div>

      <p className="info-bar">{gstr3b.note}</p>

      <div className="panel space-y-3 p-3">
        <div className="tab-row no-print">
          {(
            [
              ["b2b", `B2B (${gstr1.b2b.length})`],
              ["b2c", `B2C summary (${gstr1.b2c.length})`],
              ["hsn", `HSN summary (${gstr1.hsn.length})`],
              ["gstr3b", "GSTR-3B"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
          <span className="ml-auto flex gap-2">
            <a className="button button-secondary" href={`/api/accounts/export?report=gstr1&format=excel&from=${range.from}&to=${range.to}`}>
              GSTR-1 offline utility
            </a>
            <a className="button button-secondary" href={`/api/accounts/export?report=gstr3b&format=excel&from=${range.from}&to=${range.to}`}>
              GSTR-3B Excel
            </a>
          </span>
        </div>

        {tab === "b2b" ? (
          <ReportTable>
            <table>
              <thead>
                <tr>
                  <th>GSTIN</th>
                  <th>Receiver</th>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th className="num">Invoice value</th>
                  <th>POS</th>
                  <th className="num">Rate</th>
                  <th className="num">Taxable</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">IGST</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {gstr1.b2b.map((row, index) => (
                  <tr key={`${row.invoiceNo}-${index}`}>
                    <td className="sticky-col">{row.gstin}</td>
                    <td>{row.customer}</td>
                    <td className="font-medium">{row.invoiceNo}</td>
                    <td>{row.date}</td>
                    <td className="num">
                      <Money value={row.value} />
                    </td>
                    <td>{row.place}</td>
                    <td className="num">{row.rate}</td>
                    <td className="num">
                      <Money value={row.taxable} />
                    </td>
                    <td className="num">
                      <Money value={row.cgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.sgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.igst} blankZero />
                    </td>
                    <td>{row.type}</td>
                  </tr>
                ))}
                {gstr1.b2b.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-10 text-center text-slate-500">
                      No B2B invoices in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="sticky-col" colSpan={7}>
                    Total
                  </td>
                  <td className="num">
                    <Money value={gstr1.b2b.reduce((total, row) => total + Number(row.taxable), 0).toFixed(2)} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.b2b.reduce((total, row) => total + Number(row.cgst), 0).toFixed(2)} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.b2b.reduce((total, row) => total + Number(row.sgst), 0).toFixed(2)} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.b2b.reduce((total, row) => total + Number(row.igst), 0).toFixed(2)} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </ReportTable>
        ) : null}

        {tab === "b2c" ? (
          <ReportTable>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Place of supply</th>
                  <th className="num">Rate</th>
                  <th className="num">Invoices</th>
                  <th className="num">Taxable</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">Cess</th>
                </tr>
              </thead>
              <tbody>
                {gstr1.b2c.map((row, index) => (
                  <tr key={index}>
                    <td className="sticky-col">{row.type}</td>
                    <td>{row.place}</td>
                    <td className="num">{row.rate}</td>
                    <td className="num">{row.invoices}</td>
                    <td className="num">
                      <Money value={row.taxable} />
                    </td>
                    <td className="num">
                      <Money value={row.cgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.sgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.cess} blankZero />
                    </td>
                  </tr>
                ))}
                {gstr1.b2c.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No B2C supplies in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ReportTable>
        ) : null}

        {tab === "hsn" ? (
          <ReportTable>
            <table>
              <thead>
                <tr>
                  <th>HSN</th>
                  <th>Description</th>
                  <th>UQC</th>
                  <th className="num">Quantity</th>
                  <th className="num">Value</th>
                  <th className="num">Taxable</th>
                  <th className="num">CGST</th>
                  <th className="num">SGST</th>
                  <th className="num">IGST</th>
                </tr>
              </thead>
              <tbody>
                {gstr1.hsn.map((row) => (
                  <tr key={row.hsn}>
                    <td className="sticky-col font-medium">{row.hsn}</td>
                    <td>{row.description}</td>
                    <td>{row.uqc}</td>
                    <td className="num">
                      <Qty value={row.quantity} />
                    </td>
                    <td className="num">
                      <Money value={row.value} />
                    </td>
                    <td className="num">
                      <Money value={row.taxable} />
                    </td>
                    <td className="num">
                      <Money value={row.cgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.sgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.igst} blankZero />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="sticky-col" colSpan={4}>
                    Total
                  </td>
                  <td className="num">
                    <Money value={gstr1.totals.invoiceValue} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.totals.taxable} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.totals.cgst} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.totals.sgst} />
                  </td>
                  <td className="num">
                    <Money value={gstr1.totals.igst} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </ReportTable>
        ) : null}

        {tab === "gstr3b" ? (
          <ReportTable>
            <table>
              <thead>
                <tr>
                  <th>Nature of supply</th>
                  <th className="num">Taxable value</th>
                  <th className="num">Integrated tax</th>
                  <th className="num">Central tax</th>
                  <th className="num">State/UT tax</th>
                  <th className="num">Cess</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="section-title">
                    3.1 Details of outward supplies
                  </td>
                </tr>
                {gstr3b.outward.map((row) => (
                  <tr key={row.description}>
                    <td className="sticky-col">{row.description}</td>
                    <td className="num">
                      <Money value={row.taxable} />
                    </td>
                    <td className="num">
                      <Money value={row.igst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.cgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.sgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.cess} blankZero />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} className="section-title">
                    4. Eligible ITC
                  </td>
                </tr>
                {gstr3b.inward.map((row) => (
                  <tr key={row.description}>
                    <td className="sticky-col">{row.description}</td>
                    <td className="num">
                      <Money value={row.taxable} />
                    </td>
                    <td className="num">
                      <Money value={row.igst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.cgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.sgst} blankZero />
                    </td>
                    <td className="num">
                      <Money value={row.cess} blankZero />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="totals-row">
                  <td className="sticky-col">Net tax payable in cash</td>
                  <td className="num">
                    <Money value={gstr3b.netPayable} />
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </ReportTable>
        ) : null}
      </div>
    </section>
  );
}
