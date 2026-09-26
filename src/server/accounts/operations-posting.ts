/**
 * Posting rules for Phase 3 pump operations.
 *
 * Before Phase 5 the shift close wrote only its cash short/excess to the
 * ledger: 90 days of fuel sales, collections and cost of goods sold existed
 * in the operational tables and nowhere in the books. These functions close
 * that gap, and both the server actions and the seed call them, so there is
 * exactly one definition of how a shift posts.
 */
import { Prisma } from "@prisma/client";
import { Decimal, round2 } from "@/lib/money";
import { reconcileBilledShift } from "@/lib/pump";
import type { JournalLine } from "@/lib/accounts";
import {
  cogsAccountFor,
  discardVoucherFor,
  ensureCustomerLedger,
  ensureEmployeeLedger,
  ensureSupplierLedger,
  postVoucher,
  resolveAccount,
  type Tx,
} from "@/server/accounts/posting";

const dec = (value: { toString(): string } | null | undefined): Decimal => new Decimal(value?.toString() ?? "0");

/**
 * Which ledger a collection lands in. The payment mode's own configured
 * ledger always wins — that is what the master exists for — and the kind is
 * only a fallback for lines recorded without a mode.
 */
async function collectionAccountId(
  tx: Tx,
  outletId: string,
  collection: { kind: string; paymentModeId: string | null; customerId: string | null; expenseHeadId: string | null; paymentMode?: { accountId: string | null } | null; expenseHead?: { accountId: string | null } | null },
): Promise<string> {
  if (collection.kind === "CREDIT" && collection.customerId) {
    return (await ensureCustomerLedger(tx, outletId, collection.customerId)).id;
  }
  if (collection.kind === "EXPENSE") {
    const head = collection.expenseHead ?? (collection.expenseHeadId ? await tx.expenseHead.findUnique({ where: { id: collection.expenseHeadId }, select: { accountId: true } }) : null);
    if (head?.accountId) return head.accountId;
    return (await resolveAccount(tx, outletId, "SUNDRY_EXPENSE", "SUNDRY_EXP")).id;
  }
  const mode = collection.paymentMode ?? (collection.paymentModeId ? await tx.paymentMode.findUnique({ where: { id: collection.paymentModeId }, select: { accountId: true } }) : null);
  if (mode?.accountId) return mode.accountId;

  switch (collection.kind) {
    case "CARD":
    case "WALLET":
      return (await resolveAccount(tx, outletId, "CARD_RECEIVABLE", "CARD_REC")).id;
    case "UPI":
      return (await resolveAccount(tx, outletId, "BANK_MAIN", "BANK")).id;
    case "FLEET_CARD":
    case "COUPON":
      return (await resolveAccount(tx, outletId, "SUNDRY_DEBTORS", "DEBTORS")).id;
    case "OWN_USE":
    case "STAFF_VEHICLE":
      return (await resolveAccount(tx, outletId, "OWN_USE", "OWN_USE")).id;
    default:
      return (await resolveAccount(tx, outletId, "CASH_IN_HAND", "CASH")).id;
  }
}

/**
 * The complete shift close for one salesman:
 *
 *   Dr Cash in hand              cash they handed over
 *   Dr Card / UPI / wallet       digital collections
 *   Dr Customer ledgers          credit sales
 *   Dr Own use / expense heads   fuel and cash issued without collection
 *   Dr Salesman ledger           cash short, recoverable
 *      Cr Fuel sales (by product, tagged with litres)
 *      Cr Counter sales
 *      Cr Cash & excess suspense excess cash
 *
 * Debits and credits agree by construction:
 *   short   → collections + |short| = sale value
 *   excess  → collections = sale value + excess
 */
