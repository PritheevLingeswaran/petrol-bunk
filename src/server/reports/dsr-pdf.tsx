import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";
import { formatINR, formatNumber } from "@/lib/format";
import type { DsrReport } from "@/server/reports/dsr";

/**
 * One page, printed on white paper, read at night.
 *
 * Dense on purpose: the owner wants every number of the day on a single sheet
 * they can sign, not a six-page pack. Type is small but the figures are
 * right-aligned and tabular so a column can be scanned at a glance.
 */
const styles = StyleSheet.create({
  page: { color: "#16212d", fontFamily: "Helvetica", fontSize: 7, paddingBottom: 26, paddingHorizontal: 20, paddingTop: 18 },
  header: { borderBottom: "1 solid #16212d", flexDirection: "row", justifyContent: "space-between", marginBottom: 7, paddingBottom: 5 },
  firm: { fontSize: 12, fontWeight: 700 },
  meta: { color: "#4a5a6b", fontSize: 6.5 },
  title: { fontSize: 10, fontWeight: 700, textAlign: "right" },
  band: { flexDirection: "row", gap: 5, marginBottom: 6 },
  stat: { border: "1 solid #c6d0da", flexGrow: 1, flexBasis: 0, padding: "4 5" },
  statLabel: { color: "#5a6a7a", fontSize: 5.6, letterSpacing: 0.4, textTransform: "uppercase" },
  statValue: { fontSize: 9.5, fontWeight: 700, marginTop: 1 },
  statLoss: { color: "#b4232b" },
  statSub: { color: "#6a7886", fontSize: 5.6 },
  columns: { flexDirection: "row", gap: 6 },
  column: { flexGrow: 1, flexBasis: 0 },
  section: { marginBottom: 6 },
  sectionTitle: { backgroundColor: "#eef2f6", borderLeft: "2 solid #16212d", fontSize: 6.8, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2, padding: "3 4", textTransform: "uppercase" },
  table: { border: "0.5 solid #c6d0da" },
  row: { borderBottom: "0.4 solid #dfe5ec", flexDirection: "row", minHeight: 10 },
  head: { backgroundColor: "#16212d", color: "#ffffff" },
  total: { backgroundColor: "#eef2f6", borderTop: "1 solid #16212d", flexDirection: "row", fontWeight: 700, minHeight: 11 },
  cell: { padding: "2.2 3" },
  loss: { color: "#b4232b" },
  alertBox: { backgroundColor: "#fdecec", border: "0.6 solid #d99a9e", marginBottom: 6, padding: 5 },
  alertTitle: { color: "#8f1d24", fontSize: 7, fontWeight: 700, marginBottom: 2 },
  alertLine: { color: "#8f1d24", fontSize: 6.4 },
  signRow: { borderTop: "0.5 solid #c6d0da", flexDirection: "row", gap: 20, justifyContent: "space-between", marginTop: 10, paddingTop: 22 },
  signBox: { borderTop: "0.5 solid #6a7886", flexGrow: 1, flexBasis: 0, paddingTop: 3 },
  footer: { bottom: 8, color: "#6a7886", fontSize: 5.6, left: 20, position: "absolute", right: 20, textAlign: "center" },
});

type Column = { label: string; width: string; align?: "left" | "right" };

function Table({ columns, rows, totals }: { columns: Column[]; rows: (string | { text: string; loss?: boolean })[][]; totals?: string[] }) {
  const render = (value: string | { text: string; loss?: boolean }, column: Column, key: string, variant: "body" | "head" | "total") => {
    const cell = typeof value === "string" ? { text: value } : value;
    return (
      <Text
        key={key}
        style={[
          styles.cell,
          { width: column.width, textAlign: column.align ?? "left" },
          ...(cell.loss && variant === "body" ? [styles.loss] : []),
        ]}
      >
        {cell.text}
      </Text>
    );
  };
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.head]}>{columns.map((column, index) => render(column.label, column, `h${index}`, "head"))}</View>
      {rows.map((row, rowIndex) => (
        <View style={styles.row} key={rowIndex} wrap={false}>
          {columns.map((column, index) => render(row[index] ?? "", column, `${rowIndex}-${index}`, "body"))}
        </View>
      ))}
      {totals ? <View style={styles.total}>{columns.map((column, index) => render(totals[index] ?? "", column, `t${index}`, "total"))}</View> : null}
    </View>
  );
}

