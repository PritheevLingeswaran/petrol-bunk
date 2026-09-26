import { Decimal, round2, round4 } from "@/lib/money";

export type TaxTreatment = "INTRA_STATE" | "INTER_STATE" | "EXEMPT";

export type BillLineInput = {
  productId: string;
  quantity: Decimal.Value;
  rate: Decimal.Value;
  discountPerUnit?: Decimal.Value;
  gstPct?: Decimal.Value;
  cessPct?: Decimal.Value;
  taxTreatment: TaxTreatment;
};

export type ComputedBillLine = {
  productId: string;
  quantity: Decimal;
  rate: Decimal;
  discountPerUnit: Decimal;
  discount: Decimal;
  taxableValue: Decimal;
  gstPct: Decimal;
  cgstPct: Decimal;
  cgstAmount: Decimal;
  sgstPct: Decimal;
  sgstAmount: Decimal;
  igstPct: Decimal;
  igstAmount: Decimal;
  gstAmount: Decimal;
  cessPct: Decimal;
  cessAmount: Decimal;
  amount: Decimal;
};

export function computeBillLine(input: BillLineInput): ComputedBillLine {
  const quantity = round2(input.quantity);
  const rate = round2(input.rate);
  const discountPerUnit = round2(input.discountPerUnit ?? 0);
  const gstPct = new Decimal(input.gstPct ?? 0);
  const cessPct = new Decimal(input.cessPct ?? 0);
  if (quantity.lte(0)) throw new Error("Quantity must be greater than zero");
  if (rate.lt(0) || discountPerUnit.lt(0)) throw new Error("Rate and discount cannot be negative");
  const gross = quantity.mul(rate);
  const discount = round2(quantity.mul(discountPerUnit));
  const taxableValue = round2(gross.minus(discount));
  if (taxableValue.lt(0)) throw new Error("Discount cannot exceed the line value");
  const gstAmount = input.taxTreatment === "EXEMPT" ? new Decimal(0) : round2(taxableValue.mul(gstPct).div(100));
  const cessAmount = input.taxTreatment === "EXEMPT" ? new Decimal(0) : round2(taxableValue.mul(cessPct).div(100));
  let cgstAmount = new Decimal(0);
  let sgstAmount = new Decimal(0);
  let igstAmount = new Decimal(0);
  let cgstPct = new Decimal(0);
  let sgstPct = new Decimal(0);
  let igstPct = new Decimal(0);
  if (input.taxTreatment === "INTRA_STATE") {
    cgstPct = round4(gstPct.div(2));
    sgstPct = round4(gstPct.minus(cgstPct));
    cgstAmount = round2(gstAmount.div(2));
    sgstAmount = round2(gstAmount.minus(cgstAmount));
  } else if (input.taxTreatment === "INTER_STATE") {
    igstPct = gstPct;
    igstAmount = gstAmount;
  }
  return {
    productId: input.productId,
    quantity,
    rate,
    discountPerUnit,
    discount,
    taxableValue,
    gstPct,
    cgstPct,
    cgstAmount,
    sgstPct,
    sgstAmount,
    igstPct,
    igstAmount,
    gstAmount,
    cessPct,
    cessAmount,
    amount: round2(taxableValue.plus(gstAmount).plus(cessAmount)),
  };
}

export type BillTotals = {
  subTotal: Decimal;
  discount: Decimal;
  taxableValue: Decimal;
  cgstAmount: Decimal;
  sgstAmount: Decimal;
  igstAmount: Decimal;
  gstAmount: Decimal;
  cessAmount: Decimal;
  roundOff: Decimal;
  grandTotal: Decimal;
};

export function computeBillTotals(lines: ComputedBillLine[], autoRoundOff: boolean): BillTotals {
  if (lines.length === 0) throw new Error("Add at least one product line");
  const sum = (pick: (line: ComputedBillLine) => Decimal) => lines.reduce((total, line) => total.plus(pick(line)), new Decimal(0));
  const subTotal = round2(lines.reduce((total, line) => total.plus(line.quantity.mul(line.rate)), new Decimal(0)));
  const discount = round2(sum((line) => line.discount));
  const taxableValue = round2(sum((line) => line.taxableValue));
  const cgstAmount = round2(sum((line) => line.cgstAmount));
  const sgstAmount = round2(sum((line) => line.sgstAmount));
  const igstAmount = round2(sum((line) => line.igstAmount));
  const gstAmount = round2(cgstAmount.plus(sgstAmount).plus(igstAmount));
  const cessAmount = round2(sum((line) => line.cessAmount));
  const beforeRoundOff = round2(taxableValue.plus(gstAmount).plus(cessAmount));
  const grandTotal = autoRoundOff ? beforeRoundOff.toDecimalPlaces(0, Decimal.ROUND_HALF_UP) : beforeRoundOff;
  return { subTotal, discount, taxableValue, cgstAmount, sgstAmount, igstAmount, gstAmount, cessAmount, roundOff: round2(grandTotal.minus(beforeRoundOff)), grandTotal: round2(grandTotal) };
}

