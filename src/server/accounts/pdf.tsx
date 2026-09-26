import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";

/**
 * Renders the shared report shape into a PDF: repeated headers, right-aligned
 * tabular figures, and a ruled totals row that is always last on the page.
 */
export type { Cell, ReportColumn, ReportSection, ReportDoc } from "@/server/accounts/report-doc";
export { cell, moneyCell } from "@/server/accounts/report-doc";

import type { Cell as CellType, ReportColumn as ColumnType, ReportDoc as DocType } from "@/server/accounts/report-doc";

const styles = StyleSheet.create({
  page: { color: "#16212d", fontFamily: "Helvetica", fontSize: 8.5, paddingBottom: 38, paddingHorizontal: 26, paddingTop: 24 },
  header: { borderBottom: "1 solid #26384b", marginBottom: 10, paddingBottom: 7 },
  firm: { fontSize: 13, fontWeight: 700 },
  muted: { color: "#5e6c7b", fontSize: 7.5 },
  title: { fontSize: 11.5, fontWeight: 700, marginTop: 6 },
  subtitle: { color: "#5e6c7b", fontSize: 8 },
  banner: { borderRadius: 2, marginBottom: 8, padding: 6 },
  alert: { backgroundColor: "#fdecec", border: "1 solid #e5a3a3", color: "#8f1d24" },
  info: { backgroundColor: "#eef4f8", border: "1 solid #b9cddb", color: "#25506b" },
  sectionHeading: { backgroundColor: "#eef2f6", fontSize: 9, fontWeight: 700, marginTop: 8, padding: 4 },
  table: { border: "1 solid #aeb9c6", marginTop: 4 },
  headRow: { backgroundColor: "#0f2a3d", color: "#ffffff", display: "flex", flexDirection: "row" },
  row: { borderBottom: "0.5 solid #dde3ea", display: "flex", flexDirection: "row", minHeight: 15 },
  totalRow: { backgroundColor: "#eef2f6", borderTop: "1.5 solid #0f2a3d", display: "flex", flexDirection: "row", fontWeight: 700, minHeight: 17 },
  cellText: { paddingHorizontal: 4, paddingVertical: 3 },
  negative: { color: "#b4232b" },
  bold: { fontWeight: 700 },
  footer: { borderTop: "0.5 solid #cad2dc", bottom: 16, color: "#5e6c7b", fontSize: 7, left: 26, paddingTop: 5, position: "absolute", right: 26 },
});

function Row({ columns, cells, variant }: { columns: ColumnType[]; cells: CellType[]; variant: "head" | "body" | "total" }) {
  const rowStyle = variant === "head" ? styles.headRow : variant === "total" ? styles.totalRow : styles.row;
  return (
    <View style={rowStyle} wrap={false}>
      {columns.map((column, index) => {
        const value = cells[index] ?? { text: "" };
        return (
          <Text
            key={column.label + index}
            style={[
              styles.cellText,
              { width: column.width, textAlign: column.align ?? "left" },
              ...(value.bold || variant !== "body" ? [styles.bold] : []),
              ...(value.negative && variant !== "head" ? [styles.negative] : []),
              ...(value.indent ? [{ paddingLeft: 4 + value.indent * 10 }] : []),
            ]}
          >
            {value.text}
          </Text>
        );
      })}
    </View>
  );
}

export function ReportPdf({ doc }: { doc: DocType }) {
  return (
    <Document title={doc.title}>
      <Page size="A4" orientation={doc.landscape ? "landscape" : "portrait"} style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.firm}>{doc.outlet.name}</Text>
          {doc.outlet.address ? <Text style={styles.muted}>{doc.outlet.address}</Text> : null}
          {doc.outlet.gstin ? <Text style={styles.muted}>GSTIN: {doc.outlet.gstin}</Text> : null}
          <Text style={styles.title}>{doc.title}</Text>
          <Text style={styles.subtitle}>{doc.subtitle}</Text>
        </View>

        {doc.banner ? (
          <View style={[styles.banner, doc.banner.tone === "alert" ? styles.alert : styles.info]}>
            <Text>{doc.banner.text}</Text>
          </View>
        ) : null}

        {doc.sections.map((section, sectionIndex) => (
          <View key={sectionIndex}>
            {section.heading ? <Text style={styles.sectionHeading}>{section.heading}</Text> : null}
            <View style={styles.table}>
              {/* Repeated on every page, so a long report stays readable. */}
              <View fixed>
                <Row columns={section.columns} cells={section.columns.map((column) => ({ text: column.label }))} variant="head" />
              </View>
              {section.rows.map((row, rowIndex) => (
                <Row key={rowIndex} columns={section.columns} cells={row} variant="body" />
              ))}
              {section.totals ? <Row columns={section.columns} cells={section.totals} variant="total" /> : null}
            </View>
          </View>
        ))}

        {doc.footNote ? <Text style={[styles.muted, { marginTop: 10 }]}>{doc.footNote}</Text> : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${doc.title} · ${doc.subtitle} · generated ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date())} · page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
