"use server";

import { Prisma, type CollectionKind } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { Decimal, round2 } from "@/lib/money";
import { INDIA_TIMEZONE, businessDateFromInput } from "@/lib/date";
import {
  checkDensityAgainstInvoice,
  computeDecantation,
  computeNozzleSale,
  computeSettlement,
  computeStockVariation,
  correctVolumeTo15C,
  denominationTotal,
  densityAt15C,
  flagSaleVariance,
  PumpArithmeticError,
} from "@/lib/pump";
import { withAudit } from "@/server/audit";
import { requirePermission, requireUnlockedDate } from "@/server/guard";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import {
  auditJson,
  closingStockFor,
  costPerLitre,
  dipToNetLitres,
  issueNumber,
  openingStockFor,
  rateSegmentsFor,
  recordStockMovement,
  thirtyDayAverage,
} from "@/server/pump/services";
import { postDailyCogs, postPurchaseVoucher, postSettlementVoucher, postStockVariationVoucher } from "@/server/accounts/operations-posting";
import {
  approveRolloverSchema,
  densityReadingSchema,
  dipReadingSchema,
  purchaseSchema,
  reminderActionSchema,
  reminderSchema,
  sampleSchema,
  settlementSchema,
  shiftEntrySchema,
  stockVariationSchema,
} from "@/server/pump/schemas";

export type ActionResult<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const fail = (error: unknown): ActionResult<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : "Something went wrong. Nothing was saved.",
});

const dec = (value: string | undefined | null): Decimal => new Decimal(value ?? "0");
const localTimestamp = (businessDate: string, hhmm: string): Date => fromZonedTime(`${businessDate}T${hhmm}:00`, INDIA_TIMEZONE);

