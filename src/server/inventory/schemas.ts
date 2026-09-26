import { z } from "zod";

const id = z.string().cuid();
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);

export const batchSchema = z.object({
  id: id.optional(),
  productId: id,
  batchNo: z.string().trim().min(1),
  mrp: decimal.optional(),
  purchaseRate: decimal,
  manufacturedOn: optionalText,
  expiryDate: optionalText,
  barcode: optionalText,
});
export const batchMovementSchema = z.object({
  batchId: id,
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["IN", "OUT"]),
  quantity: decimal.refine((value) => value !== "0"),
  remarks: z.string().trim().min(3),
});
export const costingMethodSchema = z.object({
  method: z.enum(["WEIGHTED_AVERAGE", "FIFO"]),
});

export const inspectionItemSchema = z.object({
  code: z.string().min(1),
  category: z.string().min(1),
  label: z.string().min(1),
  result: z.enum(["PASS", "FAIL", "NOT_APPLICABLE"]),
  measuredValue: decimal.optional(),
  expectedValue: decimal.optional(),
  unit: optionalText,
  observation: optionalText,
  correctiveAction: optionalText,
  sortOrder: z.number().int(),
});
export const inspectionSchema = z.object({
  id: id.optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum([
    "OMC",
    "LEGAL_METROLOGY",
    "WEIGHTS_AND_MEASURES",
    "FIRE_SAFETY",
    "POLLUTION_CONTROL",
    "INTERNAL_AUDIT",
    "OTHER",
  ]),
  inspectorName: z.string().trim().min(2),
  inspectorDesignation: optionalText,
  organisation: optionalText,
  referenceNo: optionalText,
  observations: optionalText,
  correctiveAction: optionalText,
  correctiveActionDueDate: optionalText,
  signatureUrl: optionalText,
  items: z.array(inspectionItemSchema).min(1),
  photos: z
    .array(z.object({ url: z.string().min(1), caption: optionalText }))
    .default([]),
});
