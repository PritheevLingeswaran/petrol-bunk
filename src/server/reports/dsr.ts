/**
 * Daily Sales Report — the single sheet the owner reads at night.
 *
 * One page covering the whole day: nozzle readings, sale by product,
 * collections, dips and density, stock variation and the cash position. It is
 * assembled entirely from what the shift and the ledger already recorded, so
 * it can never disagree with the books.
 */
import { Decimal, round2 } from "@/lib/money";
import { businessDateFromInput } from "@/lib/date";
import { getOutletScope } from "@/server/guard";
import { db } from "@/server/db";

const dec = (value: { toString(): string } | null | undefined): Decimal => new Decimal(value?.toString() ?? "0");
const f2 = (value: Decimal): string => value.toFixed(2);

export type DsrNozzle = {
  shift: string;
  nozzle: string;
  product: string;
  salesman: string;
  opening: string;
  closing: string;
  testing: string;
  litres: string;
  rate: string;
  amount: string;
};

export type DsrProduct = { product: string; litres: string; amount: string; rate: string };
export type DsrCollection = { mode: string; amount: string };
export type DsrDip = {
  tank: string;
  product: string;
  openingDip: string;
  closingDip: string;
  openingLitres: string;
  closingLitres: string;
  waterMm: string;
  density: string;
  densityOk: boolean;
};
export type DsrVariation = {
  tank: string;
  product: string;
  opening: string;
  receipts: string;
  sales: string;
  book: string;
  physical: string;
  variation: string;
  permissible: string;
  excess: string;
  value: string;
  withinAllowance: boolean;
};
export type DsrSettlement = {
  salesman: string;
  saleValue: string;
  cash: string;
  card: string;
  upi: string;
  credit: string;
  ownUse: string;
  expenses: string;
  collections: string;
  shortExcess: string;
};

export type DsrReport = {
  date: string;
  outlet: { name: string; address: string; gstin: string; omc: string };
  nozzles: DsrNozzle[];
  products: DsrProduct[];
  collections: DsrCollection[];
  dips: DsrDip[];
  variations: DsrVariation[];
  settlements: DsrSettlement[];
  decantations: { invoiceNo: string; vehicle: string; product: string; tank: string; invoiceQty: string; received: string; loss: string; withinAllowance: boolean }[];
  totals: {
    litres: string;
    fuelSale: string;
    counterSale: string;
    totalSale: string;
    collections: string;
    shortExcess: string;
    cashInHand: string;
    openingCash: string;
    creditIssued: string;
    outstanding: string;
    testingLitres: string;
  };
  alerts: string[];
  preparedAt: string;
};

