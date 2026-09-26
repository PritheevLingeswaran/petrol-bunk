import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

export type InspectionPdfData = {
  outlet: { name: string; addressLine1: string | null; city: string | null };
  businessDate: string;
  type: string;
  inspectorName: string | null;
  inspectorDesignation: string | null;
  organisation: string | null;
  referenceNo: string | null;
  result: string;
  observations: string | null;
  correctiveAction: string | null;
  correctiveActionDueDate: string | null;
  signatureUrl: string | null;
  items: Array<{
    category: string;
    label: string;
    result: string;
    measuredValue: string | null;
    expectedValue: string | null;
    unit: string | null;
    observation: string | null;
    correctiveAction: string | null;
  }>;
  photos: Array<{ url: string; caption: string | null }>;
};

const s = StyleSheet.create({
  page: {
    color: "#17212b",
    fontFamily: "Helvetica",
    fontSize: 8.5,
    padding: 28,
  },
  head: { borderBottom: "2 solid #173b42", paddingBottom: 8 },
  firm: { fontSize: 14, fontWeight: 700 },
  muted: { color: "#64727f", fontSize: 7.5 },
  title: { fontSize: 12, fontWeight: 700, marginTop: 8 },
  meta: {
    border: "1 solid #b7c2cc",
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 10,
  },
  metaCell: { padding: 6, width: "33.33%" },
  label: { color: "#657480", fontSize: 6.5, textTransform: "uppercase" },
  value: { fontSize: 8.5, fontWeight: 700, marginTop: 2 },
  table: { border: "1 solid #aebac5" },
  row: {
    borderBottom: "0.5 solid #d6dde4",
    display: "flex",
    flexDirection: "row",
  },
  tableHead: { backgroundColor: "#12303d", color: "#fff", fontWeight: 700 },
  cell: { padding: 4 },
  result: { width: "12%" },
  item: { width: "36%" },
  reading: { width: "18%" },
  note: { width: "34%" },
  section: {
    backgroundColor: "#edf2f5",
    fontSize: 8,
    fontWeight: 700,
    padding: 4,
  },
  notes: { border: "1 solid #c6d0d9", marginTop: 10, padding: 7 },
  photoRow: { display: "flex", flexDirection: "row", gap: 8, marginTop: 10 },
  photo: { height: 90, objectFit: "cover", width: 140 },
  sign: { height: 52, objectFit: "contain", width: 130 },
  footer: {
    bottom: 14,
    color: "#687580",
    fontSize: 7,
    left: 28,
    position: "absolute",
    right: 28,
  },
});

export function InspectionPdf({ report }: { report: InspectionPdfData }) {
  let category = "";
  return (
    <Document title={`Inspection ${report.businessDate}`}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <Text style={s.firm}>{report.outlet.name}</Text>
          <Text style={s.muted}>
            {[report.outlet.addressLine1, report.outlet.city]
              .filter(Boolean)
              .join(", ")}
          </Text>
          <Text style={s.title}>Inspection report</Text>
        </View>
        <View style={s.meta}>
          {[
            ["Date", report.businessDate],
            ["Type", report.type.replaceAll("_", " ")],
            ["Result", report.result.replaceAll("_", " ")],
            ["Inspector", report.inspectorName ?? "—"],
            ["Designation", report.inspectorDesignation ?? "—"],
            ["Organisation", report.organisation ?? "—"],
            ["Reference", report.referenceNo ?? "—"],
          ].map(([label, value]) => (
            <View style={s.metaCell} key={label}>
              <Text style={s.label}>{label}</Text>
              <Text style={s.value}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={s.table}>
          <View style={[s.row, s.tableHead]}>
            <Text style={[s.cell, s.item]}>CHECKLIST ITEM</Text>
            <Text style={[s.cell, s.result]}>RESULT</Text>
            <Text style={[s.cell, s.reading]}>READING</Text>
            <Text style={[s.cell, s.note]}>OBSERVATION / ACTION</Text>
          </View>
          {report.items.map((item, index) => {
            const show = item.category !== category;
            category = item.category;
            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {show && <Text style={s.section}>{item.category}</Text>}
                <View style={s.row} wrap={false}>
                  <Text style={[s.cell, s.item]}>{item.label}</Text>
                  <Text style={[s.cell, s.result]}>
                    {item.result.replaceAll("_", " ")}
                  </Text>
                  <Text style={[s.cell, s.reading]}>
                    {item.measuredValue
                      ? `${item.measuredValue}${item.unit ? ` ${item.unit}` : ""}${item.expectedValue ? ` / ${item.expectedValue}` : ""}`
                      : "—"}
                  </Text>
                  <Text style={[s.cell, s.note]}>
                    {[item.observation, item.correctiveAction]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
        <View style={s.notes}>
          <Text style={s.label}>OBSERVATIONS</Text>
          <Text>{report.observations || "None"}</Text>
          <Text style={[s.label, { marginTop: 6 }]}>
            CORRECTIVE ACTION / DUE DATE
          </Text>
          <Text>
            {report.correctiveAction || "None"}
            {report.correctiveActionDueDate
              ? ` · Due ${report.correctiveActionDueDate}`
              : ""}
          </Text>
        </View>
        {report.photos.length > 0 && (
          <View style={s.photoRow}>
            {report.photos.slice(0, 3).map((photo) => (
              <View key={photo.url}>
                <Image src={photo.url} style={s.photo} />
                <Text style={s.muted}>
                  {photo.caption ?? "Inspection evidence"}
                </Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ alignItems: "flex-end", marginTop: 14 }}>
          {report.signatureUrl && (
            <Image src={report.signatureUrl} style={s.sign} />
          )}
          <Text style={s.muted}>Inspector signature</Text>
        </View>
        <Text
          fixed
          style={s.footer}
          render={({ pageNumber, totalPages }) =>
            `${report.outlet.name} · Inspection report · page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