/** Shift window in UTC. A night shift that ends before it starts runs past midnight. */
function shiftWindow(businessDate: string, startTime: string, endTime: string) {
  const start = localTimestamp(businessDate, startTime);
  let end = localTimestamp(businessDate, endTime);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ===========================================================================
// 1. Shift entry / meter readings
// ===========================================================================

export type NozzleCard = {
  nozzleId: string;
  nozzleCode: string;
  nozzleName: string;
  dispensingUnit: string;
  tankCode: string;
  productId: string;
  productName: string;
  meterDigits: number;
  /** Carried from the previous shift's closing. Read-only in the UI. */
  openingReading: string;
  openingSource: "PREVIOUS_SHIFT" | "COMMISSIONING";
  previousReadingId: string | null;
  thirtyDayAverage: string;
  segments: { segment: number; rate: string; from: string; to: string }[];
};

export type ShiftEntryForm = {
  businessDate: string;
  shiftId: string;
  shiftName: string;
  existingId: string | null;
  status: string;
  locked: boolean;
  hasRateSplit: boolean;
  nozzles: NozzleCard[];
  saved: Record<string, { closingReading: string; testingLitres: string; salesmanEmployeeId: string; outOfService: boolean; outOfServiceReason: string; rateSegment: number }>;
};

/**
 * Everything the meter-reading screen needs: the opening reading carried from
 * the previous shift for every nozzle, the rate segments for the shift window,
 * and any readings already keyed in.
 */
export async function loadShiftEntryForm(businessDate: string, shiftId: string): Promise<ActionResult<{ form: ShiftEntryForm }>> {
  try {
    const access = await requirePermission("PUMP_OPERATIONS", "view");
    const { outletId } = await requireUnlockedDate(businessDateFromInput(businessDate));
    const date = businessDateFromInput(businessDate);

    const shift = await db.shift.findFirstOrThrow({ where: { id: shiftId, outletId } });
    const { start, end } = shiftWindow(businessDate, shift.startTime, shift.endTime);

    const [entry, nozzles] = await Promise.all([
      db.shiftEntry.findUnique({
        where: { outletId_businessDate_shiftId: { outletId, businessDate: date, shiftId } },
        include: { nozzleReadings: true },
      }),
      db.nozzle.findMany({
        where: { outletId, status: "ACTIVE" },
        include: { product: true, tank: true, dispensingUnit: true },
        orderBy: { code: "asc" },
      }),
    ]);

    const cards: NozzleCard[] = [];
    let hasRateSplit = false;
    for (const nozzle of nozzles) {
      // The opening reading is never typed: it is the closing of the last
      // reading on this nozzle, or the commissioning reading if there is none.
      const previous = await db.nozzleReading.findFirst({
        where: { nozzleId: nozzle.id, nextReading: null },
        orderBy: [{ businessDate: "desc" }, { rateSegment: "desc" }],
      });
      const segments = await rateSegmentsFor(nozzle.productId, start, end);
      if (segments.length > 1) hasRateSplit = true;

      cards.push({
        nozzleId: nozzle.id,
        nozzleCode: nozzle.code,
        nozzleName: nozzle.name,
        dispensingUnit: nozzle.dispensingUnit.code,
        tankCode: nozzle.tank.code,
        productId: nozzle.productId,
        productName: nozzle.product.name,
        meterDigits: nozzle.meterDigits,
        openingReading: (previous ? new Decimal(previous.closingReading.toString()) : new Decimal(nozzle.initialReading.toString())).toFixed(2),
        openingSource: previous ? "PREVIOUS_SHIFT" : "COMMISSIONING",
        previousReadingId: previous?.id ?? null,
        thirtyDayAverage: (await thirtyDayAverage(nozzle.id, date)).toFixed(2),
        segments: segments.map((segment) => ({
          segment: segment.segment,
          rate: segment.rate.toFixed(2),
          from: segment.from.toISOString(),
          to: segment.to.toISOString(),
        })),
      });
    }

    const saved: ShiftEntryForm["saved"] = {};
    const ownEmployee = access.user.role === "SALESMAN" ? await db.employee.findFirst({ where: { userId: access.user.id, outletId } }) : null;
    for (const reading of entry?.nozzleReadings ?? []) {
      if (ownEmployee && reading.salesmanEmployeeId !== ownEmployee.id) continue;
      saved[`${reading.nozzleId}:${reading.rateSegment}`] = {
        closingReading: new Decimal(reading.closingReading.toString()).toFixed(2),
        testingLitres: new Decimal(reading.testingLitres.toString()).toFixed(2),
        salesmanEmployeeId: reading.salesmanEmployeeId ?? "",
        outOfService: reading.outOfService,
        outOfServiceReason: reading.outOfServiceReason ?? "",
        rateSegment: reading.rateSegment,
      };
    }

    return {
      ok: true,
      form: {
        businessDate,
        shiftId,
        shiftName: shift.name,
        existingId: entry?.id ?? null,
        status: entry?.status ?? "DRAFT",
        locked: entry?.status === "APPROVED" || entry?.status === "CANCELLED",
        hasRateSplit,
        nozzles: cards,
        saved,
      },
    };
  } catch (error) {
    return fail(error);
  }
}

export async function saveShiftEntry(payload: unknown): Promise<ActionResult<{ id: string; warnings: string[] }>> {
  const parsed = shiftEntrySchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("PUMP_OPERATIONS", input.id ? "modify" : "add");
    const date = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    if (session.user.role === "SALESMAN") { const employee = await db.employee.findFirstOrThrow({ where: { userId: session.user.id, outletId } }); if (input.readings.some((reading) => reading.salesmanEmployeeId !== employee.id) || input.cashierEmployeeId !== employee.id) return { ok: false, error: "A salesman can enter only their own meter readings" }; }

    const shift = await db.shift.findFirstOrThrow({ where: { id: input.shiftId, outletId } });
    const { start, end } = shiftWindow(input.businessDate, shift.startTime, shift.endTime);

    // One entry per outlet per date per shift — the database enforces it too,
    // but catching it here gives the salesman a sentence instead of a stack.
    const existing = await db.shiftEntry.findUnique({
      where: { outletId_businessDate_shiftId: { outletId, businessDate: date, shiftId: input.shiftId } },
    });
    if (existing && !input.id) {
      return { ok: false, error: `${shift.name} on ${input.businessDate} has already been entered. Open it to make changes.` };
    }
    if (existing && (existing.status === "APPROVED" || existing.status === "CANCELLED")) {
      return { ok: false, error: "This shift is approved and can no longer be edited. Ask a manager to reopen it." };
    }

    const warnings: string[] = [];
    const result = await withAudit(
      {
        outletId,
        tableName: "shift_entries",
        recordId: existing?.id ?? "new",
        action: existing ? "UPDATE" : "CREATE",
        businessDate: date,
        oldValue: existing ? auditJson(existing) : undefined,
        newValue: auditJson(input),
      },
      async (tx) => {
        const entry = existing
          ? await tx.shiftEntry.update({
              where: { id: existing.id },
              data: {
                cashierEmployeeId: input.cashierEmployeeId,
                openingFloat: dec(input.openingFloat),
                counterSaleAmount: dec(input.counterSaleAmount),
                remarks: input.remarks,
                openedAt: existing.openedAt ?? start,
              },
            })
          : await tx.shiftEntry.create({
              data: {
                outletId,
                shiftId: input.shiftId,
                businessDate: date,
                cashierEmployeeId: input.cashierEmployeeId,
                openingFloat: dec(input.openingFloat),
                counterSaleAmount: dec(input.counterSaleAmount),
                remarks: input.remarks,
                openedAt: start,
                createdById: session.user.id,
                status: "DRAFT",
              },
            });

        // Re-derive readings from scratch: an edited shift must never keep a
        // stale row whose chain link no longer matches.
        await tx.nozzleReading.deleteMany({ where: { shiftEntryId: entry.id } });

        let saleAmount = new Decimal(0);
        let saleLitres = new Decimal(0);
        let hasRateSplit = false;
        const stockByTank = new Map<string, { productId: string; litres: Decimal }>();

        for (const reading of input.readings) {
          const nozzle = await tx.nozzle.findFirstOrThrow({ where: { id: reading.nozzleId, outletId }, include: { product: true } });
          const segments = await rateSegmentsFor(nozzle.productId, start, end, tx);
          if (segments.length > 1) hasRateSplit = true;
          const segment = segments.find((candidate) => candidate.segment === reading.rateSegment);
          if (!segment) {
            throw new PumpArithmeticError(`Nozzle ${nozzle.code} has no rate segment ${reading.rateSegment} in this shift window`);
          }

          // Opening comes from the chain, not from the browser. The value the
          // client sent is only used to detect that the page went stale.
          const previous = await tx.nozzleReading.findFirst({
            where: { nozzleId: nozzle.id, nextReading: null },
            orderBy: [{ businessDate: "desc" }, { rateSegment: "desc" }],
          });
          const opening = previous ? new Decimal(previous.closingReading.toString()) : new Decimal(nozzle.initialReading.toString());
          if (!opening.eq(dec(reading.openingReading))) {
            throw new PumpArithmeticError(
              `Nozzle ${nozzle.code}: the opening reading changed to ${opening.toFixed(2)} while this page was open. Reload before saving.`,
            );
          }

          const sale = computeNozzleSale({
            openingReading: opening,
            closingReading: dec(reading.closingReading),
            testingLitres: dec(reading.testingLitres),
            rate: segment.rate,
            meterDigits: nozzle.meterDigits,
            meterRollover: reading.meterRollover,
          });

          const average = await thirtyDayAverage(nozzle.id, date, tx);
          const varianceFlag = flagSaleVariance(sale.saleLitres, average, (await loadSettings(outletId, tx)).decimal("stock.saleSpikeMultiple"));
          if (varianceFlag === "SPIKE") warnings.push(`Nozzle ${nozzle.code} sold ${sale.saleLitres.toFixed(2)} L against a 30-day average of ${average.toFixed(2)} L.`);
          if (varianceFlag === "ZERO_SALE") warnings.push(`Nozzle ${nozzle.code} recorded no sale, but normally sells ${average.toFixed(2)} L.`);
          if (sale.needsApproval) warnings.push(`Nozzle ${nozzle.code} is flagged as a meter rollover and needs manager approval.`);

          await tx.nozzleReading.create({
            data: {
              outletId,
              shiftEntryId: entry.id,
              nozzleId: nozzle.id,
              productId: nozzle.productId,
              businessDate: date,
              rateSegment: reading.rateSegment,
              segmentFrom: segment.from,
              segmentTo: segment.to,
              openingReading: opening,
              closingReading: dec(reading.closingReading),
              testingLitres: dec(reading.testingLitres),
              saleLitres: sale.saleLitres,
              rate: segment.rate,
              saleAmount: sale.saleAmount,
              meterRollover: sale.meterRollover,
              needsApproval: sale.needsApproval,
              salesmanEmployeeId: reading.salesmanEmployeeId,
              outOfService: reading.outOfService,
              outOfServiceAt: reading.outOfService ? new Date() : null,
              outOfServiceReason: reading.outOfServiceReason,
              varianceFlag,
              remarks: reading.remarks,
              prevReadingId: previous?.id ?? null,
              createdById: session.user.id,
            },
          });

          saleAmount = saleAmount.plus(sale.saleAmount);
          saleLitres = saleLitres.plus(sale.saleLitres);

          // Stock leaves the tank for the litres SOLD. Testing litres turned
          // the meter but went back into the tank, so they are not deducted.
          const bucket = stockByTank.get(nozzle.tankId) ?? { productId: nozzle.productId, litres: new Decimal(0) };
          bucket.litres = bucket.litres.plus(sale.saleLitres);
          stockByTank.set(nozzle.tankId, bucket);
        }

        await tx.stockMovement.deleteMany({ where: { shiftEntryId: entry.id, type: { in: ["SALE", "TESTING_RETURN"] } } });
        for (const [tankId, bucket] of stockByTank) {
          if (bucket.litres.isZero()) continue;
          await recordStockMovement(tx, {
            outletId,
            productId: bucket.productId,
            businessDate: date,
            type: "SALE",
            quantity: bucket.litres.negated(),
            rate: await costPerLitre(outletId, bucket.productId, tx),
            fromTankId: tankId,
            shiftEntryId: entry.id,
            sourceType: "shift_entries",
            sourceId: entry.id,
            createdById: session.user.id,
          });
        }

        // Stock left the tank, so its cost belongs in the P&L for that day.
        await postDailyCogs(tx, outletId, date, { createdById: session.user.id });

        const totalSaleValue = round2(saleAmount.plus(dec(input.counterSaleAmount)));
        await tx.shiftEntry.update({
          where: { id: entry.id },
          data: {
            saleAmount: round2(saleAmount),
            saleLitres: round2(saleLitres),
            totalSaleValue,
            hasRateSplit,
            closedAt: end,
            status: "SUBMITTED",
          },
        });

        return entry.id;
      },
    );

    revalidatePath("/pump/shift-entry");
    return { ok: true, id: result, warnings };
  } catch (error) {
    return fail(error);
  }
}

