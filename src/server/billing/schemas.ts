import { z } from "zod";
import { Decimal } from "decimal.js";

const id = z.string().cuid();
const optionalId = z.union([id, z.literal("")]).optional().transform((value) => value || undefined);
const decimal = z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid non-negative decimal");
const optionalText = z.string().trim().optional().transform((value) => value || undefined);

export const billLineSchema = z.object({
  productId: id,
  quantity: decimal.refine((value) => value !== "0", "Quantity must be greater than zero"),
  discountPerUnit: decimal.default("0"),
});

export const billSchema = z.object({
  billType: z.enum(["CASH", "CREDIT", "COUNTER", "CREDIT_NOTE"]),
  invoiceKind: z.enum(["GST_INVOICE", "BILL_OF_SUPPLY"]),
  channel: z.enum(["DESKTOP", "MOBILE"]).default("DESKTOP"),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billedTime: z.string().regex(/^\d{2}:\d{2}$/),
  customerId: optionalId,
  vehicleId: optionalId,
  vehicleNo: optionalText,
  driverName: optionalText,
  salesmanEmployeeId: optionalId,
  nozzleId: optionalId,
  shiftEntryId: optionalId,
  paymentModeId: optionalId,
  paymentReference: optionalText,
  remarks: optionalText,
  clientRequestId: optionalText,
  originalBillId: optionalId,
  autoRoundOff: z.boolean().default(true),
  sendSms: z.boolean().default(false),
  sendEmail: z.boolean().default(false),
  creditOverrideReason: optionalText,
  lines: z.array(billLineSchema).min(1),
}).superRefine((value, context) => {
  if (value.billType === "CREDIT" && !value.customerId) context.addIssue({ code: "custom", path: ["customerId"], message: "Credit billing requires a registered customer" });
  if (value.billType === "CREDIT_NOTE" && !value.originalBillId) context.addIssue({ code: "custom", path: ["originalBillId"], message: "Choose the original bill" });
  if (value.billType !== "CREDIT" && value.billType !== "CREDIT_NOTE" && !value.paymentModeId) context.addIssue({ code: "custom", path: ["paymentModeId"], message: "Choose a payment mode" });
});

export const shortCreditSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  issuedTime: z.string().regex(/^\d{2}:\d{2}$/),
  customerId: optionalId,
  vehicleId: optionalId,
  customerName: z.string().trim().min(2),
  mobile: optionalText,
  vehicleNo: optionalText,
  driverName: optionalText,
  salesmanEmployeeId: id,
  nozzleId: id,
  shiftEntryId: id,
  productId: id,
  quantity: decimal.refine((value) => new Decimal(value).gt(0), "Quantity must be greater than zero"),
  remarks: optionalText,
});

export const resolveShortCreditSchema = z.object({
  id,
  resolution: z.enum(["CONVERT", "RECOVER", "WRITE_OFF"]),
  paymentModeId: optionalId,
  reason: z.string().trim().min(3),
}).superRefine((value, context) => { if (value.resolution === "RECOVER" && !value.paymentModeId) context.addIssue({ code: "custom", path: ["paymentModeId"], message: "Choose a recovery payment mode" }); });

export const cancellationSchema = z.object({ billId: id, reason: z.string().trim().min(5) });
export const cancellationApprovalSchema = z.object({ billId: id, approve: z.boolean(), reason: z.string().trim().min(3) });

export const consolidatedBillingSchema = z.object({
  customerId: id,
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(["DATE_WISE", "VEHICLE_WISE", "SLIP_WISE", "PRODUCT_WISE"]),
  invoiceKind: z.enum(["GST_INVOICE", "BILL_OF_SUPPLY"]),
  remarks: optionalText,
});

export const eInvoiceUpdateSchema = z.object({ billId: id, irn: z.string().trim().min(10), acknowledgementNo: z.string().trim().min(3), acknowledgementAt: z.string().datetime(), signedQr: z.string().trim().min(10) });
export const markPrintedSchema = z.object({ billIds: z.array(id).min(1), layout: z.enum(["THERMAL_80MM", "A5", "A4"]) });
export const billingSettingsSchema = z.object({
  blockOnLimitBreach: z.boolean(), blockOnOverdue: z.boolean(), autoRoundOff: z.boolean(), defaultPrintLayout: z.enum(["THERMAL_80MM", "A5", "A4"]),
  smsProvider: z.enum(["CONSOLE", "GENERIC_JSON"]), smsEndpoint: optionalText, smsApiKey: optionalText, smsSender: z.string().trim().min(2),
  emailProvider: z.enum(["CONSOLE", "GENERIC_JSON"]), emailEndpoint: optionalText, emailApiKey: optionalText, emailFrom: z.string().trim().min(3),
});