export async function getDsr(date: string, only?: string[]): Promise<DsrReport> {
  const scope = only && only.length > 0 ? { outletIds: only } : await getOutletScope();
  const outletIds = scope.outletIds;
  const businessDate = businessDateFromInput(date);
  const previousDate = new Date(businessDate.getTime() - 86_400_000);

  const [outlet, readings, settlements, dips, densities, variations, decantations, cashRows, openingCashRows, outstandingRows] = await Promise.all([
    db.outlet.findUnique({ where: { id: outletIds[0] }, select: { name: true, addressLine1: true, city: true, state: true, pincode: true, gstin: true, omc: true } }),
    db.nozzleReading.findMany({
      where: { outletId: { in: outletIds }, businessDate },
      include: {
        nozzle: { select: { code: true } },
        product: { select: { name: true } },
        salesman: { select: { name: true, code: true } },
        shiftEntry: { select: { shift: { select: { name: true, sequence: true } } } },
      },
      orderBy: [{ rateSegment: "asc" }, { nozzleId: "asc" }],
    }),
    db.shiftSettlement.findMany({
      where: { outletId: { in: outletIds }, businessDate },
      include: { employee: { select: { name: true, code: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.dipReading.findMany({
      where: { outletId: { in: outletIds }, businessDate },
      include: { tank: { select: { code: true, product: { select: { name: true } } } } },
      orderBy: [{ tankId: "asc" }, { readingAt: "asc" }],
    }),
    db.densityReading.findMany({
      where: { outletId: { in: outletIds }, businessDate },
      include: { tank: { select: { code: true } } },
      orderBy: { readingAt: "asc" },
    }),
    db.stockVariation.findMany({
      where: { outletId: { in: outletIds }, businessDate },
      include: { tank: { select: { code: true } }, product: { select: { name: true } } },
      orderBy: { tankId: "asc" },
    }),
    db.decantation.findMany({
      where: { outletId: { in: outletIds }, businessDate, status: { not: "CANCELLED" } },
      include: { product: { select: { name: true } }, tank: { select: { code: true } } },
    }),
    db.$queryRaw<{ movement: string }[]>`
      SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS movement
      FROM voucher_lines l JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND g."cashFlowCategory" = 'CASH_EQUIVALENT'
        AND l."businessDate" <= ${businessDate}`,
    db.$queryRaw<{ movement: string }[]>`
      SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS movement
      FROM voucher_lines l JOIN accounts a ON a.id = l."accountId"
      JOIN account_groups g ON g.id = a."groupId"
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND g."cashFlowCategory" = 'CASH_EQUIVALENT'
        AND l."businessDate" <= ${previousDate}`,
    db.$queryRaw<{ movement: string }[]>`
      SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS movement
      FROM voucher_lines l
      JOIN accounts a ON a.id = l."accountId"
      JOIN customers c ON c."accountId" = a.id
      JOIN vouchers v ON v.id = l."voucherId" AND v.status = 'POSTED'
      WHERE l."outletId" = ANY(${outletIds}) AND l."businessDate" <= ${businessDate}`,
  ]);

  // ---- Nozzle readings ---------------------------------------------------
  const nozzles: DsrNozzle[] = readings.map((reading) => ({
    shift: reading.shiftEntry.shift.name,
    nozzle: reading.nozzle.code,
    product: reading.product.name,
    salesman: reading.salesman ? `${reading.salesman.code}` : "—",
    opening: f2(dec(reading.openingReading)),
    closing: f2(dec(reading.closingReading)),
    testing: f2(dec(reading.testingLitres)),
    litres: f2(dec(reading.saleLitres)),
    rate: f2(dec(reading.rate)),
    amount: f2(dec(reading.saleAmount)),
  }));

  // ---- Sale by product ---------------------------------------------------
  const productTotals = new Map<string, { litres: Decimal; amount: Decimal }>();
  let testingLitres = new Decimal(0);
  for (const reading of readings) {
    const bucket = productTotals.get(reading.product.name) ?? { litres: new Decimal(0), amount: new Decimal(0) };
    bucket.litres = bucket.litres.plus(dec(reading.saleLitres));
    bucket.amount = bucket.amount.plus(dec(reading.saleAmount));
    productTotals.set(reading.product.name, bucket);
    testingLitres = testingLitres.plus(dec(reading.testingLitres));
  }
  const products: DsrProduct[] = [...productTotals.entries()].map(([product, bucket]) => ({
    product,
    litres: f2(round2(bucket.litres)),
    amount: f2(round2(bucket.amount)),
    rate: bucket.litres.isZero() ? "0.00" : f2(round2(bucket.amount.div(bucket.litres))),
  }));

  // ---- Collections and settlements --------------------------------------
  const collectionTotals = { cash: new Decimal(0), card: new Decimal(0), upi: new Decimal(0), wallet: new Decimal(0), credit: new Decimal(0), ownUse: new Decimal(0), expenses: new Decimal(0) };
  let saleValue = new Decimal(0);
  let counterSale = new Decimal(0);
  let shortExcess = new Decimal(0);

  const settlementRows: DsrSettlement[] = settlements.map((settlement) => {
    collectionTotals.cash = collectionTotals.cash.plus(dec(settlement.declaredCash));
    collectionTotals.card = collectionTotals.card.plus(dec(settlement.cardTotal));
    collectionTotals.upi = collectionTotals.upi.plus(dec(settlement.upiTotal));
    collectionTotals.wallet = collectionTotals.wallet.plus(dec(settlement.walletTotal));
    collectionTotals.credit = collectionTotals.credit.plus(dec(settlement.creditTotal));
    collectionTotals.ownUse = collectionTotals.ownUse.plus(dec(settlement.ownUseTotal));
    collectionTotals.expenses = collectionTotals.expenses.plus(dec(settlement.expenseTotal));
    saleValue = saleValue.plus(dec(settlement.totalSaleValue));
    counterSale = counterSale.plus(dec(settlement.counterSaleAmount));
    shortExcess = shortExcess.plus(dec(settlement.shortExcess));
    return {
      salesman: `${settlement.employee.code} ${settlement.employee.name}`,
      saleValue: f2(dec(settlement.totalSaleValue)),
      cash: f2(dec(settlement.declaredCash)),
      card: f2(dec(settlement.cardTotal)),
      upi: f2(dec(settlement.upiTotal)),
      credit: f2(dec(settlement.creditTotal)),
      ownUse: f2(dec(settlement.ownUseTotal)),
      expenses: f2(dec(settlement.expenseTotal)),
      collections: f2(dec(settlement.totalCollections)),
      shortExcess: f2(dec(settlement.shortExcess)),
    };
  });

  const collections: DsrCollection[] = [
    { mode: "Cash", amount: f2(round2(collectionTotals.cash)) },
    { mode: "Card", amount: f2(round2(collectionTotals.card)) },
    { mode: "UPI", amount: f2(round2(collectionTotals.upi)) },
    { mode: "Wallet", amount: f2(round2(collectionTotals.wallet)) },
    { mode: "Credit", amount: f2(round2(collectionTotals.credit)) },
    { mode: "Own use", amount: f2(round2(collectionTotals.ownUse)) },
    { mode: "Expenses from till", amount: f2(round2(collectionTotals.expenses)) },
  ].filter((row) => !dec(row.amount).isZero());

  // ---- Dips and density --------------------------------------------------
  const densityByTank = new Map(densities.map((row) => [row.tank.code, row]));
  const dipsByTank = new Map<string, { product: string; opening?: (typeof dips)[number]; closing?: (typeof dips)[number]; water: Decimal }>();
  for (const dip of dips) {
    const entry = dipsByTank.get(dip.tank.code) ?? { product: dip.tank.product.name, water: new Decimal(0) };
    if (dip.readingType === "OPENING") entry.opening = dip;
    if (dip.readingType === "CLOSING") entry.closing = dip;
    entry.water = Decimal.max(entry.water, dec(dip.waterDipMm));
    entry.product = dip.tank.product.name;
    dipsByTank.set(dip.tank.code, entry);
  }
  const dipRows: DsrDip[] = [...dipsByTank.entries()].map(([tank, entry]) => {
    const density = densityByTank.get(tank);
    return {
      tank,
      product: entry.product,
      openingDip: entry.opening ? f2(dec(entry.opening.fuelDipMm)) : "—",
      closingDip: entry.closing ? f2(dec(entry.closing.fuelDipMm)) : "—",
      openingLitres: entry.opening ? f2(dec(entry.opening.netLitres)) : "—",
      closingLitres: entry.closing ? f2(dec(entry.closing.netLitres)) : "—",
      waterMm: f2(entry.water),
      density: density ? dec(density.densityAt15C).toFixed(1) : "—",
      densityOk: density ? density.withinTolerance : true,
    };
  });

  // ---- Stock variation ---------------------------------------------------
  const variationRows: DsrVariation[] = variations.map((row) => ({
    tank: row.tank.code,
    product: row.product.name,
    opening: f2(dec(row.openingStock)),
    receipts: f2(dec(row.receipts)),
    sales: f2(dec(row.sales)),
    book: f2(dec(row.bookStock)),
    physical: f2(dec(row.dipStock)),
    variation: f2(dec(row.variationLitres)),
    permissible: f2(dec(row.allowedLitres)),
    excess: f2(dec(row.excessLossLitres)),
    value: f2(dec(row.variationValue)),
    withinAllowance: row.withinAllowance,
  }));

  // ---- Alerts worth printing on the sheet --------------------------------
  const alerts: string[] = [];
  if (shortExcess.lt(0)) alerts.push(`Cash short of ${shortExcess.abs().toFixed(2)} across the day's settlements.`);
  for (const row of variationRows.filter((entry) => !entry.withinAllowance)) {
    alerts.push(`Tank ${row.tank} variation ${row.variation} L exceeds the permitted ${row.permissible} L.`);
  }
  for (const row of dipRows.filter((entry) => !entry.densityOk)) {
    alerts.push(`Tank ${row.tank} density ${row.density} kg/m³ is outside the permitted band.`);
  }
  for (const row of decantations.filter((entry) => !entry.withinAllowance)) {
    alerts.push(`Tanker ${row.vehicleNo ?? row.invoiceNo ?? ""} receipt loss ${dec(row.transitLoss).toFixed(2)} L exceeds the permitted allowance.`);
  }
  if (readings.length === 0) alerts.push("No nozzle readings were recorded for this date.");

  const totalLitres = products.reduce((sum, row) => sum.plus(dec(row.litres)), new Decimal(0));
  const fuelSale = products.reduce((sum, row) => sum.plus(dec(row.amount)), new Decimal(0));

  return {
    date,
    outlet: {
      name: outlet?.name ?? "",
      address: [outlet?.addressLine1, outlet?.city, outlet?.state, outlet?.pincode].filter(Boolean).join(", "),
      gstin: outlet?.gstin ?? "",
      omc: outlet?.omc ?? "",
    },
    nozzles,
    products,
    collections,
    dips: dipRows,
    variations: variationRows,
    settlements: settlementRows,
    decantations: decantations.map((row) => ({
      invoiceNo: row.invoiceNo ?? "",
      vehicle: row.vehicleNo ?? "",
      product: row.product.name,
      tank: row.tank.code,
      invoiceQty: f2(dec(row.invoiceQty)),
      received: f2(dec(row.receivedQty)),
      loss: f2(dec(row.transitLoss)),
      withinAllowance: row.withinAllowance,
    })),
    totals: {
      litres: f2(round2(totalLitres)),
      fuelSale: f2(round2(fuelSale)),
      counterSale: f2(round2(counterSale)),
      totalSale: f2(round2(saleValue.isZero() ? fuelSale : saleValue)),
      collections: f2(round2(Object.values(collectionTotals).reduce((sum, value) => sum.plus(value), new Decimal(0)))),
      shortExcess: f2(round2(shortExcess)),
      cashInHand: f2(round2(dec(cashRows[0]?.movement))),
      openingCash: f2(round2(dec(openingCashRows[0]?.movement))),
      creditIssued: f2(round2(collectionTotals.credit)),
      outstanding: f2(round2(dec(outstandingRows[0]?.movement))),
      testingLitres: f2(round2(testingLitres)),
    },
    alerts,
    preparedAt: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date()),
  };
}