export async function approveRollover(payload: unknown): Promise<ActionResult> {
  const parsed = approveRolloverSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields" };
  try {
    const session = await requirePermission("PUMP_OPERATIONS", "approve");
    const reading = await db.nozzleReading.findUniqueOrThrow({ where: { id: parsed.data.readingId } });
    const { outletId } = await requireUnlockedDate(reading.businessDate);
    if (reading.outletId !== outletId) return { ok: false, error: "That reading belongs to another outlet" };

    await withAudit(
      {
        outletId,
        tableName: "nozzle_readings",
        recordId: reading.id,
        action: parsed.data.approve ? "APPROVE" : "REJECT",
        businessDate: reading.businessDate,
        oldValue: auditJson({ needsApproval: reading.needsApproval, approvedById: reading.approvedById }),
        newValue: auditJson(parsed.data),
        reason: parsed.data.reason,
      },
      async (tx) => {
        await tx.nozzleReading.update({
          where: { id: reading.id },
          data: parsed.data.approve
            ? { needsApproval: false, approvedById: session.user.id, approvedAt: new Date() }
            : { needsApproval: true, approvedById: null, approvedAt: null, remarks: parsed.data.reason },
        });
      },
    );
    revalidatePath("/pump/shift-entry");
    return { ok: true, id: reading.id };
  } catch (error) {
    return fail(error);
  }
}

// ===========================================================================
// 2. Salesman settlement
// ===========================================================================

const KIND_TO_BUCKET: Record<CollectionKind, "card" | "upi" | "wallet" | "credit" | "ownUse" | "expense" | "cash" | "other"> = {
  CASH: "cash",
  CARD: "card",
  UPI: "upi",
  WALLET: "wallet",
  FLEET_CARD: "credit",
  COUPON: "credit",
  CREDIT: "credit",
  OWN_USE: "ownUse",
  STAFF_VEHICLE: "ownUse",
  EXPENSE: "expense",
  OTHER: "other",
};

