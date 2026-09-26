import { z } from "zod";

const optionalText = z.string().trim().optional().transform((value) => value || undefined);
const requiredText = z.string().trim().min(1, "Required");
const amountText = z.string().trim().regex(/^$|^\d+(\.\d{1,2})?$/, "Enter an amount").default("0");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const optionalDate = z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().transform((value) => value || undefined);

export const VOUCHER_TYPES = ["RECEIPT", "PAYMENT", "JOURNAL", "CONTRA", "SALES", "PURCHASE", "CREDIT_NOTE", "DEBIT_NOTE"] as const;
export const INSTRUMENT_TYPES = ["CASH", "CHEQUE", "DD", "NEFT", "RTGS", "IMPS", "UPI", "CARD", "ADJUSTMENT", "OTHER"] as const;

export const voucherLineSchema = z.object({
  accountId: requiredText,
  debit: amountText,
  credit: amountText,
  narration: optionalText,
  productId: optionalText,
  quantity: z.string().trim().regex(/^$|^-?\d+(\.\d{1,2})?$/).optional().transform((value) => value || undefined),
});

export const voucherSchema = z
  .object({
    id: optionalText,
    type: z.enum(VOUCHER_TYPES),
    businessDate: isoDate,
    narration: optionalText,
    partyAccountId: optionalText,
    instrumentType: z.enum(INSTRUMENT_TYPES).default("CASH"),
    instrumentNo: optionalText,
    instrumentDate: optionalDate,
    bankName: optionalText,
    attachments: z.array(z.object({ fileName: requiredText, url: requiredText, contentType: optionalText, sizeBytes: z.number().optional() })).default([]),
    lines: z.array(voucherLineSchema).min(2, "A voucher needs at least two lines"),
  })
  .superRefine((value, ctx) => {
    let debit = 0;
    let credit = 0;
    for (const [index, line] of value.lines.entries()) {
      const lineDebit = Number(line.debit || 0);
      const lineCredit = Number(line.credit || 0);
      if (lineDebit > 0 && lineCredit > 0) {
        ctx.addIssue({ code: "custom", path: ["lines", index, "debit"], message: "A line is either a debit or a credit, not both" });
      }
      if (lineDebit === 0 && lineCredit === 0) {
        ctx.addIssue({ code: "custom", path: ["lines", index, "debit"], message: "Enter an amount" });
      }
      debit += lineDebit;
      credit += lineCredit;
    }
    // The server re-checks this in Decimal; this is only so the user sees it
    // against the field rather than as a saved-then-rejected round trip.
    if (Math.abs(debit - credit) > 0.004) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: `Debit ${debit.toFixed(2)} does not equal credit ${credit.toFixed(2)}` });
    }
    // An instrument other than cash needs to say which instrument.
    if (["CHEQUE", "DD"].includes(value.instrumentType) && !value.instrumentNo) {
      ctx.addIssue({ code: "custom", path: ["instrumentNo"], message: "Enter the instrument number" });
    }
  });

export const cancelVoucherSchema = z.object({ id: requiredText, reason: z.string().trim().min(3, "Give a reason") });

export const reconcileSchema = z.object({
  lineIds: z.array(requiredText).min(1, "Select at least one entry"),
  clearedOn: isoDate,
  bankRef: optionalText,
  reconciled: z.boolean().default(true),
});

export type VoucherInput = z.infer<typeof voucherSchema>;
export type VoucherLineInput = z.infer<typeof voucherLineSchema>;
export type ReconcileInput = z.infer<typeof reconcileSchema>;
