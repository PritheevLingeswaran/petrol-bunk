import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatNumber } from "@/lib/format";

export type PayslipData = {
  outlet: { name: string; addressLine1: string | null; city: string | null };
  month: string;
  employee: {
    code: string;
    name: string;
    designation: string | null;
    accountNumber: string | null;
    bankName: string | null;
    panNumber: string | null;
  };
  daysPresent: string;
  daysAbsent: string;
  daysPayable: string;
  overtimeHours: string;
  grossEarnings: string;
  totalDeductions: string;
  advanceRecovery: string;
  shortRecovery: string;
  netPay: string;
  components: Array<{ name: string; type: string; amount: string }>;
  isPaid: boolean;
};
const formatPdfMoney = (value: string) => `INR ${formatNumber(value)}`;
const s = StyleSheet.create({
  page: { color: "#18232d", fontFamily: "Helvetica", fontSize: 9, padding: 28 },
  slip: { border: "1 solid #aab6c2", marginBottom: 16, padding: 14 },
  head: { borderBottom: "2 solid #173b42", paddingBottom: 7 },
  firm: { fontSize: 14, fontWeight: 700 },
  title: { fontSize: 11, fontWeight: 700, marginTop: 5 },
  muted: { color: "#687681", fontSize: 7.5 },
  meta: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 8,
  },
  metaCell: { paddingVertical: 3, width: "33.33%" },
  label: { color: "#65737f", fontSize: 6.5, textTransform: "uppercase" },
  value: { fontWeight: 700, marginTop: 1 },
  columns: { display: "flex", flexDirection: "row", gap: 8 },
  box: { border: "1 solid #c1cad2", flexGrow: 1 },
  boxTitle: { backgroundColor: "#edf2f5", fontWeight: 700, padding: 5 },
  row: {
    borderBottom: "0.5 solid #e0e5ea",
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 4,
  },
  net: {
    backgroundColor: "#12313b",
    color: "#fff",
    display: "flex",
    flexDirection: "row",
    fontSize: 11,
    fontWeight: 700,
    justifyContent: "space-between",
    marginTop: 9,
    padding: 7,
  },
  footer: { color: "#6b7882", fontSize: 7, marginTop: 8 },
});
export function PayslipPdf({ slips }: { slips: PayslipData[] }) {
  return (
    <Document title="Employee payslips">
      {slips.map((slip) => (
        <Page
          size="A4"
          style={s.page}
          key={`${slip.employee.code}-${slip.month}`}
        >
          <View style={s.slip}>
            <View style={s.head}>
              <Text style={s.firm}>{slip.outlet.name}</Text>
              <Text style={s.muted}>
                {[slip.outlet.addressLine1, slip.outlet.city]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
              <Text style={s.title}>PAYSLIP · {slip.month}</Text>
            </View>
            <View style={s.meta}>
              {[
                ["Employee", `${slip.employee.code} · ${slip.employee.name}`],
                ["Designation", slip.employee.designation ?? "—"],
                [
                  "Bank",
                  [slip.employee.bankName, slip.employee.accountNumber]
                    .filter(Boolean)
                    .join(" · ") || "—",
                ],
                ["Present days", slip.daysPresent],
                ["Absent days", slip.daysAbsent],
                ["Payable days", slip.daysPayable],
                ["Overtime hours", slip.overtimeHours],
                ["Payment status", slip.isPaid ? "PAID" : "UNPAID"],
              ].map(([label, value]) => (
                <View style={s.metaCell} key={label}>
                  <Text style={s.label}>{label}</Text>
                  <Text style={s.value}>{value}</Text>
                </View>
              ))}
            </View>
            <View style={s.columns}>
              <View style={s.box}>
                <Text style={s.boxTitle}>EARNINGS</Text>
                {slip.components
                  .filter((row) => row.type === "EARNING")
                  .map((row) => (
                    <View style={s.row} key={row.name}>
                      <Text>{row.name}</Text>
                      <Text>{formatPdfMoney(row.amount)}</Text>
                    </View>
                  ))}
                <View style={s.row}>
                  <Text>Gross earnings</Text>
                  <Text>{formatPdfMoney(slip.grossEarnings)}</Text>
                </View>
              </View>
              <View style={s.box}>
                <Text style={s.boxTitle}>DEDUCTIONS</Text>
                {slip.components
                  .filter((row) => row.type === "DEDUCTION")
                  .map((row) => (
                    <View style={s.row} key={row.name}>
                      <Text>{row.name}</Text>
                      <Text>{formatPdfMoney(row.amount)}</Text>
                    </View>
                  ))}
                <View style={s.row}>
                  <Text>Advance recovery</Text>
                  <Text>{formatPdfMoney(slip.advanceRecovery)}</Text>
                </View>
                <View style={s.row}>
                  <Text>Short & excess recovery</Text>
                  <Text>{formatPdfMoney(slip.shortRecovery)}</Text>
                </View>
                <View style={s.row}>
                  <Text>Total deductions</Text>
                  <Text>{formatPdfMoney(slip.totalDeductions)}</Text>
                </View>
              </View>
            </View>
            <View style={s.net}>
              <Text>NET PAY</Text>
              <Text>{formatPdfMoney(slip.netPay)}</Text>
            </View>
            <Text style={s.footer}>
              Computer-generated payslip. Salary effects are posted through the
              balanced journal and the employee ledger.
            </Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