export async function saveSettlement(payload: unknown): Promise<ActionResult<{ id: string; shortExcess: string; requiresAcknowledgement: boolean }>> {
  const parsed = settlementSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("PUMP_OPERATIONS", "add");
    const entry = await db.shiftEntry.findUniqueOrThrow({ where: { id: input.shiftEntryId }, include: { shift: true } });
    const { outletId, session } = await requireUnlockedDate(entry.businessDate);
    if (entry.outletId !== outletId) return { ok: false, error: "That shift belongs to another outlet" };
    if (session.user.role === "SALESMAN") { const employee = await db.employee.findFirstOrThrow({ where: { userId: session.user.id, outletId } }); if (input.employeeId !== employee.id) return { ok: false, error: "A salesman can settle only their own shift collections" }; }
    if (entry.status === "APPROVED" || entry.status === "CANCELLED") return { ok: false, error: "This shift is closed and can no longer be settled." };

    const settings = await loadSettings(outletId);

    // The counting grid must agree with the declared cash, or the difference
    // is acknowledged in writing. It is never silently accepted.
    const counted = denominationTotal(input.denominations, input.coinsAmount);
    const declared = dec(input.declaredCash);
    const difference = round2(counted.minus(declared));
    if (!difference.isZero() && !input.differenceAcknowledged) {
      return {
        ok: false,
        error: `The notes counted come to ₹${counted.toFixed(2)} but ₹${declared.toFixed(2)} was declared — a difference of ₹${difference.toFixed(2)}. Recount, or tick the acknowledgement to save it as counted.`,
        requiresAcknowledgement: true,
      } as ActionResult<{ id: string; shortExcess: string; requiresAcknowledgement: boolean }>;
    }

    // Nozzle sale allocated to this salesman for this shift.
    const readings = await db.nozzleReading.findMany({ where: { shiftEntryId: entry.id, salesmanEmployeeId: input.employeeId } });
    const nozzleSaleAmount = readings.reduce((sum, row) => sum.plus(new Decimal(row.saleAmount.toString())), new Decimal(0));
    const nozzleSaleLitres = readings.reduce((sum, row) => sum.plus(new Decimal(row.saleLitres.toString())), new Decimal(0));

    const buckets = { cash: new Decimal(0), card: new Decimal(0), upi: new Decimal(0), wallet: new Decimal(0), credit: new Decimal(0), ownUse: new Decimal(0), expense: new Decimal(0), other: new Decimal(0) };
    for (const collection of input.collections) {
      buckets[KIND_TO_BUCKET[collection.kind]] = buckets[KIND_TO_BUCKET[collection.kind]].plus(dec(collection.amount));
    }

    const settlement = computeSettlement({
      nozzleSaleAmount,
      counterSaleAmount: input.counterSaleAmount,
      cash: declared,
      card: buckets.card,
      upi: buckets.upi,
      wallet: buckets.wallet.plus(buckets.other),
      credit: buckets.credit,
      ownUse: buckets.ownUse,
      expenses: buckets.expense,
      toleranceAmount: settings.decimal("cash.shortExcessToleranceAmount"),
    });

    const existing = await db.shiftSettlement.findUnique({ where: { shiftEntryId_employeeId: { shiftEntryId: entry.id, employeeId: input.employeeId } } });

    const id = await withAudit(
      {
        outletId,
        tableName: "shift_settlements",
        recordId: existing?.id ?? "new",
        action: existing ? "UPDATE" : "CREATE",
        businessDate: entry.businessDate,
        oldValue: existing ? auditJson(existing) : undefined,
        newValue: auditJson({ ...input, shortExcess: settlement.shortExcess.toFixed(2) }),
      },
      async (tx) => {
        const data = {
          outletId,
          shiftEntryId: entry.id,
          employeeId: input.employeeId,
          businessDate: entry.businessDate,
          nozzleSaleAmount: round2(nozzleSaleAmount),
          nozzleSaleLitres: round2(nozzleSaleLitres),
          counterSaleAmount: dec(input.counterSaleAmount),
          totalSaleValue: settlement.totalSaleValue,
          declaredCash: declared,
          denominationCount: auditJson(input.denominations),
          coinsAmount: dec(input.coinsAmount),
          denominationTotal: counted,
          denominationDifference: difference,
          differenceAcknowledged: input.differenceAcknowledged,
          differenceNote: input.differenceNote,
          cardTotal: round2(buckets.card),
          upiTotal: round2(buckets.upi),
          walletTotal: round2(buckets.wallet.plus(buckets.other)),
          creditTotal: round2(buckets.credit),
          ownUseTotal: round2(buckets.ownUse),
          expenseTotal: round2(buckets.expense),
          totalCollections: settlement.totalCollections,
          shortExcess: settlement.shortExcess,
          withinTolerance: settlement.withinTolerance,
          remarks: input.remarks,
          status: "SUBMITTED" as const,
        };

        const record = existing
          ? await tx.shiftSettlement.update({ where: { id: existing.id }, data })
          : await tx.shiftSettlement.create({ data: { ...data, createdById: session.user.id } });

        await tx.shiftCollection.deleteMany({ where: { settlementId: record.id } });
        for (const collection of input.collections) {
          await tx.shiftCollection.create({
            data: {
              outletId,
              settlementId: record.id,
              kind: collection.kind,
              paymentModeId: collection.paymentModeId,
              amount: dec(collection.amount),
              machineOrWallet: collection.machineOrWallet,
              referenceNo: collection.referenceNo,
              cardLast4: collection.cardLast4,
              customerId: collection.customerId,
              vehicleId: collection.vehicleId,
              slipNo: collection.slipNo,
              productId: collection.productId,
              quantity: collection.quantity ? dec(collection.quantity) : null,
              expenseHeadId: collection.expenseHeadId,
              voucherRef: collection.voucherRef,
              narration: collection.narration,
            },
          });
        }

        // Credit slips are real documents, not just a line on a settlement.
        await tx.creditSlip.deleteMany({ where: { shiftEntryId: entry.id, isBilled: false, issuedByEmployeeId: input.employeeId } });
        for (const collection of input.collections.filter((row) => row.kind === "CREDIT" && row.customerId)) {
          const number = await issueNumber(tx, outletId, "CREDIT_SLIP", entry.businessDate, settings.number("org.financialYearStartMonth"));
          const quantity = collection.quantity ? dec(collection.quantity) : new Decimal(0);
          const amount = dec(collection.amount);
          await tx.creditSlip.create({
            data: {
              outletId,
              customerId: collection.customerId!,
              vehicleId: collection.vehicleId,
              shiftEntryId: entry.id,
              productId: collection.productId ?? readings[0]?.productId ?? "",
              businessDate: entry.businessDate,
              quantity,
              rate: quantity.isZero() ? new Decimal(0) : round2(amount.div(quantity)),
              amount,
              slipNo: collection.slipNo,
              issuedByEmployeeId: input.employeeId,
              createdById: session.user.id,
              seriesCode: number.seriesCode,
              seriesNumber: number.seriesNumber,
              docNumber: number.docNumber,
            },
          });
        }

        // The whole shift close posts: sale revenue, every collection, and the
        // short or excess. Nothing about this shift stays out of the books.
        await postSettlementVoucher(tx, record.id, {
          createdById: session.user.id,
          financialYearStartMonth: settings.number("org.financialYearStartMonth"),
        });

        await refreshShiftTotals(tx, entry.id);
        return record.id;
      },
    );

    revalidatePath("/pump/settlement");
    return { ok: true, id, shortExcess: settlement.shortExcess.toFixed(2), requiresAcknowledgement: false };
  } catch (error) {
    return fail(error);
  }
}

/** Rolls the settlements back up onto the shift entry. */
async function refreshShiftTotals(tx: Prisma.TransactionClient, shiftEntryId: string) {
  const [entry, settlements] = await Promise.all([
    tx.shiftEntry.findUniqueOrThrow({ where: { id: shiftEntryId } }),
    tx.shiftSettlement.findMany({ where: { shiftEntryId } }),
  ]);
  const sum = (pick: (row: (typeof settlements)[number]) => Prisma.Decimal) =>
    settlements.reduce((total, row) => total.plus(new Decimal(pick(row).toString())), new Decimal(0));

  const counterSale = sum((row) => row.counterSaleAmount);
  const totalSaleValue = round2(new Decimal(entry.saleAmount.toString()).plus(counterSale));
  const totalCollections = sum((row) => row.totalCollections);

  await tx.shiftEntry.update({
    where: { id: shiftEntryId },
    data: {
      counterSaleAmount: round2(counterSale),
      totalSaleValue,
      totalCollections: round2(totalCollections),
      actualCash: round2(sum((row) => row.declaredCash)),
      creditSlipTotal: round2(sum((row) => row.creditTotal)),
      digitalCollections: round2(sum((row) => row.cardTotal).plus(sum((row) => row.upiTotal)).plus(sum((row) => row.walletTotal))),
      ownUseAmount: round2(sum((row) => row.ownUseTotal)),
      cashExpenses: round2(sum((row) => row.expenseTotal)),
      expectedCash: round2(totalSaleValue.minus(sum((row) => row.cardTotal)).minus(sum((row) => row.upiTotal)).minus(sum((row) => row.walletTotal)).minus(sum((row) => row.creditTotal)).minus(sum((row) => row.ownUseTotal)).minus(sum((row) => row.expenseTotal))),
      shortExcess: round2(sum((row) => row.shortExcess)),
    },
  });
}

