import { describe, expect, it } from "vitest";
import { amountInIndianWords, computeBillLine, computeBillTotals, evaluateCredit, validateEInvoice } from "../src/lib/billing";

describe("billing arithmetic", () => {
  it("splits intra-state GST without losing a paise", () => {
    const line = computeBillLine({ productId: "lube", quantity: "3", rate: "118.00", discountPerUnit: "8.00", gstPct: "18", taxTreatment: "INTRA_STATE" });
    expect(line.taxableValue.toFixed(2)).toBe("330.00");
    expect(line.cgstAmount.plus(line.sgstAmount).toFixed(2)).toBe("59.40");
    expect(line.amount.toFixed(2)).toBe("389.40");
  });

  it("computes the round-off only after all tax lines", () => {
    const line = computeBillLine({ productId: "x", quantity: "1", rate: "99.49", gstPct: "0", taxTreatment: "EXEMPT" });
    const totals = computeBillTotals([line], true);
    expect(totals.roundOff.toFixed(2)).toBe("-0.49");
    expect(totals.grandTotal.toFixed(2)).toBe("99.00");
  });

  it("uses Indian lakh and crore wording", () => {
    expect(amountInIndianWords("12345678.90")).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Ninety Paise Only");
  });

  it("blocks only according to configured credit policy", () => {
    const decision = evaluateCredit({ outstanding: "9000", billAmount: "1500", creditLimit: "10000", overdueAmount: "500", blockLimit: true, blockOverdue: false });
    expect(decision.blocked).toBe(true);
    expect(decision.warnings).toHaveLength(2);
  });

  it("names every missing e-invoice field", () => {
    const missing = validateEInvoice({ documentNumber: "INV-1", documentDate: "20/09/2026", lines: [{ quantity: "1", taxableValue: "100", gstPct: "18" }] });
    expect(missing).toContain("Supplier GSTIN");
    expect(missing).toContain("Buyer GSTIN");
    expect(missing).toContain("Line 1: HSN code");
  });
});
