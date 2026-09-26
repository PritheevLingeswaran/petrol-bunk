import { Decimal, round2, round4 } from "@/lib/money";

export type StockArithmeticRow = {
  quantity: Decimal.Value;
  rate: Decimal.Value;
  value?: Decimal.Value;
  countsAsSale?: boolean;
  inPeriod?: boolean;
};

export function stockLedgerBalances(rows: StockArithmeticRow[]) {
  let quantity = new Decimal(0);
  let value = new Decimal(0);
  return rows.map((row) => {
    const movementQuantity = new Decimal(row.quantity);
    const movementValue =
      row.value === undefined
        ? movementQuantity.mul(row.rate)
        : new Decimal(row.value);
    quantity = quantity.plus(movementQuantity);
    value = value.plus(movementValue);
    return { quantity: round2(quantity), value: round2(value) };
  });
}

export function stockCover(input: {
  stock: Decimal.Value;
  capacity?: Decimal.Value;
  averageDailySale: Decimal.Value;
}) {
  const stock = new Decimal(input.stock);
  const capacity = new Decimal(input.capacity ?? 0);
  const average = new Decimal(input.averageDailySale);
  return {
    daysCover: average.gt(0)
      ? round2(Decimal.max(stock, 0).div(average))
      : null,
    ullage: capacity.gt(0)
      ? round2(Decimal.max(capacity.minus(stock), 0))
      : null,
    fillPct: capacity.gt(0)
      ? round2(Decimal.max(Decimal.min(stock.div(capacity).mul(100), 100), 0))
      : null,
  };
}

export function fifoCost(rows: StockArithmeticRow[]): Decimal {
  const layers: { quantity: Decimal; rate: Decimal }[] = [];
  let cogs = new Decimal(0);
  for (const row of rows) {
    let quantity = new Decimal(row.quantity);
    const rate = new Decimal(row.rate);
    if (quantity.gt(0)) {
      layers.push({ quantity, rate });
      continue;
    }
    quantity = quantity.abs();
    let consumed = new Decimal(0);
    while (quantity.gt(0)) {
      const layer = layers[0];
      if (!layer) throw new Error("FIFO stock cannot fall below zero");
      const used = Decimal.min(quantity, layer.quantity);
      consumed = consumed.plus(used.mul(layer.rate));
      layer.quantity = layer.quantity.minus(used);
      quantity = quantity.minus(used);
      if (layer.quantity.isZero()) layers.shift();
    }
    if (row.countsAsSale && row.inPeriod) cogs = cogs.plus(consumed);
  }
  return round2(cogs);
}

export function productMargin(input: {
  saleQuantity: Decimal.Value;
  saleValue: Decimal.Value;
  cogs: Decimal.Value;
}) {
  const quantity = new Decimal(input.saleQuantity);
  const saleValue = new Decimal(input.saleValue);
  const cogs = new Decimal(input.cogs);
  const grossProfit = round2(saleValue.minus(cogs));
  return {
    grossProfit,
    marginPerUnit: quantity.gt(0)
      ? round4(grossProfit.div(quantity))
      : new Decimal(0),
    marginPct: saleValue.gt(0)
      ? round4(grossProfit.div(saleValue).mul(100))
      : new Decimal(0),
  };
}