// ===========================================================================
// 3. Dip and density
// ===========================================================================

export async function saveDipReading(payload: unknown): Promise<ActionResult<{ id: string; netLitres: string; waterAlert: boolean }>> {
  const parsed = dipReadingSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("PUMP_OPERATIONS", input.id ? "modify" : "add");
    const date = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const tank = await db.tank.findFirstOrThrow({ where: { id: input.tankId, outletId } });
    const settings = await loadSettings(outletId);

    const volumes = await dipToNetLitres(tank.id, input.fuelDipMm, input.waterDipMm);
    const waterAlert = new Decimal(input.waterDipMm).gt(settings.decimal("stock.waterDipAlertMm"));

    const id = await withAudit(
      { outletId, tableName: "dip_readings", recordId: input.id ?? "new", action: input.id ? "UPDATE" : "CREATE", businessDate: date, newValue: auditJson(input) },
      async (tx) => {
        const data = {
          outletId,
          tankId: tank.id,
          shiftEntryId: input.shiftEntryId,
          businessDate: date,
          readingType: input.readingType,
          fuelDipMm: dec(input.fuelDipMm),
          waterDipMm: dec(input.waterDipMm),
          fuelLitres: volumes.fuelLitres,
          waterLitres: volumes.waterLitres,
          netLitres: volumes.netLitres,
          temperatureC: input.temperatureC ? dec(input.temperatureC) : null,
          measuredByEmployeeId: input.measuredByEmployeeId,
          remarks: input.remarks,
          createdById: session.user.id,
        };
        if (input.id) return (await tx.dipReading.update({ where: { id: input.id }, data })).id;
        // A shift may only carry one dip of each type per tank.
        if (input.shiftEntryId) {
          const clash = await tx.dipReading.findUnique({
            where: { shiftEntryId_tankId_readingType: { shiftEntryId: input.shiftEntryId, tankId: tank.id, readingType: input.readingType } },
          });
          if (clash) return (await tx.dipReading.update({ where: { id: clash.id }, data })).id;
        }
        return (await tx.dipReading.create({ data })).id;
      },
    );

    revalidatePath("/pump/dip-density");
    return { ok: true, id, netLitres: volumes.netLitres.toFixed(2), waterAlert };
  } catch (error) {
    return fail(error);
  }
}

export async function saveDensityReading(payload: unknown): Promise<ActionResult<{ id: string; densityAt15C: string; deviation: string; withinTolerance: boolean }>> {
  const parsed = densityReadingSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("PUMP_OPERATIONS", input.id ? "modify" : "add");
    const date = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const tank = await db.tank.findFirstOrThrow({ where: { id: input.tankId, outletId }, include: { product: true } });
    const settings = await loadSettings(outletId);

    const corrected = densityAt15C(input.observedDensity, input.temperatureC, settings.decimal("quality.densityTempCoefficient"));

    // Compared against the density on the last invoice received for this
    // product — that is what catches wrong supply and adulteration.
    const lastReceipt = await db.decantation.findFirst({
      where: { outletId, productId: tank.productId, invoiceDensity: { not: null } },
      orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
      select: { invoiceDensity: true },
    });
    const check = lastReceipt?.invoiceDensity
      ? checkDensityAgainstInvoice(corrected, new Decimal(lastReceipt.invoiceDensity.toString()), settings.decimal("quality.densityToleranceKgM3"))
      : { deviation: new Decimal(0), withinTolerance: true };

    const id = await withAudit(
      { outletId, tableName: "density_readings", recordId: input.id ?? "new", action: input.id ? "UPDATE" : "CREATE", businessDate: date, newValue: auditJson(input) },
      async (tx) => {
        const data = {
          outletId,
          tankId: tank.id,
          productId: tank.productId,
          shiftEntryId: input.shiftEntryId,
          businessDate: date,
          observedDensity: dec(input.observedDensity),
          temperatureC: dec(input.temperatureC),
          densityAt15C: corrected,
          invoiceDensity: lastReceipt?.invoiceDensity ?? null,
          deviation: check.deviation,
          withinTolerance: check.withinTolerance,
          measuredByEmployeeId: input.measuredByEmployeeId,
          remarks: input.remarks,
          createdById: session.user.id,
        };
        if (input.id) return (await tx.densityReading.update({ where: { id: input.id }, data })).id;
        return (await tx.densityReading.create({ data })).id;
      },
    );

    revalidatePath("/pump/dip-density");
    return { ok: true, id, densityAt15C: corrected.toFixed(1), deviation: check.deviation.toFixed(1), withinTolerance: check.withinTolerance };
  } catch (error) {
    return fail(error);
  }
}

// ===========================================================================
// 4. Purchase / decantation
// ===========================================================================

