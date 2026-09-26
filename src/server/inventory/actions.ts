"use server";

import { InspectionResult } from "@prisma/client";
import { Decimal } from "@/lib/money";
import { businessDateFromInput, businessDateToday } from "@/lib/date";
import { withAudit } from "@/server/audit";
import { db } from "@/server/db";
import { requirePermission, requireUnlockedDate } from "@/server/guard";
import { recordStockMovement, auditJson } from "@/server/pump/services";
import { postVoucher, resolveAccount } from "@/server/accounts/posting";
import { settingDefinition } from "@/server/settings";
import { revalidatePath } from "next/cache";
import {
  batchMovementSchema,
  batchSchema,
  costingMethodSchema,
  inspectionSchema,
} from "@/server/inventory/schemas";

type Result<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
const fail = (error: unknown): Result<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : "Nothing was saved",
});

export async function saveBatch(payload: unknown): Promise<Result> {
  const parsed = batchSchema.safeParse(payload);
  if (!parsed.success)
    return {
      ok: false,
      error: "Correct the batch details",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  try {
    await requirePermission("INVENTORY", parsed.data.id ? "modify" : "add");
    const { outletId, session } = await requireUnlockedDate();
    const product = await db.product.findFirstOrThrow({
      where: {
        id: parsed.data.productId,
        outletId,
        isActive: true,
        isFuel: false,
      },
    });
    const existing = parsed.data.id
      ? await db.inventoryBatch.findFirstOrThrow({
          where: { id: parsed.data.id, outletId },
        })
      : null;
    const id = await withAudit(
      {
        outletId,
        tableName: "inventory_batches",
        recordId: existing?.id ?? "new",
        action: existing ? "UPDATE" : "CREATE",
        oldValue: existing ? auditJson(existing) : undefined,
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        const data = {
          productId: product.id,
          batchNo: parsed.data.batchNo,
          mrp: parsed.data.mrp ? new Decimal(parsed.data.mrp) : null,
          purchaseRate: new Decimal(parsed.data.purchaseRate),
          manufacturedOn: parsed.data.manufacturedOn
            ? businessDateFromInput(parsed.data.manufacturedOn)
            : null,
          expiryDate: parsed.data.expiryDate
            ? businessDateFromInput(parsed.data.expiryDate)
            : null,
          barcode: parsed.data.barcode,
          createdById: session.user.id,
        };
        const row = existing
          ? await tx.inventoryBatch.update({ where: { id: existing.id }, data })
          : await tx.inventoryBatch.create({ data: { ...data, outletId } });
        return row.id;
      },
    );
    revalidatePath("/inventory/batches");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function postBatchMovement(payload: unknown): Promise<Result> {
  const parsed = batchMovementSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, error: "Correct the stock movement" };
  try {
    await requirePermission("INVENTORY", "modify");
    const date = businessDateFromInput(parsed.data.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const batch = await db.inventoryBatch.findFirstOrThrow({
      where: { id: parsed.data.batchId, outletId, isActive: true },
      include: { product: true, movements: { where: { isCancelled: false } } },
    });
    const available = batch.movements.reduce(
      (sum, row) => sum.plus(row.quantity.toString()),
      new Decimal(0),
    );
    const quantity = new Decimal(parsed.data.quantity);
    if (parsed.data.direction === "OUT" && quantity.gt(available))
      return {
        ok: false,
        error: `Only ${available.toFixed(2)} units are available in this batch`,
      };
    const id = await withAudit(
      {
        outletId,
        tableName: "stock_movements",
        recordId: "new",
        action: "CREATE",
        businessDate: date,
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        const signed =
          parsed.data.direction === "IN" ? quantity : quantity.negated();
        const rate = new Decimal(batch.purchaseRate.toString());
        const movement = await recordStockMovement(tx, {
          outletId,
          productId: batch.productId,
          businessDate: date,
          type: "ADJUSTMENT",
          quantity: signed,
          rate,
          sourceType: "inventory_batches",
          sourceId: batch.id,
          remarks: parsed.data.remarks,
          createdById: session.user.id,
          batchId: batch.id,
        });
        const stock = await resolveAccount(
          tx,
          outletId,
          "STOCK_IN_TRADE",
          "FUEL_STOCK",
        );
        const adjustment = await resolveAccount(
          tx,
          outletId,
          "STOCK_LOSS",
          "EVAP",
        );
        const value = quantity
          .mul(rate)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        await postVoucher(tx, {
          outletId,
          type: "STOCK_ADJUSTMENT",
          businessDate: date,
          narration: `${batch.product.name} batch ${batch.batchNo}: ${parsed.data.remarks}`,
          createdById: session.user.id,
          lines:
            parsed.data.direction === "IN"
              ? [
                  {
                    accountId: stock.id,
                    debit: value,
                    productId: batch.productId,
                    quantity,
                  },
                  { accountId: adjustment.id, credit: value },
                ]
              : [
                  { accountId: adjustment.id, debit: value },
                  {
                    accountId: stock.id,
                    credit: value,
                    productId: batch.productId,
                    quantity,
                  },
                ],
        });
        return movement.id;
      },
    );
    revalidatePath("/inventory/batches");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function saveCostingMethod(payload: unknown): Promise<Result> {
  const parsed = costingMethodSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Choose a costing method" };
  try {
    await requirePermission("SETTINGS", "modify");
    const { outletId, session } = await requireUnlockedDate();
    const definition = settingDefinition("stock.costingMethod");
    await withAudit(
      {
        outletId,
        tableName: "settings",
        recordId: definition.key,
        action: "SETTING_CHANGE",
        newValue: auditJson(parsed.data),
      },
      (tx) =>
        tx.setting.upsert({
          where: { outletId_key: { outletId, key: definition.key } },
          create: {
            outletId,
            key: definition.key,
            value: parsed.data.method,
            defaultValue: definition.defaultValue,
            valueType: definition.valueType,
            label: definition.label,
            description: definition.description,
            group: definition.group,
            updatedById: session.user.id,
          },
          update: { value: parsed.data.method, updatedById: session.user.id },
        }),
    );
    revalidatePath("/inventory/profit");
    return { ok: true, id: outletId };
  } catch (error) {
    return fail(error);
  }
}

export async function saveInspection(payload: unknown): Promise<Result> {
  const parsed = inspectionSchema.safeParse(payload);
  if (!parsed.success)
    return {
      ok: false,
      error: "Correct the inspection report",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  try {
    await requirePermission("INVENTORY", parsed.data.id ? "modify" : "add");
    const date = businessDateFromInput(parsed.data.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const existing = parsed.data.id
      ? await db.inspection.findFirstOrThrow({
          where: { id: parsed.data.id, outletId },
          include: { items: true, photos: true },
        })
      : null;
    const result: InspectionResult = parsed.data.items.some(
      (item) => item.result === "FAIL",
    )
      ? "FAIL"
      : parsed.data.items.some((item) => item.observation)
        ? "PASS_WITH_OBSERVATIONS"
        : "PASS";
    const id = await withAudit(
      {
        outletId,
        tableName: "inspections",
        recordId: existing?.id ?? "new",
        action: existing ? "UPDATE" : "CREATE",
        businessDate: date,
        oldValue: existing ? auditJson(existing) : undefined,
        newValue: auditJson(parsed.data),
      },
      async (tx) => {
        const data = {
          type: parsed.data.type,
          businessDate: date,
          inspectorName: parsed.data.inspectorName,
          inspectorDesignation: parsed.data.inspectorDesignation,
          organisation: parsed.data.organisation,
          authority: parsed.data.organisation,
          referenceNo: parsed.data.referenceNo,
          observations: parsed.data.observations,
          correctiveAction: parsed.data.correctiveAction,
          correctiveActionDueDate: parsed.data.correctiveActionDueDate
            ? businessDateFromInput(parsed.data.correctiveActionDueDate)
            : null,
          followUpDate: parsed.data.correctiveActionDueDate
            ? businessDateFromInput(parsed.data.correctiveActionDueDate)
            : null,
          signatureUrl: parsed.data.signatureUrl,
          result,
          completedAt: new Date(),
          createdById: session.user.id,
        };
        const report = existing
          ? await tx.inspection.update({ where: { id: existing.id }, data })
          : await tx.inspection.create({ data: { ...data, outletId } });
        for (const item of parsed.data.items)
          await tx.inspectionItem.upsert({
            where: {
              inspectionId_code: { inspectionId: report.id, code: item.code },
            },
            create: {
              ...item,
              outletId,
              inspectionId: report.id,
              measuredValue: item.measuredValue
                ? new Decimal(item.measuredValue)
                : null,
              expectedValue: item.expectedValue
                ? new Decimal(item.expectedValue)
                : null,
            },
            update: {
              ...item,
              measuredValue: item.measuredValue
                ? new Decimal(item.measuredValue)
                : null,
              expectedValue: item.expectedValue
                ? new Decimal(item.expectedValue)
                : null,
            },
          });
        for (const photo of parsed.data.photos)
          if (!existing?.photos.some((row) => row.url === photo.url))
            await tx.inspectionPhoto.create({
              data: {
                outletId,
                inspectionId: report.id,
                url: photo.url,
                caption: photo.caption,
              },
            });
        return report.id;
      },
    );
    revalidatePath("/inventory/inspections");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}