const money = (value: string) => formatINR(value);
const qty = (value: string) => formatNumber(value);

export function DsrPdf({ report }: { report: DsrReport }) {
  const shortLabel = Number(report.totals.shortExcess) < 0 ? "Short" : Number(report.totals.shortExcess) > 0 ? "Excess" : "Short / excess";

  return (
    <Document title={`DSR ${report.date}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.firm}>{report.outlet.name}</Text>
            <Text style={styles.meta}>{report.outlet.address}</Text>
            <Text style={styles.meta}>
              {report.outlet.omc ? `${report.outlet.omc} · ` : ""}GSTIN {report.outlet.gstin || "—"}
            </Text>
          </View>
          <View>
            <Text style={styles.title}>DAILY SALES REPORT</Text>
            <Text style={[styles.meta, { textAlign: "right" }]}>{report.date}</Text>
          </View>
        </View>

        {/* ---- The headline numbers, the way the owner reads them --------- */}
        <View style={styles.band}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Sale litres</Text>
            <Text style={styles.statValue}>{qty(report.totals.litres)}</Text>
            <Text style={styles.statSub}>Testing {qty(report.totals.testingLitres)} L excluded</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Sale value</Text>
            <Text style={styles.statValue}>{money(report.totals.totalSale)}</Text>
            <Text style={styles.statSub}>Counter {money(report.totals.counterSale)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Collections</Text>
            <Text style={styles.statValue}>{money(report.totals.collections)}</Text>
            <Text style={styles.statSub}>Credit issued {money(report.totals.creditIssued)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>{shortLabel}</Text>
            <Text style={[styles.statValue, ...(Number(report.totals.shortExcess) < 0 ? [styles.statLoss] : [])]}>{money(report.totals.shortExcess)}</Text>
            <Text style={styles.statSub}>Against the day's sale</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Cash and bank</Text>
            <Text style={styles.statValue}>{money(report.totals.cashInHand)}</Text>
            <Text style={styles.statSub}>Opened at {money(report.totals.openingCash)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Outstanding</Text>
            <Text style={styles.statValue}>{money(report.totals.outstanding)}</Text>
            <Text style={styles.statSub}>All credit customers</Text>
          </View>
        </View>

        {report.alerts.length > 0 ? (
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>NEEDS ATTENTION</Text>
            {report.alerts.map((alert, index) => (
              <Text style={styles.alertLine} key={index}>
                • {alert}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.columns}>
          {/* ---- Left column ------------------------------------------- */}
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nozzle readings</Text>
              <Table
                columns={[
                  { label: "Sh", width: "13%" },
                  { label: "Noz", width: "11%" },
                  { label: "Product", width: "20%" },
                  { label: "Opening", width: "15%", align: "right" },
                  { label: "Closing", width: "15%", align: "right" },
                  { label: "Test", width: "9%", align: "right" },
                  { label: "Litres", width: "17%", align: "right" },
                ]}
                rows={report.nozzles.map((row) => [row.shift.slice(0, 5), row.nozzle, row.product, qty(row.opening), qty(row.closing), qty(row.testing), qty(row.litres)])}
                totals={["", "", "Total", "", "", qty(report.totals.testingLitres), qty(report.totals.litres)]}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sale by product</Text>
              <Table
                columns={[
                  { label: "Product", width: "40%" },
                  { label: "Litres", width: "20%", align: "right" },
                  { label: "Rate", width: "17%", align: "right" },
                  { label: "Amount", width: "23%", align: "right" },
                ]}
                rows={report.products.map((row) => [row.product, qty(row.litres), qty(row.rate), money(row.amount)])}
                totals={["Total", qty(report.totals.litres), "", money(report.totals.fuelSale)]}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Collections</Text>
              <Table
                columns={[
                  { label: "Mode", width: "60%" },
                  { label: "Amount", width: "40%", align: "right" },
                ]}
                rows={report.collections.map((row) => [row.mode, money(row.amount)])}
                totals={["Total collected", money(report.totals.collections)]}
              />
            </View>

            {report.decantations.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tanker receipts</Text>
                <Table
                  columns={[
                    { label: "Invoice", width: "22%" },
                    { label: "Tanker", width: "22%" },
                    { label: "Tank", width: "12%" },
                    { label: "Invoice L", width: "15%", align: "right" },
                    { label: "Received", width: "15%", align: "right" },
                    { label: "Loss", width: "14%", align: "right" },
                  ]}
                  rows={report.decantations.map((row) => [
                    row.invoiceNo,
                    row.vehicle,
                    row.tank,
                    qty(row.invoiceQty),
                    qty(row.received),
                    { text: qty(row.loss), loss: !row.withinAllowance },
                  ])}
                />
              </View>
            ) : null}
          </View>

          {/* ---- Right column ------------------------------------------ */}
          <View style={styles.column}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Salesman settlement</Text>
              <Table
                columns={[
                  { label: "Salesman", width: "30%" },
                  { label: "Sale", width: "18%", align: "right" },
                  { label: "Cash", width: "17%", align: "right" },
                  { label: "Credit", width: "17%", align: "right" },
                  { label: "Short/exc", width: "18%", align: "right" },
                ]}
                rows={report.settlements.map((row) => [
                  row.salesman,
                  money(row.saleValue),
                  money(row.cash),
                  money(row.credit),
                  { text: money(row.shortExcess), loss: Number(row.shortExcess) < 0 },
                ])}
                totals={["Total", money(report.totals.totalSale), "", money(report.totals.creditIssued), money(report.totals.shortExcess)]}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Dip and density</Text>
              <Table
                columns={[
                  { label: "Tank", width: "12%" },
                  { label: "Product", width: "22%" },
                  { label: "Open L", width: "17%", align: "right" },
                  { label: "Close L", width: "17%", align: "right" },
                  { label: "Water mm", width: "16%", align: "right" },
                  { label: "Dens@15", width: "16%", align: "right" },
                ]}
                rows={report.dips.map((row) => [
                  row.tank,
                  row.product,
                  qty(row.openingLitres),
                  qty(row.closingLitres),
                  row.waterMm,
                  { text: row.density, loss: !row.densityOk },
                ])}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Stock variation</Text>
              <Table
                columns={[
                  { label: "Tank", width: "11%" },
                  { label: "Open", width: "15%", align: "right" },
                  { label: "Receipt", width: "14%", align: "right" },
                  { label: "Sale", width: "14%", align: "right" },
                  { label: "Book", width: "15%", align: "right" },
                  { label: "Dip", width: "15%", align: "right" },
                  { label: "Var", width: "16%", align: "right" },
                ]}
                rows={report.variations.map((row) => [
                  row.tank,
                  qty(row.opening),
                  qty(row.receipts),
                  qty(row.sales),
                  qty(row.book),
                  qty(row.physical),
                  { text: qty(row.variation), loss: !row.withinAllowance },
                ])}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cash position</Text>
              <Table
                columns={[
                  { label: "Particulars", width: "62%" },
                  { label: "Amount", width: "38%", align: "right" },
                ]}
                rows={[
                  ["Cash and bank at start of day", money(report.totals.openingCash)],
                  ["Total sale value for the day", money(report.totals.totalSale)],
                  ["Collected other than cash", money(String(Number(report.totals.collections) - Number(report.collections.find((row) => row.mode === "Cash")?.amount ?? 0)))],
                  [shortLabel, { text: money(report.totals.shortExcess), loss: Number(report.totals.shortExcess) < 0 }],
                ]}
                totals={["Cash and bank at close", money(report.totals.cashInHand)]}
              />
            </View>
          </View>
        </View>

        <View style={styles.signRow}>
          <Text style={styles.signBox}>Prepared by</Text>
          <Text style={styles.signBox}>Manager</Text>
          <Text style={styles.signBox}>Owner's signature</Text>
        </View>

        <Text style={styles.footer} fixed>
          Daily Sales Report · {report.outlet.name} · {report.date} · generated {report.preparedAt} · figures agree with the posted ledger
        </Text>
      </Page>
    </Document>
  );
}