export async function savePurchase(payload: unknown): Promise<ActionResult<{ id: string; warnings: string[] }>> {
  const parsed = purchaseSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("PURCHASES", input.id ? "modify" : "add");
    const date = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const settings = await loadSettings(outletId);
    const warnings: string[] = [];

    const id = await withAudit(
      { outletId, tableName: "purchases", recordId: input.id ?? "new", action: input.id ? "UPDATE" : "CREATE", businessDate: date, newValue: auditJson(input) },
      async (tx) => {
        let subTotal = new Decimal(0);
        for (const line of input.lines) subTotal = subTotal.plus(dec(line.invoiceQty).mul(dec(line.rate)));
        subTotal = round2(subTotal);

        const taxAmount = round2(dec(input.cgstAmount).plus(dec(input.sgstAmount)).plus(dec(input.igstAmount)).plus(dec(input.vatAmount)));
        const totalAmount = round2(
          subTotal
            .plus(dec(input.dutiesAmount))
            .plus(taxAmount)
            .plus(dec(input.tcsAmount))
            .plus(dec(input.freightAmount))
            .plus(dec(input.otherCharges))
            .minus(dec(input.discount))
            .plus(dec(input.roundOff)),
        );

        const number = input.id
          ? null
          : await issueNumber(tx, outletId, "PURCHASE", date, settings.number("org.financialYearStartMonth"));

        const header = {
          outletId,
          supplierId: input.supplierId,
          businessDate: date,
          invoiceNo: input.invoiceNo,
          invoiceDate: businessDateFromInput(input.invoiceDate),
          vehicleNo: input.vehicleNo,
          driverName: input.driverName,
          transporterName: input.transporterName,
          subTotal,
          dutiesAmount: dec(input.dutiesAmount),
          cgstAmount: dec(input.cgstAmount),
          sgstAmount: dec(input.sgstAmount),
          igstAmount: dec(input.igstAmount),
          vatAmount: dec(input.vatAmount),
          taxAmount,
          tcsAmount: dec(input.tcsAmount),
          freightAmount: dec(input.freightAmount),
          otherCharges: dec(input.otherCharges),
          discount: dec(input.discount),
          roundOff: dec(input.roundOff),
          totalAmount,
          remarks: input.remarks,
          status: "POSTED" as const,
        };

        const purchase = input.id
          ? await tx.purchase.update({ where: { id: input.id }, data: header })
          : await tx.purchase.create({
              data: { ...header, seriesCode: number!.seriesCode, seriesNumber: number!.seriesNumber, docNumber: number!.docNumber, createdById: session.user.id },
            });

        await tx.purchaseLine.deleteMany({ where: { purchaseId: purchase.id } });
        await tx.decantation.deleteMany({ where: { purchaseId: purchase.id } });
        await tx.stockMovement.deleteMany({ where: { sourceType: "purchases", sourceId: purchase.id } });

        for (const [index, line] of input.lines.entries()) {
          const tank = await tx.tank.findFirstOrThrow({ where: { id: line.tankId, outletId } });
          if (tank.productId !== line.productId) {
            throw new Error(`Compartment ${index + 1}: tank ${tank.code} does not hold the product on this line.`);
          }

          const invoiceQty = dec(line.invoiceQty);
          const amount = round2(invoiceQty.mul(dec(line.rate)));
          await tx.purchaseLine.create({
            data: {
              purchaseId: purchase.id,
              productId: line.productId,
              tankId: line.tankId,
              compartmentNo: line.compartmentNo,
              quantity: invoiceQty,
              quantityAt15C: line.invoiceTemperatureC ? correctVolumeTo15C(invoiceQty, line.invoiceTemperatureC, settings.decimal("quality.vcfLinearCoefficient")) : null,
              rate: dec(line.rate),
              invoiceDensity: line.invoiceDensity ? dec(line.invoiceDensity) : null,
              temperatureC: line.invoiceTemperatureC ? dec(line.invoiceTemperatureC) : null,
              taxableValue: amount,
              amount,
              lineNo: index + 1,
            },
          });

          const before = await dipToNetLitres(tank.id, line.dipBeforeMm, "0", tx);
          const after = await dipToNetLitres(tank.id, line.dipAfterMm, "0", tx);
          const allowancePct = settings.decimal("stock.transitLossPct");
          const cost = dec(line.rate);
          const result = computeDecantation({
            invoiceQty,
            dipBeforeLitres: before.netLitres,
            dipAfterLitres: after.netLitres,
            allowancePct,
            costPerLitre: cost,
          });

          const invoiceDensity15 = line.invoiceDensity && line.invoiceTemperatureC
            ? densityAt15C(line.invoiceDensity, line.invoiceTemperatureC, settings.decimal("quality.densityTempCoefficient"))
            : line.invoiceDensity
              ? dec(line.invoiceDensity)
              : null;
          const receiptDensity15 = line.receiptDensity && line.receiptTemperatureC
            ? densityAt15C(line.receiptDensity, line.receiptTemperatureC, settings.decimal("quality.densityTempCoefficient"))
            : line.receiptDensity
              ? dec(line.receiptDensity)
              : null;
          const densityDeviation = invoiceDensity15 && receiptDensity15 ? round2(receiptDensity15.minus(invoiceDensity15)) : null;

          if (!result.withinAllowance) {
            warnings.push(`Compartment ${index + 1} (${tank.code}): receipt loss ${result.transitLoss.toFixed(2)} L (${result.lossPct.toFixed(4)} %) exceeds the permitted ${result.allowedLoss.toFixed(2)} L.`);
          }
          if (densityDeviation && densityDeviation.abs().gt(settings.decimal("quality.densityToleranceKgM3"))) {
            warnings.push(`Compartment ${index + 1} (${tank.code}): receipt density is ${densityDeviation.toFixed(1)} kg/m³ off the invoice density.`);
          }

          await tx.decantation.create({
            data: {
              outletId,
              tankId: tank.id,
              productId: line.productId,
              purchaseId: purchase.id,
              supplierId: input.supplierId,
              businessDate: date,
              timeIn: input.timeIn ? localTimestamp(input.businessDate, input.timeIn) : null,
              timeOut: input.timeOut ? localTimestamp(input.businessDate, input.timeOut) : null,
              invoiceNo: input.invoiceNo,
              invoiceDate: businessDateFromInput(input.invoiceDate),
              depot: input.depot,
              vehicleNo: input.vehicleNo,
              driverName: input.driverName,
              transporterName: input.transporterName,
              compartmentNo: line.compartmentNo,
              sealNoTop: line.sealNoTop,
              sealNoBottom: line.sealNoBottom,
              sealNoIntact: input.sealNoIntact,
              invoiceQty,
              invoiceQtyAt15C: line.invoiceTemperatureC ? correctVolumeTo15C(invoiceQty, line.invoiceTemperatureC, settings.decimal("quality.vcfLinearCoefficient")) : null,
              invoiceDensity: line.invoiceDensity ? dec(line.invoiceDensity) : null,
              invoiceTemperatureC: line.invoiceTemperatureC ? dec(line.invoiceTemperatureC) : null,
              dipBeforeMm: dec(line.dipBeforeMm),
              dipAfterMm: dec(line.dipAfterMm),
              stockBefore: before.netLitres,
              stockAfter: after.netLitres,
              receivedQty: result.decantedQty,
              receivedQtyAt15C: line.receiptTemperatureC ? correctVolumeTo15C(result.decantedQty, line.receiptTemperatureC, settings.decimal("quality.vcfLinearCoefficient")) : null,
              observedDensity: line.receiptDensity ? dec(line.receiptDensity) : null,
              temperatureC: line.receiptTemperatureC ? dec(line.receiptTemperatureC) : null,
              densityAt15C: receiptDensity15,
              densityDeviation,
              transitLoss: result.transitLoss,
              lossPct: result.lossPct,
              allowedLoss: result.allowedLoss,
              excessLoss: result.excessLoss,
              lossValue: result.lossValue,
              withinAllowance: result.withinAllowance,
              status: "COMPLETED",
              supervisedByEmployeeId: input.supervisedByEmployeeId,
              createdById: session.user.id,
            },
          });

          // Stock rises by what physically went in, not by what was invoiced.
          await recordStockMovement(tx, {
            outletId,
            productId: line.productId,
            businessDate: date,
            type: "PURCHASE_RECEIPT",
            quantity: result.decantedQty,
            rate: cost,
            toTankId: tank.id,
            sourceType: "purchases",
            sourceId: purchase.id,
            remarks: `${input.vehicleNo} · ${input.invoiceNo}`,
            createdById: session.user.id,
          });

          // Weighted average cost moves with every receipt.
          const product = await tx.product.findUniqueOrThrow({ where: { id: line.productId } });
          const onHand = await tx.stockMovement.aggregate({ where: { productId: line.productId, isCancelled: false }, _sum: { quantity: true } });
          const closing = new Decimal(onHand._sum.quantity?.toString() ?? "0");
          const previousQty = closing.minus(result.decantedQty);
          const previousValue = previousQty.mul(new Decimal(product.weightedAvgCost.toString()));
          const newValue = previousValue.plus(result.decantedQty.mul(cost));
          if (closing.gt(0)) {
            await tx.product.update({ where: { id: line.productId }, data: { weightedAvgCost: newValue.div(closing).toDecimalPlaces(4, Decimal.ROUND_HALF_UP) } });
          }
        }

        // Stock, transit loss, TCS and the supplier — one shared rule, so the
        // books and the tanker-loss report cannot drift apart.
        await postPurchaseVoucher(tx, purchase.id, {
          createdById: session.user.id,
          financialYearStartMonth: settings.number("org.financialYearStartMonth"),
        });

        return purchase.id;
      },
    );

    revalidatePath("/pump/decantation");
    return { ok: true, id, warnings };
  } catch (error) {
    return fail(error);
  }
}

