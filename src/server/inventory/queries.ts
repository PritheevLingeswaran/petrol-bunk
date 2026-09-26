import { Decimal, round2 } from "@/lib/money";
import { businessDateFromInput, businessDateToday } from "@/lib/date";
import {
  fifoCost,
  productMargin,
  stockCover,
  stockLedgerBalances,
} from "@/lib/inventory";
import { formatINR, formatLitres } from "@/lib/format";
import { db } from "@/server/db";
import { getOutletScope, requirePermission } from "@/server/guard";
import { loadSettings } from "@/server/settings";

const iso = (date: Date) => date.toISOString().slice(0, 10);

export async function getInventoryOptions() {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const [products, tanks] = await Promise.all([
    db.product.findMany({
      where: { outletId: { in: scope.outletIds }, isActive: true },
      select: { id: true, code: true, name: true, isFuel: true, type: true },
      orderBy: { code: "asc" },
    }),
    db.tank.findMany({
      where: { outletId: { in: scope.outletIds }, status: "ACTIVE" },
      select: { id: true, code: true, name: true, productId: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return { editable: !scope.allOutlets, products, tanks };
}

export async function getStockLedger(input: {
  from: string;
  to: string;
  productId?: string;
  tankId?: string;
}) {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const from = businessDateFromInput(input.from);
  const to = businessDateFromInput(input.to);
  const rows = await db.stockMovement.findMany({
    where: {
      outletId: { in: scope.outletIds },
      businessDate: { lte: to },
      isCancelled: false,
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.tankId
        ? { OR: [{ fromTankId: input.tankId }, { toTankId: input.tankId }] }
        : {}),
    },
    include: {
      outlet: { select: { name: true } },
      product: { select: { code: true, name: true } },
      fromTank: { select: { code: true } },
      toTank: { select: { code: true } },
      batch: { select: { batchNo: true } },
    },
    orderBy: [{ businessDate: "asc" }, { movedAt: "asc" }, { id: "asc" }],
  });
  const balances = new Map<string, { qty: Decimal; value: Decimal }>();
  const mapped = rows
    .map((row) => {
      const key = input.tankId
        ? `${row.productId}:${input.tankId}`
        : row.productId;
      const previous = balances.get(key) ?? {
        qty: new Decimal(0),
        value: new Decimal(0),
      };
      const quantity = new Decimal(row.quantity.toString());
      const value = new Decimal(row.value.toString());
      const next = {
        qty: previous.qty.plus(quantity),
        value: previous.value.plus(value),
      };
      balances.set(key, next);
      return {
        id: row.id,
        outlet: row.outlet.name,
        date: iso(row.businessDate),
        movedAt: row.movedAt.toISOString(),
        product: `${row.product.code} · ${row.product.name}`,
        tank: row.fromTank?.code ?? row.toTank?.code ?? "General",
        batch: row.batch?.batchNo ?? "",
        type: row.type,
        inward: quantity.gt(0) ? quantity.toFixed(2) : "0.00",
        outward: quantity.lt(0) ? quantity.abs().toFixed(2) : "0.00",
        rate: new Decimal(row.rate.toString()).toFixed(4),
        value: value.toFixed(2),
        balanceQty: next.qty.toFixed(2),
        balanceValue: next.value.toFixed(2),
        sourceType: row.sourceType ?? "",
        sourceId: row.sourceId ?? "",
        remarks: row.remarks ?? "",
        visible: row.businessDate >= from,
      };
    })
    .filter((row) => row.visible);
  const totals = stockLedgerBalances(
    rows.map((row) => ({
      quantity: row.quantity.toString(),
      rate: row.rate.toString(),
      value: row.value.toString(),
    })),
  );
  const last = totals.at(-1) ?? {
    quantity: new Decimal(0),
    value: new Decimal(0),
  };
  return {
    rows: mapped,
    closingQuantity: last.quantity.toFixed(2),
    closingValue: last.value.toFixed(2),
  };
}

export async function getStockStatus() {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const today = businessDateToday();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  const tanks = await db.tank.findMany({
    where: { outletId: { in: scope.outletIds }, status: "ACTIVE" },
    include: { outlet: true, product: true },
    orderBy: [{ outlet: { code: "asc" } }, { code: "asc" }],
  });
  const rows = [];
  for (const tank of tanks) {
    const movements = await db.stockMovement.findMany({
      where: {
        outletId: tank.outletId,
        isCancelled: false,
        OR: [{ fromTankId: tank.id }, { toTankId: tank.id }],
      },
      select: { quantity: true, value: true, type: true, businessDate: true },
    });
    const stock = movements.reduce(
      (sum, row) => sum.plus(row.quantity.toString()),
      new Decimal(0),
    );
    const value = movements.reduce(
      (sum, row) => sum.plus(row.value.toString()),
      new Decimal(0),
    );
    const sales = movements
      .filter(
        (row) =>
          row.type === "SALE" &&
          row.businessDate >= from &&
          row.businessDate <= today,
      )
      .reduce(
        (sum, row) => sum.plus(new Decimal(row.quantity.toString()).abs()),
        new Decimal(0),
      );
    const average = sales.div(30);
    const cover = stockCover({
      stock,
      capacity: tank.capacity.toString(),
      averageDailySale: average,
    });
    const reorder = new Decimal(
      tank.lowLevelAlert?.toString() ??
        tank.product.reorderLevel?.toString() ??
        "0",
    );
    rows.push({
      id: tank.id,
      outlet: tank.outlet.name,
      tank: tank.code,
      product: tank.product.name,
      litres: stock.toFixed(2),
      value: round2(value).toFixed(2),
      valueDisplay: formatINR(value),
      averageDailySale: round2(average).toFixed(2),
      daysCover: cover.daysCover?.toFixed(2) ?? "—",
      capacity: tank.capacity.toFixed(2),
      ullage: cover.ullage?.toFixed(2) ?? "0.00",
      fillPct: cover.fillPct?.toFixed(2) ?? "0.00",
      reorderLevel: reorder.toFixed(2),
      low: reorder.gt(0) && stock.lte(reorder),
    });
  }
  return { rows, alerts: rows.filter((row) => row.low).length };
}

export async function getProductProfit(input: {
  from: string;
  to: string;
  method?: "WEIGHTED_AVERAGE" | "FIFO";
}) {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const from = businessDateFromInput(input.from);
  const to = businessDateFromInput(input.to);
  const settings = scope.outletIds[0]
    ? await loadSettings(scope.outletIds[0])
    : null;
  const method =
    input.method ??
    (settings?.raw("stock.costingMethod") === "FIFO"
      ? "FIFO"
      : "WEIGHTED_AVERAGE");
  const products = await db.product.findMany({
    where: { outletId: { in: scope.outletIds }, isActive: true },
    orderBy: { code: "asc" },
  });
  const result = [];
  const chart = [];
  for (const product of products) {
    const saleLines = await db.voucherLine.findMany({
      where: {
        outletId: product.outletId,
        productId: product.id,
        businessDate: { gte: from, lte: to },
        voucher: { status: "POSTED" },
        account: { nature: "INCOME" },
      },
      select: { businessDate: true, debit: true, credit: true, quantity: true },
    });
    const quantity = saleLines.reduce(
      (sum, row) =>
        sum
          .plus(row.quantity?.toString() ?? "0")
          .mul(row.credit.gt(row.debit) ? 1 : -1),
      new Decimal(0),
    );
    const saleValue = saleLines.reduce(
      (sum, row) =>
        sum.plus(
          new Decimal(row.credit.toString()).minus(row.debit.toString()),
        ),
      new Decimal(0),
    );
    const movements = await db.stockMovement.findMany({
      where: {
        outletId: product.outletId,
        productId: product.id,
        businessDate: { lte: to },
        isCancelled: false,
      },
      orderBy: [{ businessDate: "asc" }, { movedAt: "asc" }],
    });
    const weightedCogs = movements
      .filter((row) => row.type === "SALE" && row.businessDate >= from)
      .reduce(
        (sum, row) => sum.plus(new Decimal(row.value.toString()).abs()),
        new Decimal(0),
      );
    let cogs = weightedCogs;
    let fifoWarning = false;
    if (method === "FIFO") {
      try {
        cogs = fifoCost(
          movements.map((row) => ({
            quantity: row.quantity.toString(),
            rate: row.rate.toString(),
            countsAsSale: row.type === "SALE",
            inPeriod: row.businessDate >= from,
          })),
        );
      } catch {
        fifoWarning = true;
        cogs = weightedCogs;
      }
    }
    const margin = productMargin({ saleQuantity: quantity, saleValue, cogs });
    if (!quantity.isZero() || !saleValue.isZero())
      result.push({
        productId: product.id,
        product: `${product.code} · ${product.name}`,
        quantity: quantity.toFixed(2),
        saleValue: round2(saleValue).toFixed(2),
        cogs: round2(cogs).toFixed(2),
        grossProfit: margin.grossProfit.toFixed(2),
        marginPerLitre: margin.marginPerUnit.toFixed(4),
        marginPct: margin.marginPct.toFixed(4),
        fifoWarning,
      });
    const daily = new Map<
      string,
      { qty: Decimal; sales: Decimal; cogs: Decimal }
    >();
    for (const line of saleLines) {
      const key = iso(line.businessDate);
      const bucket = daily.get(key) ?? {
        qty: new Decimal(0),
        sales: new Decimal(0),
        cogs: new Decimal(0),
      };
      bucket.qty = bucket.qty.plus(line.quantity?.toString() ?? "0");
      bucket.sales = bucket.sales.plus(
        new Decimal(line.credit.toString()).minus(line.debit.toString()),
      );
      daily.set(key, bucket);
    }
    for (const movement of movements.filter(
      (row) => row.type === "SALE" && row.businessDate >= from,
    )) {
      const key = iso(movement.businessDate);
      const bucket = daily.get(key) ?? {
        qty: new Decimal(0),
        sales: new Decimal(0),
        cogs: new Decimal(0),
      };
      bucket.cogs = bucket.cogs.plus(
        new Decimal(movement.value.toString()).abs(),
      );
      daily.set(key, bucket);
    }
    for (const [date, bucket] of daily)
      chart.push({
        date,
        product: product.code,
        marginPerLitre: bucket.qty.gt(0)
          ? round2(bucket.sales.minus(bucket.cogs).div(bucket.qty)).toNumber()
          : 0,
      });
  }
  return {
    method,
    rows: result,
    chart: chart.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function getTankStock(input: { from: string; to: string }) {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const rows = await db.stockVariation.findMany({
    where: {
      outletId: { in: scope.outletIds },
      businessDate: {
        gte: businessDateFromInput(input.from),
        lte: businessDateFromInput(input.to),
      },
    },
    include: { outlet: true, tank: true, product: true },
    orderBy: [{ businessDate: "desc" }, { tank: { code: "asc" } }],
  });
  return rows.map((row) => ({
    id: row.id,
    date: iso(row.businessDate),
    outlet: row.outlet.name,
    tank: row.tank.code,
    product: row.product.name,
    opening: row.openingStock.toFixed(2),
    receipts: row.receipts.toFixed(2),
    sales: row.sales.toFixed(2),
    book: row.bookStock.toFixed(2),
    physical: row.dipStock.toFixed(2),
    variation: row.variationLitres.toFixed(2),
    variationValue: row.variationValue.toFixed(2),
    withinAllowance: row.withinAllowance,
  }));
}

export async function getBatchInventory() {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const today = businessDateToday();
  const batches = await db.inventoryBatch.findMany({
    where: { outletId: { in: scope.outletIds }, isActive: true },
    include: {
      outlet: true,
      product: true,
      movements: { where: { isCancelled: false } },
    },
    orderBy: [{ expiryDate: "asc" }, { batchNo: "asc" }],
  });
  return batches.map((batch) => {
    const quantity = batch.movements.reduce(
      (sum, row) => sum.plus(row.quantity.toString()),
      new Decimal(0),
    );
    const value = batch.movements.reduce(
      (sum, row) => sum.plus(row.value.toString()),
      new Decimal(0),
    );
    return {
      id: batch.id,
      outlet: batch.outlet.name,
      productId: batch.productId,
      product: `${batch.product.code} · ${batch.product.name}`,
      batchNo: batch.batchNo,
      mrp: batch.mrp?.toFixed(2) ?? "",
      purchaseRate: batch.purchaseRate.toFixed(4),
      manufacturedOn: batch.manufacturedOn ? iso(batch.manufacturedOn) : "",
      expiryDate: batch.expiryDate ? iso(batch.expiryDate) : "",
      barcode: batch.barcode ?? "",
      quantity: quantity.toFixed(2),
      quantityDisplay: formatLitres(quantity),
      value: round2(value).toFixed(2),
      expired: Boolean(batch.expiryDate && batch.expiryDate < today),
      expiringSoon: Boolean(
        batch.expiryDate &&
        batch.expiryDate >= today &&
        batch.expiryDate <= new Date(today.getTime() + 30 * 86_400_000),
      ),
    };
  });
}

export async function getLowStockCount(outletIds: string[]) {
  const tanks = await db.tank.findMany({
    where: { outletId: { in: outletIds }, status: "ACTIVE" },
    include: { product: true },
  });
  let count = 0;
  for (const tank of tanks) {
    const sum = await db.stockMovement.aggregate({
      where: {
        isCancelled: false,
        OR: [{ fromTankId: tank.id }, { toTankId: tank.id }],
      },
      _sum: { quantity: true },
    });
    const stock = new Decimal(sum._sum.quantity?.toString() ?? "0");
    const reorder = new Decimal(
      tank.lowLevelAlert?.toString() ??
        tank.product.reorderLevel?.toString() ??
        "0",
    );
    if (reorder.gt(0) && stock.lte(reorder)) count += 1;
  }
  return count;
}

export async function getInspections() {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  const rows = await db.inspection.findMany({
    where: { outletId: { in: scope.outletIds } },
    include: { outlet: true, items: true, photos: true },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    outlet: row.outlet.name,
    date: iso(row.businessDate),
    type: row.type,
    inspectorName: row.inspectorName ?? "",
    inspectorDesignation: row.inspectorDesignation ?? "",
    organisation: row.organisation ?? row.authority ?? "",
    result: row.result,
    observations: row.observations ?? "",
    correctiveAction: row.correctiveAction ?? row.actionTaken ?? "",
    dueDate: row.correctiveActionDueDate
      ? iso(row.correctiveActionDueDate)
      : "",
    signatureUrl: row.signatureUrl ?? "",
    failed: row.items.filter((item) => item.result === "FAIL").length,
    itemCount: row.items.length,
    photoCount: row.photos.length,
  }));
}

export async function getInspectionDetail(id: string) {
  await requirePermission("INVENTORY", "view");
  const scope = await getOutletScope();
  return db.inspection.findFirst({
    where: { id, outletId: { in: scope.outletIds } },
    include: {
      outlet: { include: { firm: true } },
      items: { orderBy: { sortOrder: "asc" } },
      photos: true,
    },
  });
}