const BELOW_TWENTY = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underHundred(value: bigint): string {
  if (value < 20n) return BELOW_TWENTY[Number(value)];
  const tens = value / 10n;
  const units = value % 10n;
  return `${TENS[Number(tens)]}${units ? ` ${BELOW_TWENTY[Number(units)]}` : ""}`;
}

function underThousand(value: bigint): string {
  const hundreds = value / 100n;
  const rest = value % 100n;
  return `${hundreds ? `${BELOW_TWENTY[Number(hundreds)]} Hundred` : ""}${hundreds && rest ? " " : ""}${rest ? underHundred(rest) : ""}`;
}

export function amountInIndianWords(value: Decimal.Value): string {
  const amount = round2(value);
  if (amount.lt(0)) throw new Error("Amount in words does not accept a negative value");
  const [rupeesText, paiseText = "00"] = amount.toFixed(2).split(".");
  let rupees = BigInt(rupeesText);
  if (rupees === 0n && BigInt(paiseText) === 0n) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = rupees / 10000000n;
  rupees %= 10000000n;
  const lakh = rupees / 100000n;
  rupees %= 100000n;
  const thousand = rupees / 1000n;
  rupees %= 1000n;
  if (crore) parts.push(`${amountWordsInteger(crore)} Crore`);
  if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
  if (rupees) parts.push(underThousand(rupees));
  const paise = BigInt(paiseText);
  return `${parts.join(" ") || "Zero"} Rupees${paise ? ` and ${underHundred(paise)} Paise` : ""} Only`;
}

function amountWordsInteger(value: bigint): string {
  if (value < 100n) return underHundred(value);
  if (value < 1000n) return underThousand(value);
  const higher = value / 1000n;
  const rest = value % 1000n;
  return `${amountWordsInteger(higher)} Thousand${rest ? ` ${underThousand(rest)}` : ""}`;
}

export type CreditDecision = { blocked: boolean; warnings: string[]; projectedOutstanding: Decimal };

export function evaluateCredit(input: { outstanding: Decimal.Value; billAmount: Decimal.Value; creditLimit: Decimal.Value; overdueAmount: Decimal.Value; blockLimit: boolean; blockOverdue: boolean }): CreditDecision {
  const projectedOutstanding = round2(new Decimal(input.outstanding).plus(input.billAmount));
  const warnings: string[] = [];
  let blocked = false;
  if (new Decimal(input.creditLimit).gt(0) && projectedOutstanding.gt(input.creditLimit)) {
    warnings.push(`Projected outstanding ${projectedOutstanding.toFixed(2)} exceeds the credit limit ${new Decimal(input.creditLimit).toFixed(2)}`);
    blocked = input.blockLimit;
  }
  if (new Decimal(input.overdueAmount).gt(0)) {
    warnings.push(`Customer has overdue invoices totalling ${new Decimal(input.overdueAmount).toFixed(2)}`);
    blocked = blocked || input.blockOverdue;
  }
  return { blocked, warnings, projectedOutstanding };
}

export type EInvoiceValidationInput = { supplierGstin?: string | null; supplierLegalName?: string | null; supplierAddress?: string | null; supplierLocation?: string | null; supplierPincode?: string | null; supplierStateCode?: string | null; documentNumber?: string | null; documentDate?: string | null; buyerGstin?: string | null; buyerLegalName?: string | null; buyerAddress?: string | null; buyerLocation?: string | null; buyerPincode?: string | null; buyerStateCode?: string | null; lines: { hsnCode?: string | null; quantity: string; taxableValue: string; gstPct: string }[] };

export function validateEInvoice(input: EInvoiceValidationInput): string[] {
  const missing: string[] = [];
  const required = [["Supplier GSTIN", input.supplierGstin], ["Supplier legal name", input.supplierLegalName], ["Supplier address line 1", input.supplierAddress], ["Supplier location", input.supplierLocation], ["Supplier pincode", input.supplierPincode], ["Supplier state code", input.supplierStateCode], ["Document number", input.documentNumber], ["Document date", input.documentDate], ["Buyer GSTIN", input.buyerGstin], ["Buyer legal name", input.buyerLegalName], ["Buyer address line 1", input.buyerAddress], ["Buyer location", input.buyerLocation], ["Buyer pincode", input.buyerPincode], ["Buyer state code / place of supply", input.buyerStateCode]] as const;
  for (const [label, value] of required) if (!value?.trim()) missing.push(label);
  if (input.lines.length === 0) missing.push("At least one item line");
  input.lines.forEach((line, index) => {
    if (!line.hsnCode?.trim()) missing.push(`Line ${index + 1}: HSN code`);
    if (new Decimal(line.quantity).lte(0)) missing.push(`Line ${index + 1}: quantity`);
    if (new Decimal(line.taxableValue).lt(0)) missing.push(`Line ${index + 1}: taxable value`);
  });
  return missing;
}