// ===========================================================================
// 5. Stock variation
// ===========================================================================

export async function computeAndSaveVariation(payload: unknown): Promise<ActionResult<{ id: string; variationLitres: string; withinAllowance: boolean }>> {
  const parsed = stockVariationSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("INVENTORY", "add");
    const date = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const tank = await db.tank.findFirstOrThrow({ where: { id: input.tankId, outletId }, include: { product: true } });
    const settings = await loadSettings(outletId);

    const physical = await closingStockFor(outletId, tank.id, date);
    if (!physical) return { ok: false, error: `No closing dip has been taken for tank ${tank.code} on ${input.businessDate}. Record the dip first.` };

    const opening = await openingStockFor(outletId, tank.id, date);
    const movements = await db.stockMovement.groupBy({
      by: ["type"],
      where: { outletId, businessDate: date, isCancelled: false, OR: [{ toTankId: tank.id }, { fromTankId: tank.id }] },
      _sum: { quantity: true },
    });
    const sumOf = (type: string) => new Decimal(movements.find((row) => row.type === type)?._sum.quantity?.toString() ?? "0");

    const receipts = sumOf("PURCHASE_RECEIPT");
    const sales = sumOf("SALE").abs();
    const samples = sumOf("SAMPLE_DRAW").abs();
    const transfersIn = sumOf("TRANSFER_IN");
    const transfersOut = sumOf("TRANSFER_OUT").abs();

    const readings = await db.nozzleReading.findMany({ where: { outletId, businessDate: date, nozzle: { tankId: tank.id } }, select: { testingLitres: true } });
    const testing = readings.reduce((total, row) => total.plus(new Decimal(row.testingLitres.toString())), new Decimal(0));

    const allowancePct = settings.allowancePctFor(tank.product.productType);
    const cost = await costPerLitre(outletId, tank.productId);

    const result = computeStockVariation({
      openingStock: opening,
      purchases: receipts.plus(transfersIn),
      sales,
      ownUse: dec(input.ownUseLitres).plus(samples),
      returns: input.returnsLitres,
      physicalStock: physical,
      allowancePct,
      costPerLitre: cost,
    });

    const id = await withAudit(
      { outletId, tableName: "stock_variations", recordId: "new", action: "CREATE", businessDate: date, newValue: auditJson({ ...input, variation: result.variationLitres.toFixed(2) }) },
      async (tx) => {
        const data = {
          outletId,
          tankId: tank.id,
          productId: tank.productId,
          shiftEntryId: input.shiftEntryId,
          businessDate: date,
          openingStock: opening,
          receipts: round2(receipts),
          sales: round2(sales),
          ownUseLitres: dec(input.ownUseLitres),
          returnsLitres: dec(input.returnsLitres),
          testingLitres: round2(testing),
          sampleLitres: round2(samples),
          transfersIn: round2(transfersIn),
          transfersOut: round2(transfersOut),
          bookStock: result.bookStock,
          dipStock: result.physicalStock,
          variationLitres: result.variationLitres,
          variationPct: result.variationPct,
          allowancePct,
          allowedLitres: result.permissibleLitres,
          excessLossLitres: result.excessLossLitres,
          excessLossValue: result.excessLossValue,
          withinAllowance: result.withinAllowance,
          costPerLitre: cost,
          variationValue: result.variationValue,
          remarks: input.remarks,
          createdById: session.user.id,
        };
        const existing = await tx.stockVariation.findFirst({ where: { outletId, tankId: tank.id, businessDate: date, shiftEntryId: input.shiftEntryId ?? null } });
        const record = existing ? await tx.stockVariation.update({ where: { id: existing.id }, data }) : await tx.stockVariation.create({ data });
        // An approved variation is a real stock loss and belongs in the P&L.
        await postStockVariationVoucher(tx, record.id, { createdById: session.user.id });
        return record.id;
      },
    );

    revalidatePath("/pump/variation");
    return { ok: true, id, variationLitres: result.variationLitres.toFixed(2), withinAllowance: result.withinAllowance };
  } catch (error) {
    return fail(error);
  }
}

// ===========================================================================
// 6. Reminders
// ===========================================================================