export async function postSettlementVoucher(tx: Tx, settlementId: string, options: { createdById?: string; financialYearStartMonth?: number } = {}) {
  const settlement = await tx.shiftSettlement.findUniqueOrThrow({
    where: { id: settlementId },
    include: {
      employee: { select: { id: true, code: true, name: true, accountId: true } },
      collections: { include: { paymentMode: { select: { accountId: true } }, expenseHead: { select: { accountId: true } } } },
      shiftEntry: { select: { id: true, shiftId: true, shift: { select: { name: true } } } },
    },
  });
  const outletId = settlement.outletId;

  await discardVoucherFor(tx, { shiftSettlementId: settlementId });

  const debits: JournalLine[] = [];
  const credits: JournalLine[] = [];

  // A fuel bill and a shift settlement describe the same nozzle sale from
  // different operational viewpoints. The bill owns the detailed sales
  // voucher; the shift voucher therefore posts only the unbilled remainder.
  // This also makes bills saved after settlement safe: saveBill() reposts
  // this voucher in the same transaction.
  const linkedBills = await tx.bill.findMany({
    where: {
      outletId,
      shiftEntryId: settlement.shiftEntryId,
      salesmanEmployeeId: settlement.employeeId,
      status: "POSTED",
      type: { notIn: ["COUNTER", "CONSOLIDATED", "CREDIT_NOTE"] },
      convertedShortCredit: { is: null },
      lines: { some: { product: { isFuel: true } } },
    },
    include: {
      customer: { select: { id: true, accountId: true } },
      settlements: { include: { paymentMode: { select: { name: true, accountId: true } } } },
      lines: { include: { product: { select: { name: true, isFuel: true } } } },
    },
  });
  const linkedShortCredits = await tx.shortCredit.findMany({
    where: {
      outletId,
      shiftEntryId: settlement.shiftEntryId,
      salesmanEmployeeId: settlement.employeeId,
    },
    include: { product: { select: { name: true, isFuel: true } } },
  });

  const excludedByAccount = new Map<string, Decimal>();
  const billedByProduct = new Map<string, { amount: Decimal; litres: Decimal; name: string }>();
  let billedFuelAmount = new Decimal(0);
  let billedGrandTotal = new Decimal(0);
  let runningShortAmount = new Decimal(0);
  const addExcludedDebit = (accountId: string, amount: Decimal) => {
    excludedByAccount.set(accountId, (excludedByAccount.get(accountId) ?? new Decimal(0)).plus(amount));
  };

  for (const bill of linkedBills) {
    if (bill.lines.some((line) => !line.product.isFuel)) {
      throw new Error(`${bill.docNumber} mixes fuel and non-fuel items and cannot be reconciled to a shift`);
    }
    for (const line of bill.lines) {
      const amount = round2(dec(line.taxableValue));
      const bucket = billedByProduct.get(line.productId) ?? { amount: new Decimal(0), litres: new Decimal(0), name: line.product.name };
      bucket.amount = bucket.amount.plus(amount);
      bucket.litres = bucket.litres.plus(dec(line.quantity));
      billedByProduct.set(line.productId, bucket);
      billedFuelAmount = billedFuelAmount.plus(amount);
    }

    const grandTotal = round2(dec(bill.totalAmount));
    billedGrandTotal = billedGrandTotal.plus(grandTotal);
    if (bill.type === "CREDIT") {
      if (!bill.customerId) throw new Error(`${bill.docNumber} has no credit customer`);
      const ledger = bill.customer?.accountId
        ? { id: bill.customer.accountId }
        : await ensureCustomerLedger(tx, outletId, bill.customerId);
      addExcludedDebit(ledger.id, grandTotal);
      continue;
    }

    const settled = bill.settlements.reduce((sum, row) => sum.plus(dec(row.amount)), new Decimal(0));
    if (!round2(settled).eq(grandTotal)) throw new Error(`${bill.docNumber} payment modes do not equal its grand total`);
    for (const payment of bill.settlements) {
      if (!payment.paymentMode.accountId) throw new Error(`${payment.paymentMode.name} is not mapped to a ledger`);
      addExcludedDebit(payment.paymentMode.accountId, round2(dec(payment.amount)));
    }
  }

  for (const short of linkedShortCredits) {
    if (!short.product.isFuel) throw new Error(`${short.docNumber} is not a fuel running-short slip`);
    const amount = round2(dec(short.amount));
    const bucket = billedByProduct.get(short.productId) ?? { amount: new Decimal(0), litres: new Decimal(0), name: short.product.name };
    bucket.amount = bucket.amount.plus(amount);
    bucket.litres = bucket.litres.plus(dec(short.quantity));
    billedByProduct.set(short.productId, bucket);
    runningShortAmount = runningShortAmount.plus(amount);
  }

  // ---- Cash handed over --------------------------------------------------
  const cash = await resolveAccount(tx, outletId, "CASH_IN_HAND", "CASH");
  const billedCash = excludedByAccount.get(cash.id) ?? new Decimal(0);
  const reconciliation = reconcileBilledShift({
    declaredCash: settlement.declaredCash,
    billedCash,
    nozzleSaleAmount: settlement.nozzleSaleAmount,
    billedFuelAmount,
    runningShortAmount,
    shortExcess: settlement.shortExcess,
    billedGrandTotal,
  });
  excludedByAccount.set(cash.id, new Decimal(0));
  if (reconciliation.unbilledCashDebit.gt(0)) debits.push({ accountId: cash.id, debit: reconciliation.unbilledCashDebit, narration: "Cash collected" });

  // ---- Everything else the salesman accounted for -------------------------
  for (const collection of settlement.collections) {
    // Cash lines are already represented by declaredCash; counting them here
    // would debit the same rupee twice.
    if (collection.kind === "CASH") continue;
    const amount = dec(collection.amount);
    if (amount.isZero()) continue;
    const accountId = await collectionAccountId(tx, outletId, collection);
    const excluded = excludedByAccount.get(accountId) ?? new Decimal(0);
    const excludedHere = Decimal.min(amount, excluded);
    const remainder = round2(amount.minus(excludedHere));
    excludedByAccount.set(accountId, excluded.minus(excludedHere));
    if (remainder.isZero()) continue;
    debits.push({
      accountId,
      debit: remainder,
      narration: [collection.kind.replaceAll("_", " "), collection.slipNo ?? collection.referenceNo ?? collection.narration].filter(Boolean).join(" · "),
      productId: collection.productId ?? undefined,
      quantity: collection.quantity ? round2(dec(collection.quantity).mul(remainder).div(amount)) : undefined,
    });
  }

  const unmatched = [...excludedByAccount.values()].reduce((sum, amount) => sum.plus(amount), new Decimal(0));
  if (unmatched.gt(0)) {
    throw new Error(`Linked fuel bills exceed the matching non-cash shift collections by ${round2(unmatched).toFixed(2)}`);
  }

  // ---- Fuel revenue, per product, carrying litres -------------------------
  const readings = await tx.nozzleReading.findMany({
    where: { shiftEntryId: settlement.shiftEntryId, salesmanEmployeeId: settlement.employeeId },
    include: { product: { select: { id: true, name: true, isFuel: true } } },
  });

  const byProduct = new Map<string, { isFuel: boolean; name: string; amount: Decimal; litres: Decimal }>();
  for (const reading of readings) {
    const bucket = byProduct.get(reading.productId) ?? { isFuel: reading.product.isFuel, name: reading.product.name, amount: new Decimal(0), litres: new Decimal(0) };
    bucket.amount = bucket.amount.plus(dec(reading.saleAmount));
    bucket.litres = bucket.litres.plus(dec(reading.saleLitres));
    byProduct.set(reading.productId, bucket);
  }

  for (const [productId, billed] of billedByProduct) {
    const metered = byProduct.get(productId);
    if (!metered || billed.amount.gt(metered.amount) || billed.litres.gt(metered.litres)) {
      throw new Error(`Linked bills for ${billed.name} exceed this salesman's metered sale`);
    }
    metered.amount = metered.amount.minus(billed.amount);
    metered.litres = metered.litres.minus(billed.litres);
  }

  const fuelSales = await resolveAccount(tx, outletId, "SALES_MS", "SALES_MS");
  const lubeSales = await resolveAccount(tx, outletId, "SALES_LUBE", "LUBE_SALES");

  let postedSale = new Decimal(0);
  const saleLines: JournalLine[] = [];
  for (const [productId, bucket] of byProduct) {
    if (bucket.amount.isZero()) continue;
    saleLines.push({
      accountId: bucket.isFuel ? fuelSales.id : lubeSales.id,
      credit: round2(bucket.amount),
      productId,
      quantity: round2(bucket.litres),
      narration: `${bucket.name} sales`,
    });
    postedSale = postedSale.plus(round2(bucket.amount));
  }

  // The settlement stores a rounded nozzle total; if summing the per-product
  // lines lands a paisa away, correct the largest line rather than letting the
  // voucher fail to balance.
  const residue = round2(reconciliation.unbilledNozzleSale.minus(postedSale));
  if (!residue.isZero() && saleLines.length > 0) {
    const largest = saleLines.reduce((best, line) => (new Decimal(line.credit ?? 0).gt(new Decimal(best.credit ?? 0)) ? line : best), saleLines[0]);
    largest.credit = round2(new Decimal(largest.credit ?? 0).plus(residue));
  }
  credits.push(...saleLines);

  const counterSale = dec(settlement.counterSaleAmount);
  if (counterSale.gt(0)) credits.push({ accountId: lubeSales.id, credit: counterSale, narration: "Counter and lube sales" });

  // If the printed cash bills are greater than the physical cash handed in,
  // the bill voucher initially debits too much cash. Credit that difference
  // here; the adjusted short below debits the salesman for the same amount.
  if (reconciliation.billedCashShort.gt(0)) {
    credits.push({ accountId: cash.id, credit: reconciliation.billedCashShort, narration: "Billed cash not handed over" });
  }

  // ---- Short or excess ----------------------------------------------------
  // Bill debit is at grand total while fuel revenue is at metered value; the
  // difference is bill round-off. Removing both from the shift therefore
  // shifts its short/excess by that exact difference.
  const shortExcess = reconciliation.adjustedShortExcess;
  if (shortExcess.lt(0)) {
    const ledger = settlement.employee.accountId
      ? { id: settlement.employee.accountId }
      : await ensureEmployeeLedger(tx, outletId, settlement.employeeId);
    debits.push({ accountId: ledger.id, debit: shortExcess.abs(), employeeId: settlement.employeeId, narration: "Shift cash short recoverable" });
  } else if (shortExcess.gt(0)) {
    const suspense = await resolveAccount(tx, outletId, "CASH_EXCESS_SUSPENSE", "SHORT_EXCESS");
    credits.push({ accountId: suspense.id, credit: shortExcess, employeeId: settlement.employeeId, narration: "Shift cash excess" });
  }

  if (debits.length === 0 && credits.length === 0) return null;

  return postVoucher(tx, {
    outletId,
    type: "SHIFT_CLOSE",
    businessDate: settlement.businessDate,
    narration: `${settlement.shiftEntry.shift.name} shift close — ${settlement.employee.code} ${settlement.employee.name}`,
    shiftSettlementId: settlementId,
    shiftEntryId: settlement.shiftEntryId,
    createdById: options.createdById,
    financialYearStartMonth: options.financialYearStartMonth,
    lines: [...debits, ...credits],
  });
}

