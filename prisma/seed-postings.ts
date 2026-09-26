/**
 * Posts the operational history into the ledger.
 *
 * Phase 3 and Phase 4 write shifts, settlements, purchases and bills. This
 * pass turns every one of them into balanced journal lines by calling the
 * same posting functions the server actions call — there is no seed-only
 * accounting logic, so what the seed produces is what the app would produce.
 *
 * Idempotent: each posting discards and rewrites its own voucher.
 */
import type { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { postOpeningBalances, type Tx } from "../src/server/accounts/posting";
import { postDailyCogs, postOpeningStock, postPurchaseVoucher, postSettlementVoucher, postStockVariationVoucher } from "../src/server/accounts/operations-posting";

export async function seedPostings(db: PrismaClient, outletId: string): Promise<void> {
  // PrismaClient satisfies the transaction-client surface these functions use.
  const tx = db as unknown as Tx;

  const earliest = await db.shiftEntry.findFirst({ where: { outletId }, orderBy: { businessDate: "asc" }, select: { businessDate: true } });
  const openingDate = earliest ? new Date(earliest.businessDate.getTime() - 86_400_000) : new Date();
  await postOpeningBalances(tx, outletId, openingDate);
  // The fuel already in the tanks on day one is an asset, not a windfall.
  await postOpeningStock(tx, outletId, openingDate);

  // ---- Tanker receipts ----------------------------------------------------
  const purchases = await db.purchase.findMany({ where: { outletId, status: { not: "CANCELLED" } }, select: { id: true }, orderBy: { businessDate: "asc" } });
  for (const purchase of purchases) await postPurchaseVoucher(tx, purchase.id);

  // ---- Shift closes: sale, collections, short and excess -------------------
  const settlements = await db.shiftSettlement.findMany({ where: { outletId }, select: { id: true }, orderBy: { businessDate: "asc" } });
  for (const settlement of settlements) await postSettlementVoucher(tx, settlement.id);

  // ---- Cost of goods sold, one voucher per day ----------------------------
  const days = await db.stockMovement.findMany({
    where: { outletId, isCancelled: false, type: { in: ["SALE", "SAMPLE_DRAW"] } },
    distinct: ["businessDate"],
    select: { businessDate: true },
    orderBy: { businessDate: "asc" },
  });
  for (const day of days) await postDailyCogs(tx, outletId, day.businessDate);

  // ---- Approved stock variations ------------------------------------------
  const variations = await db.stockVariation.findMany({ where: { outletId, status: { in: ["APPROVED", "WRITTEN_OFF"] } }, select: { id: true }, orderBy: { businessDate: "asc" } });
  for (const variation of variations) await postStockVariationVoucher(tx, variation.id);

  const totals = await db.voucherLine.aggregate({ where: { outletId }, _sum: { debit: true, credit: true } });
  const debit = new Decimal(totals._sum.debit?.toString() ?? "0");
  const credit = new Decimal(totals._sum.credit?.toString() ?? "0");
  console.log(
    `Ledger posted: ${purchases.length} purchases, ${settlements.length} shift closes, ${days.length} COGS days, ${variations.length} variations. ` +
      `Dr ${debit.toFixed(2)} / Cr ${credit.toFixed(2)} — difference ${debit.minus(credit).toFixed(2)}.`,
  );
}