export async function saveReminder(payload: unknown): Promise<ActionResult> {
  const parsed = reminderSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("SETTINGS", input.id ? "modify" : "add");
    const due = businessDateFromInput(input.dueDate);
    const { outletId, session } = await requireUnlockedDate(new Date());

    const id = await withAudit(
      { outletId, tableName: "reminders", recordId: input.id ?? "new", action: input.id ? "UPDATE" : "CREATE", businessDate: due, newValue: auditJson(input) },
      async (tx) => {
        const data = {
          outletId,
          title: input.title,
          notes: input.notes,
          type: input.type,
          dueDate: due,
          dueTime: input.dueTime,
          repeat: input.repeat,
          isRecurring: input.repeat !== "NONE",
          alertBefore: Number(input.alertBefore),
          amount: input.amount ? dec(input.amount) : null,
          referenceNo: input.referenceNo,
          customerId: input.customerId,
          supplierId: input.supplierId,
          employeeId: input.employeeId,
          assignedToId: input.assignedToId,
          createdById: session.user.id,
        };
        if (input.id) return (await tx.reminder.update({ where: { id: input.id }, data })).id;
        return (await tx.reminder.create({ data })).id;
      },
    );

    revalidatePath("/pump/reminders");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

const REPEAT_STEP: Record<string, (date: Date) => Date> = {
  DAILY: (date) => new Date(date.getTime() + 24 * 60 * 60 * 1000),
  WEEKLY: (date) => new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000),
  MONTHLY: (date) => { const next = new Date(date); next.setUTCMonth(next.getUTCMonth() + 1); return next; },
  YEARLY: (date) => { const next = new Date(date); next.setUTCFullYear(next.getUTCFullYear() + 1); return next; },
};

export async function actOnReminder(payload: unknown): Promise<ActionResult> {
  const parsed = reminderActionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields" };
  const input = parsed.data;

  try {
    await requirePermission("SETTINGS", "modify");
    const reminder = await db.reminder.findUniqueOrThrow({ where: { id: input.id } });
    const { outletId, session } = await requireUnlockedDate(new Date());
    if (reminder.outletId !== outletId) return { ok: false, error: "That reminder belongs to another outlet" };

    await withAudit(
      { outletId, tableName: "reminders", recordId: reminder.id, action: "UPDATE", businessDate: reminder.dueDate, oldValue: auditJson(reminder), newValue: auditJson(input) },
      async (tx) => {
        if (input.action === "DONE") {
          await tx.reminder.update({ where: { id: reminder.id }, data: { status: "DONE", completedAt: new Date(), completedNote: input.note } });
          // A repeating reminder rolls forward so the chain stays traceable.
          const step = REPEAT_STEP[reminder.repeat];
          if (step) {
            await tx.reminder.create({
              data: {
                outletId,
                title: reminder.title,
                notes: reminder.notes,
                type: reminder.type,
                dueDate: step(reminder.dueDate),
                dueTime: reminder.dueTime,
                repeat: reminder.repeat,
                isRecurring: true,
                alertBefore: reminder.alertBefore,
                amount: reminder.amount,
                referenceNo: reminder.referenceNo,
                customerId: reminder.customerId,
                supplierId: reminder.supplierId,
                employeeId: reminder.employeeId,
                assignedToId: reminder.assignedToId,
                rolledFromId: reminder.id,
                createdById: session.user.id,
              },
            });
          }
          return;
        }
        if (input.action === "SNOOZE") {
          await tx.reminder.update({
            where: { id: reminder.id },
            data: { status: "SNOOZED", snoozedTill: input.snoozedTill ? businessDateFromInput(input.snoozedTill) : null, completedNote: input.note },
          });
          return;
        }
        await tx.reminder.update({ where: { id: reminder.id }, data: { status: input.action === "CANCEL" ? "CANCELLED" : "OPEN", completedNote: input.note } });
      },
    );

    revalidatePath("/pump/reminders");
    return { ok: true, id: reminder.id };
  } catch (error) {
    return fail(error);
  }
}

// ===========================================================================
// 7. Fuel samples
// ===========================================================================

export async function saveSample(payload: unknown): Promise<ActionResult> {
  const parsed = sampleSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Correct the highlighted fields", fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const input = parsed.data;

  try {
    await requirePermission("INVENTORY", input.id ? "modify" : "add");
    const date = businessDateFromInput(input.businessDate);
    const { outletId, session } = await requireUnlockedDate(date);
    const settings = await loadSettings(outletId);

    const retainedTill = input.retainedTill
      ? businessDateFromInput(input.retainedTill)
      : new Date(date.getTime() + settings.number("quality.sampleRetentionDays") * 24 * 60 * 60 * 1000);

    const corrected = input.observedDensity && input.temperatureC
      ? densityAt15C(input.observedDensity, input.temperatureC, settings.decimal("quality.densityTempCoefficient"))
      : null;

    const id = await withAudit(
      { outletId, tableName: "samples", recordId: input.id ?? "new", action: input.id ? "UPDATE" : "CREATE", businessDate: date, newValue: auditJson(input) },
      async (tx) => {
        const data = {
          outletId,
          productId: input.productId,
          tankId: input.tankId,
          decantationId: input.decantationId,
          businessDate: date,
          type: input.type,
          quantity: dec(input.quantity),
          tankerNo: input.tankerNo,
          invoiceNo: input.invoiceNo,
          observedDensity: input.observedDensity ? dec(input.observedDensity) : null,
          temperatureC: input.temperatureC ? dec(input.temperatureC) : null,
          densityAt15C: corrected,
          sealNo: input.sealNo,
          sealedBy: input.sealedBy,
          drawnByEmployeeId: input.drawnByEmployeeId,
          witnessName: input.witnessName,
          retainedTill,
          storageRef: input.storageRef,
          result: input.result,
          remarks: input.remarks,
          createdById: session.user.id,
        };
        const record = input.id ? await tx.sample.update({ where: { id: input.id }, data }) : await tx.sample.create({ data });

        // A retained sample is fuel that left the tank.
        if (!input.id && input.tankId) {
          await recordStockMovement(tx, {
            outletId,
            productId: input.productId,
            businessDate: date,
            type: "SAMPLE_DRAW",
            quantity: dec(input.quantity).negated(),
            rate: await costPerLitre(outletId, input.productId, tx),
            fromTankId: input.tankId,
            sourceType: "samples",
            sourceId: record.id,
            createdById: session.user.id,
          });
        }
        return record.id;
      },
    );

    revalidatePath("/pump/samples");
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}