/**
 * Cost of goods sold for one business date:
 *
 *   Dr Cost of goods sold (per product, carrying litres)
 *      Cr Stock-in-trade
 *
 * Driven by the stock ledger, so it agrees with the physical stock movements
 * by construction and the P&L gross profit can be checked against them
 * independently. Keyed by date so reposting replaces rather than duplicates.
 */
export async function postDailyCogs(tx: Tx, outletId: string, businessDate: Date, options: { createdById?: string; financialYearStartMonth?: number } = {}) {
  const sourceKey = `COGS:${businessDate.toISOString().slice(0, 10)}`;
  await discardVoucherFor(tx, { outletId, sourceKey });

  // Only what was actually sold. A retained sample also leaves the tank, but
  // it was not sold to anyone, so charging it to cost of goods sold would
  // understate margin per litre and break the tie-out against sale litres.
  const movements = await tx.stockMovement.groupBy({
    by: ["productId"],
    where: { outletId, businessDate, isCancelled: false, type: "SALE" },
    _sum: { quantity: true, value: true },
  });
  const samples = await tx.stockMovement.groupBy({
    by: ["productId"],
    where: { outletId, businessDate, isCancelled: false, type: "SAMPLE_DRAW" },
    _sum: { quantity: true, value: true },
  });
  if (movements.length === 0 && samples.length === 0) return null;

  const stock = await resolveAccount(tx, outletId, "STOCK_IN_TRADE", "FUEL_STOCK");
  const lines: JournalLine[] = [];
  let total = new Decimal(0);

  for (const movement of movements) {
    const cost = round2(dec(movement._sum.value).abs());
    if (cost.isZero()) continue;
    const product = await tx.product.findUniqueOrThrow({ where: { id: movement.productId }, select: { isFuel: true, name: true } });
    const account = await cogsAccountFor(tx, outletId, product.isFuel);
    lines.push({
      accountId: account.id,
      debit: cost,
      productId: movement.productId,
      quantity: round2(dec(movement._sum.quantity).abs()),
      narration: `${product.name} cost of sales`,
    });
    total = total.plus(cost);
  }
  // Samples go to the stock-loss ledger, not cost of goods sold.
  if (samples.length > 0) {
    const lossAccount = await resolveAccount(tx, outletId, "EVAPORATION_LOSS", "EVAP");
    for (const sample of samples) {
      const cost = round2(dec(sample._sum.value).abs());
      if (cost.isZero()) continue;
      lines.push({
        accountId: lossAccount.id,
        debit: cost,
        productId: sample.productId,
        quantity: round2(dec(sample._sum.quantity).abs()),
        narration: "Retained sample drawn",
      });
      total = total.plus(cost);
    }
  }

  if (lines.length === 0) return null;

  lines.push({ accountId: stock.id, credit: round2(total), narration: "Stock consumed" });

  return postVoucher(tx, {
    outletId,
    type: "JOURNAL",
    businessDate,
    narration: "Cost of goods sold",
    sourceKey,
    createdById: options.createdById,
    financialYearStartMonth: options.financialYearStartMonth,
    lines,
  });
}

