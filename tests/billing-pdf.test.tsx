import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { InvoicePdf } from "@/server/billing/pdf";

type Props = Parameters<typeof InvoicePdf>[0];

describe("invoice PDF", () => {
  it("renders a valid A5 document with Indian-grouped values", async () => {
    const bill = {
      id: "bill-1", docNumber: "CSH-00001", invoiceKind: "BILL_OF_SUPPLY", status: "POSTED", businessDate: new Date("2026-09-20T00:00:00.000Z"), billedAt: new Date("2026-09-20T05:00:00.000Z"), customerName: "Walk-in customer", vehicleNo: "TN 01 AB 1234", driverName: "Kumar", amountInWords: "One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees Only", irn: null, acknowledgementNo: null, signedQr: null,
      taxableValue: "123456.00", cgstAmount: "0", sgstAmount: "0", igstAmount: "0", cessAmount: "0", roundOff: "0", totalAmount: "123456.00",
      outlet: { name: "Fuel Centre", addressLine1: "GST Road", city: "Chennai", state: "Tamil Nadu", pincode: "600001", gstin: "33AABCP1234A1Z5", firm: { legalName: "Fuel Centre Private Limited", name: "Fuel Centre", gstin: "33AABCP1234A1Z5", invoiceTerms: "Payment due.", declarationText: "Goods supplied as stated." } },
      customer: null, vehicle: null, salesman: { name: "Murugan" }, nozzle: { code: "N1" }, settlements: [{ paymentMode: { name: "Cash" } }],
      lines: [{ id: "line-1", lineNo: 1, description: null, quantity: "1200", rate: "102.88", gstAmount: "0", amount: "123456.00", hsnCode: "27101219", product: { name: "MS (Petrol)", hsnCode: "27101219" } }],
    };
    const element = InvoicePdf({ bills: [bill] as unknown as Props["bills"], layout: "A5", qrCodes: {} }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(element);
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(2_000);
  });
});
