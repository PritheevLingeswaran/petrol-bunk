import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { InspectionPdf } from "../src/server/inventory/pdf";
import { PayslipPdf } from "../src/server/payroll/pdf";

describe("Phase 6 printable documents", () => {
  it("renders an inspection report PDF", async () => {
    const buffer = (await renderToBuffer(
      <InspectionPdf
        report={{
          outlet: {
            name: "Fuel Centre",
            addressLine1: "GST Road",
            city: "Chennai",
          },
          businessDate: "2026-09-23",
          type: "OMC",
          inspectorName: "V. Srinivasan",
          inspectorDesignation: "Territory Manager",
          organisation: "IOCL",
          referenceNo: "INS-1",
          result: "PASS",
          observations: "All satisfactory",
          correctiveAction: null,
          correctiveActionDueDate: null,
          signatureUrl: null,
          photos: [],
          items: [
            {
              category: "Dispensing",
              label: "Nozzle accuracy against 5 L measure",
              result: "PASS",
              measuredValue: "10.00",
              expectedValue: "0.00",
              unit: "ml",
              observation: null,
              correctiveAction: null,
            },
          ],
        }}
      />,
    )) as Buffer;
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1500);
  });
  it("renders an employee payslip PDF", async () => {
    const buffer = (await renderToBuffer(
      <PayslipPdf
        slips={[
          {
            outlet: {
              name: "Fuel Centre",
              addressLine1: "GST Road",
              city: "Chennai",
            },
            month: "2026-09",
            employee: {
              code: "EMP003",
              name: "R. Kumar",
              designation: "Salesman",
              accountNumber: "10000003",
              bankName: "State Bank of India",
              panNumber: null,
            },
            daysPresent: "25.00",
            daysAbsent: "1.00",
            daysPayable: "26.00",
            overtimeHours: "4.00",
            grossEarnings: "24500.00",
            totalDeductions: "3010.00",
            advanceRecovery: "500.00",
            shortRecovery: "0.00",
            netPay: "21490.00",
            components: [
              { name: "Basic salary", type: "EARNING", amount: "18000.00" },
              { name: "Provident fund", type: "DEDUCTION", amount: "2160.00" },
            ],
            isPaid: false,
          },
        ]}
      />,
    )) as Buffer;
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1500);
  });
});