/**
 * A tanker receipt:
 *
 *   Dr Stock-in-trade      litres that actually went into the tank, at cost
 *   Dr Transit loss        the shortfall against the invoice
 *   Dr TCS receivable      tax collected at source
 *      Cr Supplier         the invoice total
 *
 * Booking the whole invoice to stock would overstate inventory by the litres
 * that never arrived, and would hide the loss the tanker-loss report exists
 * to surface.
 */
export async function postPurchaseVoucher(tx: Tx, purchaseId: string, options: { createdById?: string; financialYearStartMonth?: number } = {}) {
  const purchase = await tx.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
    include: { supplier: { select: { id: true, name: true, accountId: true } }, decantations: true, lines: true },
  });
  const outletId = purchase.outletId;
  await discardVoucherFor(tx, { purchaseId });
  if (purchase.status === "CANCELLED") return null;

  const supplierLedger = purchase.supplier.accountId
    ? { id: purchase.supplier.accountId }
    : await ensureSupplierLedger(tx, outletId, purchase.supplierId);

  const stock = await resolveAccount(tx, outletId, "STOCK_IN_TRADE", "FUEL_STOCK");
  const total = dec(purchase.totalAmount);
  const tcs = dec(purchase.tcsAmount);
  const goodsValue = round2(total.minus(tcs));

  // Value the loss at the same rate the stock went in at.
  let lossValue = new Decimal(0);
  for (const decantation of purchase.decantations) lossValue = lossValue.plus(dec(decantation.lossValue));
  lossValue = round2(Decimal.min(lossValue.abs(), goodsValue));

  const lines: JournalLine[] = [
    { accountId: stock.id, debit: round2(goodsValue.minus(lossValue)), narration: `${purchase.invoiceNo} · ${purchase.vehicleNo ?? ""}`.trim() },
  ];
  if (lossValue.gt(0)) {
    const transitLoss = await resolveAccount(tx, outletId, "TRANSIT_LOSS", "TRANSIT_LOSS");
    lines.push({ accountId: transitLoss.id, debit: lossValue, narration: `Receipt loss on ${purchase.vehicleNo ?? purchase.invoiceNo}` });
  }
  if (tcs.gt(0)) {
    const tcsAccount = await resolveAccount(tx, outletId, "TCS_RECEIVABLE", "TCS_REC");
    lines.push({ accountId: tcsAccount.id, debit: tcs, narration: "TCS u/s 206C(1H)" });
  }
  lines.push({ accountId: supplierLedger.id, credit: total, narration: purchase.invoiceNo });

  return postVoucher(tx, {
    outletId,
    type: "PURCHASE",
    businessDate: purchase.businessDate,
    narration: `Purchase ${purchase.invoiceNo} — ${purchase.supplier.name}`,
    purchaseId,
    partyAccountId: supplierLedger.id,
    instrumentType: "ADJUSTMENT",
    createdById: options.createdById,
    financialYearStartMonth: options.financialYearStartMonth,
    lines,
  });
}

