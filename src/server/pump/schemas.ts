import { z } from "zod";

const optionalText = z.string().trim().optional().transform((value) => value || undefined);
const requiredText = z.string().trim().min(1, "Required");
const decimalText = z.string().trim().regex(/^-?\d+(\.\d+)?$/, "Enter a valid number");
const optionalDecimal = z.string().trim().regex(/^$|^-?\d+(\.\d+)?$/, "Enter a valid number").optional().transform((value) => value || undefined);
const positiveDecimal = decimalText.refine((value) => Number(value) > 0, "Must be greater than zero");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

// ---------------------------------------------------------------------------
// Shift entry / meter readings
// ---------------------------------------------------------------------------

export const nozzleReadingSchema = z.object({
  nozzleId: requiredText,
  rateSegment: z.number().int().min(1).default(1),
  /** Carried from the previous shift; sent back only so the server can verify it. */
  openingReading: decimalText,
  closingReading: decimalText,
  testingLitres: decimalText.default("0"),
  meterRollover: z.boolean().default(false),
  salesmanEmployeeId: optionalText,
  outOfService: z.boolean().default(false),
  outOfServiceReason: optionalText,
  remarks: optionalText,
});

export const shiftEntrySchema = z
  .object({
    id: optionalText,
    businessDate: isoDate,
    shiftId: requiredText,
    cashierEmployeeId: optionalText,
    openingFloat: decimalText.default("0"),
    counterSaleAmount: decimalText.default("0"),
    remarks: optionalText,
    readings: z.array(nozzleReadingSchema).min(1, "Enter at least one nozzle reading"),
  })
  .superRefine((value, ctx) => {
    for (const [index, reading] of value.readings.entries()) {
      if (reading.outOfService && !reading.outOfServiceReason) {
        ctx.addIssue({ code: "custom", path: ["readings", index, "outOfServiceReason"], message: "Say why the nozzle was taken out of service" });
      }
    }
    const seen = new Set<string>();
    for (const [index, reading] of value.readings.entries()) {
      const key = `${reading.nozzleId}:${reading.rateSegment}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["readings", index, "nozzleId"], message: "This nozzle already has a reading for this rate segment" });
      seen.add(key);
    }
  });

export const approveRolloverSchema = z.object({ readingId: requiredText, approve: z.boolean(), reason: optionalText });

// ---------------------------------------------------------------------------
// Salesman settlement
// ---------------------------------------------------------------------------

export const collectionSchema = z.object({
  kind: z.enum(["CASH", "CARD", "UPI", "WALLET", "FLEET_CARD", "COUPON", "CREDIT", "OWN_USE", "STAFF_VEHICLE", "EXPENSE", "OTHER"]),
  paymentModeId: optionalText,
  amount: decimalText,
  machineOrWallet: optionalText,
  referenceNo: optionalText,
  cardLast4: optionalText,
  customerId: optionalText,
  vehicleId: optionalText,
  slipNo: optionalText,
  productId: optionalText,
  quantity: optionalDecimal,
  expenseHeadId: optionalText,
  voucherRef: optionalText,
  narration: optionalText,
});

export const settlementSchema = z
  .object({
    shiftEntryId: requiredText,
    employeeId: requiredText,
    counterSaleAmount: decimalText.default("0"),
    declaredCash: decimalText.default("0"),
    /** { "500": 12, "200": 4, ... } */
    denominations: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
    coinsAmount: decimalText.default("0"),
    /** Set only after the user has seen and accepted the counting difference. */
    differenceAcknowledged: z.boolean().default(false),
    differenceNote: optionalText,
    remarks: optionalText,
    collections: z.array(collectionSchema).default([]),
  })
  .superRefine((value, ctx) => {
    for (const [index, collection] of value.collections.entries()) {
      if (collection.kind === "CREDIT" && !collection.customerId) {
        ctx.addIssue({ code: "custom", path: ["collections", index, "customerId"], message: "A credit sale needs a customer" });
      }
      if (collection.kind === "CREDIT" && !collection.slipNo) {
        ctx.addIssue({ code: "custom", path: ["collections", index, "slipNo"], message: "Enter the credit slip number" });
      }
      if (["CARD", "UPI", "WALLET", "FLEET_CARD"].includes(collection.kind) && !collection.referenceNo) {
        ctx.addIssue({ code: "custom", path: ["collections", index, "referenceNo"], message: "Enter the settlement reference" });
      }
      if (collection.kind === "EXPENSE" && !collection.expenseHeadId) {
        ctx.addIssue({ code: "custom", path: ["collections", index, "expenseHeadId"], message: "Choose an expense head" });
      }
    }
  });

// ---------------------------------------------------------------------------
// Dip and density
// ---------------------------------------------------------------------------

export const dipReadingSchema = z.object({
  id: optionalText,
  tankId: requiredText,
  shiftEntryId: optionalText,
  businessDate: isoDate,
  readingType: z.enum(["OPENING", "CLOSING", "PRE_DECANT", "POST_DECANT", "SPOT_CHECK"]),
  fuelDipMm: decimalText,
  waterDipMm: decimalText.default("0"),
  temperatureC: optionalDecimal,
  measuredByEmployeeId: optionalText,
  remarks: optionalText,
});

export const densityReadingSchema = z.object({
  id: optionalText,
  tankId: requiredText,
  shiftEntryId: optionalText,
  businessDate: isoDate,
  observedDensity: positiveDecimal,
  temperatureC: decimalText,
  measuredByEmployeeId: optionalText,
  remarks: optionalText,
});

// ---------------------------------------------------------------------------
// Purchase / decantation
// ---------------------------------------------------------------------------

export const decantationLineSchema = z.object({
  productId: requiredText,
  tankId: requiredText,
  compartmentNo: optionalText,
  invoiceQty: positiveDecimal,
  rate: decimalText,
  invoiceDensity: optionalDecimal,
  invoiceTemperatureC: optionalDecimal,
  receiptDensity: optionalDecimal,
  receiptTemperatureC: optionalDecimal,
  dipBeforeMm: decimalText,
  dipAfterMm: decimalText,
  sealNoTop: optionalText,
  sealNoBottom: optionalText,
});

export const purchaseSchema = z.object({
  id: optionalText,
  supplierId: requiredText,
  businessDate: isoDate,
  invoiceNo: requiredText,
  invoiceDate: isoDate,
  depot: optionalText,
  vehicleNo: requiredText,
  driverName: optionalText,
  transporterName: optionalText,
  timeIn: optionalText,
  timeOut: optionalText,
  sealNoIntact: z.boolean().default(true),
  supervisedByEmployeeId: optionalText,
  dutiesAmount: decimalText.default("0"),
  cgstAmount: decimalText.default("0"),
  sgstAmount: decimalText.default("0"),
  igstAmount: decimalText.default("0"),
  vatAmount: decimalText.default("0"),
  tcsAmount: decimalText.default("0"),
  freightAmount: decimalText.default("0"),
  otherCharges: decimalText.default("0"),
  discount: decimalText.default("0"),
  roundOff: decimalText.default("0"),
  remarks: optionalText,
  lines: z.array(decantationLineSchema).min(1, "A tanker must carry at least one compartment"),
});

// ---------------------------------------------------------------------------
// Stock variation, reminders, samples
// ---------------------------------------------------------------------------

export const stockVariationSchema = z.object({
  businessDate: isoDate,
  tankId: requiredText,
  shiftEntryId: optionalText,
  ownUseLitres: decimalText.default("0"),
  returnsLitres: decimalText.default("0"),
  remarks: optionalText,
});

export const reminderSchema = z.object({
  id: optionalText,
  title: requiredText,
  notes: optionalText,
  type: z.enum(["LICENCE_RENEWAL", "CALIBRATION_DUE", "INSURANCE_RENEWAL", "AMC_DUE", "STATUTORY_FILING", "CUSTOMER_FOLLOWUP", "CHEQUE_DUE", "OTHER"]),
  dueDate: isoDate,
  dueTime: z.string().regex(/^$|^\d{2}:\d{2}$/, "Use HH:mm").optional().transform((value) => value || undefined),
  repeat: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).default("NONE"),
  alertBefore: z.string().regex(/^\d+$/, "Enter a whole number of days").default("30"),
  amount: optionalDecimal,
  referenceNo: optionalText,
  customerId: optionalText,
  supplierId: optionalText,
  employeeId: optionalText,
  assignedToId: optionalText,
});

export const reminderActionSchema = z.object({
  id: requiredText,
  action: z.enum(["DONE", "SNOOZE", "CANCEL", "REOPEN"]),
  snoozedTill: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().transform((value) => value || undefined),
  note: optionalText,
});

export const sampleSchema = z.object({
  id: optionalText,
  businessDate: isoDate,
  productId: requiredText,
  tankId: optionalText,
  decantationId: optionalText,
  type: z.enum(["RETAINED_DECANTATION", "FILTER_PAPER", "DENSITY_CHECK", "AUTHORITY_DRAWN"]),
  quantity: positiveDecimal,
  tankerNo: optionalText,
  invoiceNo: optionalText,
  observedDensity: optionalDecimal,
  temperatureC: optionalDecimal,
  sealNo: optionalText,
  sealedBy: optionalText,
  drawnByEmployeeId: optionalText,
  witnessName: optionalText,
  retainedTill: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional().transform((value) => value || undefined),
  storageRef: optionalText,
  result: optionalText,
  remarks: optionalText,
});

export type NozzleReadingInput = z.infer<typeof nozzleReadingSchema>;
export type ShiftEntryInput = z.infer<typeof shiftEntrySchema>;
export type SettlementInput = z.infer<typeof settlementSchema>;
export type CollectionInput = z.infer<typeof collectionSchema>;
export type DipReadingInput = z.infer<typeof dipReadingSchema>;
export type DensityReadingInput = z.infer<typeof densityReadingSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type StockVariationInput = z.infer<typeof stockVariationSchema>;
export type ReminderInput = z.infer<typeof reminderSchema>;
export type SampleInput = z.infer<typeof sampleSchema>;