/**
 * An approved stock variation beyond the permitted allowance:
 *
 *   Dr Evaporation / stock loss    Cr Stock-in-trade    (shortage)
 *   Dr Stock-in-trade              Cr Evaporation       (gain)
 */
export async function postStockVariationVoucher(tx: Tx, stockVariationId: string, options: { createdById?: string; financialYearStartMonth?: number } = {}) {
  const variation = await tx.stockVariation.findUniqueOrThrow({ where: { id: stockVariationId }, include: { tank: { select: { code: true } }, product: { select: { name: true } } } });
  await discardVoucherFor(tx, { stockVariationId });
  if (variation.status !== "APPROVED" && variation.status !== "WRITTEN_OFF") return null;

  const value = round2(dec(variation.variationValue));
  if (value.isZero()) return null;

  const outletId = variation.outletId;
  const stock = await resolveAccount(tx, outletId, "STOCK_IN_TRADE", "FUEL_STOCK");
  const loss = await resolveAccount(tx, outletId, "EVAPORATION_LOSS", "EVAP");
  const narration = `${variation.tank.code} ${variation.product.name} variation ${dec(variation.variationLitres).toFixed(2)} L`;
  const amount = value.abs();

  return postVoucher(tx, {
    outletId,
    type: "STOCK_ADJUSTMENT",
    businessDate: variation.businessDate,
    narration,
    stockVariationId,
    createdById: options.createdById,
    financialYearStartMonth: options.financialYearStartMonth,
    lines: value.lt(0)
      ? [
          { accountId: loss.id, debit: amount, productId: variation.productId, quantity: dec(variation.variationLitres).abs(), narration },
          { accountId: stock.id, credit: amount, narration },
        ]
      : [
          { accountId: stock.id, debit: amount, narration },
          { accountId: loss.id, credit: amount, productId: variation.productId, quantity: dec(variation.variationLitres).abs(), narration },
        ],
  });
}

export const auditJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Capitalises the stock standing in the tanks on the first trading day.
 *
 * Without this the stock ledger starts at zero and the first sale drives the
 * asset negative — stock would be consumed that the books never recorded
 * arriving. The contra is the owner's capital account: that fuel was paid for
 * before the books opened.
 *
 *   Dr Stock-in-trade      Cr Capital account
 */
export async function postOpeningStock(tx: Tx, outletId: string, asOn: Date, options: { createdById?: string } = {}) {
  const sourceKey = `OPENING_STOCK:${asOn.toISOString().slice(0, 10)}`;
  await discardVoucherFor(tx, { outletId, sourceKey });

  // The earliest opening dip on each tank is the stock that was already there.
  const tanks = await tx.tank.findMany({ where: { outletId }, select: { id: true, code: true, productId: true } });
  const lines: JournalLine[] = [];
  let total = new Decimal(0);

  for (const tank of tanks) {
    const dip = await tx.dipReading.findFirst({
      where: { outletId, tankId: tank.id, readingType: "OPENING" },
      orderBy: [{ businessDate: "asc" }, { readingAt: "asc" }],
      select: { netLitres: true, businessDate: true },
    });
    if (!dip) continue;
    const litres = dec(dip.netLitres);
    if (litres.lte(0)) continue;

    const product = await tx.product.findUniqueOrThrow({ where: { id: tank.productId }, select: { weightedAvgCost: true, name: true, isFuel: true } });
    let cost = dec(product.weightedAvgCost);
    if (cost.lte(0)) {
      const price = await tx.priceHistory.findFirst({ where: { outletId, productId: tank.productId, purchaseRate: { not: null } }, orderBy: { effectiveFrom: "asc" }, select: { purchaseRate: true } });
      cost = dec(price?.purchaseRate);
    }
    const value = round2(litres.mul(cost));
    if (value.isZero()) continue;

    lines.push({ accountId: "", debit: value, productId: tank.productId, quantity: litres, narration: `${tank.code} opening ${product.name}` });
    total = total.plus(value);
  }
  if (lines.length === 0) return null;

  // Every line debits the one stock ledger; they stay separate so the opening
  // position is readable per tank and per product.
  const stock = await resolveAccount(tx, outletId, "STOCK_IN_TRADE", "FUEL_STOCK");
  for (const line of lines) line.accountId = stock.id;

  const capital = await resolveAccount(tx, outletId, "CAPITAL", "CAPITAL");
  lines.push({ accountId: capital.id, credit: round2(total), narration: "Opening stock introduced" });

  return postVoucher(tx, {
    outletId,
    type: "OPENING_BALANCE",
    businessDate: asOn,
    narration: "Opening stock in tanks",
    sourceKey,
    createdById: options.createdById,
    lines,
  });
}
