import { Decimal, round2 } from "@/lib/money";
import { businessDateFromInput, businessDateToday } from "@/lib/date";
import { getOutletScope, requirePermission } from "@/server/guard";
import { db } from "@/server/db";
import { loadSettings } from "@/server/settings";
import { salesmanRecoverable } from "@/server/pump/services";

export type Option = { value: string; label: string };

/**
 * Outlet scope for a report. Defaults to the signed-in user's outlet; an
 * explicit list lets the acceptance harness call the very same function.
 */
export type ReportScope = string[] | undefined;
const resolveScope = async (only?: ReportScope) =>
  only && only.length > 0 ? { outletIds: only, allOutlets: false } : await getOutletScope();

const str = (value: { toString(): string } | null | undefined): string => value?.toString() ?? "";
const iso = (value: Date | null | undefined): string => (value ? value.toISOString().slice(0, 10) : "");

export type PumpOptions = {
  shifts: (Option & { startTime: string; endTime: string })[];
  tanks: (Option & { productId: string; productName: string })[];
  products: Option[];
  employees: Option[];
  customers: (Option & { vehicles: Option[] })[];
  paymentModes: (Option & { kind: string })[];
  expenseHeads: Option[];
  suppliers: Option[];
  users: Option[];
  denominations: number[];
};

export async function getPumpOptions(): Promise<PumpOptions> {
  const session = await requirePermission("PUMP_OPERATIONS", "view");
  const scope = await getOutletScope();
  const where = { outletId: { in: scope.outletIds } };
  const ownEmployee = session.user.role === "SALESMAN" ? { userId: session.user.id } : {};
  const [shifts, tanks, products, employees, customers, paymentModes, expenseHeads, suppliers, users] = await Promise.all([
    db.shift.findMany({ where: { ...where, isActive: true }, orderBy: { sequence: "asc" } }),
    db.tank.findMany({ where: { ...where, status: "ACTIVE" }, include: { product: true }, orderBy: { code: "asc" } }),
    db.product.findMany({ where: { ...where, isActive: true }, orderBy: { code: "asc" } }),
    db.employee.findMany({ where: { ...where, status: "ACTIVE", ...ownEmployee }, orderBy: { code: "asc" } }),
    db.customer.findMany({ where: { ...where, isActive: true }, include: { vehicles: { where: { isActive: true } } }, orderBy: { name: "asc" } }),
    db.paymentMode.findMany({ where: { ...where, isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.expenseHead.findMany({ where: { ...where, isActive: true }, orderBy: { code: "asc" } }),
    db.supplier.findMany({ where: { ...where, isActive: true }, orderBy: { code: "asc" } }),
    db.user.findMany({ where: { status: "ACTIVE", ...(session.user.role === "SALESMAN" ? { id: session.user.id } : {}), outlets: { some: { outletId: { in: scope.outletIds } } } }, orderBy: { name: "asc" } }),
  ]);

  const settings = scope.outletIds[0] ? await loadSettings(scope.outletIds[0]) : null;

  return {
    shifts: shifts.map((row) => ({ value: row.id, label: `${row.name} · ${row.startTime}–${row.endTime}`, startTime: row.startTime, endTime: row.endTime })),
    tanks: tanks.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}`, productId: row.productId, productName: row.product.name })),
    products: products.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    employees: employees.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    customers: customers.map((row) => ({
      value: row.id,
      label: `${row.code} · ${row.name}`,
      vehicles: row.vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.vehicleNo })),
    })),
    paymentModes: paymentModes.map((row) => ({ value: row.id, label: row.name, kind: row.type })),
    expenseHeads: expenseHeads.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    suppliers: suppliers.map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
    users: users.map((row) => ({ value: row.id, label: row.name })),
    denominations: settings ? settings.json<number[]>("cash.denominations") : [500, 200, 100, 50, 20, 10, 5, 2, 1],
  };
}

// ---------------------------------------------------------------------------
// Settlement screen
// ---------------------------------------------------------------------------

export type SettlementView = {
  shiftEntryId: string;
  businessDate: string;
  shiftName: string;
  status: string;
  salesmen: {
    employeeId: string;
    employeeName: string;
    nozzleSaleAmount: string;
    nozzleSaleLitres: string;
    settlementId: string | null;
    declaredCash: string;
    denominations: Record<string, number>;
    coinsAmount: string;
    counterSaleAmount: string;
    totalSaleValue: string;
    totalCollections: string;
    shortExcess: string;
    withinTolerance: boolean;
    recoverableToDate: string;
    collections: {
      kind: string;
      paymentModeId: string;
      amount: string;
      machineOrWallet: string;
      referenceNo: string;
      cardLast4: string;
      customerId: string;
      vehicleId: string;
      slipNo: string;
      productId: string;
      quantity: string;
      expenseHeadId: string;
      voucherRef: string;
      narration: string;
    }[];
  }[];
};

export async function getSettlementView(businessDate: string, shiftId: string): Promise<SettlementView | null> {
  const session = await requirePermission("PUMP_OPERATIONS", "view");
  const scope = await getOutletScope();
  const outletId = scope.outletIds[0];
  if (!outletId) return null;
  const date = businessDateFromInput(businessDate);

  const entry = await db.shiftEntry.findUnique({
    where: { outletId_businessDate_shiftId: { outletId, businessDate: date, shiftId } },
    include: {
      shift: true,
      nozzleReadings: { include: { salesman: true } },
      settlements: { include: { employee: true, collections: true } },
    },
  });
  if (!entry) return null;
  const employee = session.user.role === "SALESMAN" ? await db.employee.findFirst({ where: { userId: session.user.id, outletId } }) : null;
  const visibleReadings = employee ? entry.nozzleReadings.filter((row) => row.salesmanEmployeeId === employee.id) : entry.nozzleReadings;
  const visibleSettlements = employee ? entry.settlements.filter((row) => row.employeeId === employee.id) : entry.settlements;

  // Every salesman who touched a nozzle this shift, plus anyone already settled.
  const salesmanIds = new Set<string>();
  for (const reading of visibleReadings) if (reading.salesmanEmployeeId) salesmanIds.add(reading.salesmanEmployeeId);
  for (const settlement of visibleSettlements) salesmanIds.add(settlement.employeeId);

  const salesmen = [];
  for (const employeeId of salesmanIds) {
    const readings = visibleReadings.filter((reading) => reading.salesmanEmployeeId === employeeId);
    const settlement = visibleSettlements.find((row) => row.employeeId === employeeId);
    const employee = settlement?.employee ?? readings[0]?.salesman;
    const saleAmount = readings.reduce((sum, row) => sum.plus(new Decimal(row.saleAmount.toString())), new Decimal(0));
    const saleLitres = readings.reduce((sum, row) => sum.plus(new Decimal(row.saleLitres.toString())), new Decimal(0));

    salesmen.push({
      employeeId,
      employeeName: employee ? `${employee.code} · ${employee.name}` : employeeId,
      nozzleSaleAmount: round2(saleAmount).toFixed(2),
      nozzleSaleLitres: round2(saleLitres).toFixed(2),
      settlementId: settlement?.id ?? null,
      declaredCash: settlement ? str(settlement.declaredCash) : "0",
      denominations: (settlement?.denominationCount as Record<string, number> | null) ?? {},
      coinsAmount: settlement ? str(settlement.coinsAmount) : "0",
      counterSaleAmount: settlement ? str(settlement.counterSaleAmount) : "0",
      totalSaleValue: settlement ? str(settlement.totalSaleValue) : round2(saleAmount).toFixed(2),
      totalCollections: settlement ? str(settlement.totalCollections) : "0",
      shortExcess: settlement ? str(settlement.shortExcess) : "0",
      withinTolerance: settlement?.withinTolerance ?? true,
      recoverableToDate: (await salesmanRecoverable(outletId, employeeId)).toFixed(2),
      collections: (settlement?.collections ?? []).map((row) => ({
        kind: row.kind,
        paymentModeId: row.paymentModeId ?? "",
        amount: str(row.amount),
        machineOrWallet: row.machineOrWallet ?? "",
        referenceNo: row.referenceNo ?? "",
        cardLast4: row.cardLast4 ?? "",
        customerId: row.customerId ?? "",
        vehicleId: row.vehicleId ?? "",
        slipNo: row.slipNo ?? "",
        productId: row.productId ?? "",
        quantity: str(row.quantity),
        expenseHeadId: row.expenseHeadId ?? "",
        voucherRef: row.voucherRef ?? "",
        narration: row.narration ?? "",
      })),
    });
  }

  return {
    shiftEntryId: entry.id,
    businessDate,
    shiftName: entry.shift.name,
    status: entry.status,
    salesmen,
  };
}

// ---------------------------------------------------------------------------
// Dip & density screen
// ---------------------------------------------------------------------------

export type DipDensityView = {
  businessDate: string;
  tanks: {
    tankId: string;
    tankCode: string;
    tankName: string;
    productName: string;
    capacity: string;
    readings: { id: string; readingType: string; fuelDipMm: string; waterDipMm: string; fuelLitres: string; waterLitres: string; netLitres: string; temperatureC: string; waterAlert: boolean }[];
    densities: { id: string; observedDensity: string; temperatureC: string; densityAt15C: string; invoiceDensity: string; deviation: string; withinTolerance: boolean }[];
  }[];
  waterAlertMm: string;
};

export async function getDipDensityView(businessDate: string): Promise<DipDensityView> {
  const scope = await getOutletScope();
  const outletId = scope.outletIds[0];
  const date = businessDateFromInput(businessDate);
  const settings = outletId ? await loadSettings(outletId) : null;
  const waterAlertMm = settings ? settings.decimal("stock.waterDipAlertMm") : new Decimal(25);

  const tanks = await db.tank.findMany({
    where: { outletId: { in: scope.outletIds }, status: "ACTIVE" },
    include: {
      product: true,
      dipReadings: { where: { businessDate: date }, orderBy: { readingAt: "asc" } },
      densityReadings: { where: { businessDate: date }, orderBy: { readingAt: "asc" } },
    },
    orderBy: { code: "asc" },
  });

  return {
    businessDate,
    waterAlertMm: waterAlertMm.toFixed(1),
    tanks: tanks.map((tank) => ({
      tankId: tank.id,
      tankCode: tank.code,
      tankName: tank.name,
      productName: tank.product.name,
      capacity: str(tank.capacity),
      readings: tank.dipReadings.map((row) => ({
        id: row.id,
        readingType: row.readingType,
        fuelDipMm: str(row.fuelDipMm),
        waterDipMm: str(row.waterDipMm),
        fuelLitres: str(row.fuelLitres),
        waterLitres: str(row.waterLitres),
        netLitres: str(row.netLitres),
        temperatureC: str(row.temperatureC),
        waterAlert: new Decimal(row.waterDipMm.toString()).gt(waterAlertMm),
      })),
      densities: tank.densityReadings.map((row) => ({
        id: row.id,
        observedDensity: str(row.observedDensity),
        temperatureC: str(row.temperatureC),
        densityAt15C: str(row.densityAt15C),
        invoiceDensity: str(row.invoiceDensity),
        deviation: str(row.deviation),
        withinTolerance: row.withinTolerance,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type DateRange = { from: string; to: string };

export const defaultRange = (): DateRange => {
  const today = businessDateToday();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
};

export type DensityRegisterRow = {
  date: string;
  tank: string;
  product: string;
  observedDensity: string;
  temperatureC: string;
  densityAt15C: string;
  invoiceDensity: string;
  deviation: string;
  withinTolerance: boolean;
};

export async function getDensityRegister(range: DateRange, only?: ReportScope): Promise<{ rows: DensityRegisterRow[]; toleranceKgM3: string; breaches: number }> {
  const scope = await resolveScope(only);
  const settings = scope.outletIds[0] ? await loadSettings(scope.outletIds[0]) : null;
  const rows = await db.densityReading.findMany({
    where: { outletId: { in: scope.outletIds }, businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) } },
    include: { tank: true, product: true },
    orderBy: [{ businessDate: "desc" }, { readingAt: "desc" }],
  });

  const mapped = rows.map((row) => ({
    date: iso(row.businessDate),
    tank: row.tank.code,
    product: row.product.name,
    observedDensity: str(row.observedDensity),
    temperatureC: str(row.temperatureC),
    densityAt15C: str(row.densityAt15C),
    invoiceDensity: str(row.invoiceDensity),
    deviation: str(row.deviation),
    withinTolerance: row.withinTolerance,
  }));

  return {
    rows: mapped,
    toleranceKgM3: (settings?.decimal("quality.densityToleranceKgM3") ?? new Decimal("3.0")).toFixed(1),
    breaches: mapped.filter((row) => !row.withinTolerance).length,
  };
}

export type TankerLossRow = {
  date: string;
  invoiceNo: string;
  vehicleNo: string;
  driverName: string;
  transporterName: string;
  product: string;
  tank: string;
  invoiceQty: string;
  receivedQty: string;
  transitLoss: string;
  lossPct: string;
  allowedLoss: string;
  excessLoss: string;
  lossValue: string;
  densityDeviation: string;
  withinAllowance: boolean;
};

export type TankerLossSummary = {
  key: string;
  trips: number;
  invoiceQty: string;
  transitLoss: string;
  lossPct: string;
  excessTrips: number;
};

/**
 * Receipt loss by tanker, driver and transporter. A pattern here is worth
 * more than any single trip: the same driver losing 40 L every time is not
 * evaporation.
 */
export async function getTankerLossReport(range: DateRange, only?: ReportScope): Promise<{
  rows: TankerLossRow[];
  byVehicle: TankerLossSummary[];
  byTransporter: TankerLossSummary[];
  byDriver: TankerLossSummary[];
  totals: { invoiceQty: string; transitLoss: string; lossPct: string; lossValue: string; excessTrips: number };
}> {
  const scope = await resolveScope(only);
  const rows = await db.decantation.findMany({
    where: { outletId: { in: scope.outletIds }, businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) }, status: { not: "CANCELLED" } },
    include: { product: true, tank: true },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
  });

  const mapped: TankerLossRow[] = rows.map((row) => ({
    date: iso(row.businessDate),
    invoiceNo: row.invoiceNo ?? "",
    vehicleNo: row.vehicleNo ?? "",
    driverName: row.driverName ?? "",
    transporterName: row.transporterName ?? "",
    product: row.product.name,
    tank: row.tank.code,
    invoiceQty: str(row.invoiceQty),
    receivedQty: str(row.receivedQty),
    transitLoss: str(row.transitLoss),
    lossPct: str(row.lossPct),
    allowedLoss: str(row.allowedLoss),
    excessLoss: str(row.excessLoss),
    lossValue: str(row.lossValue),
    densityDeviation: str(row.densityDeviation),
    withinAllowance: row.withinAllowance,
  }));

  const groupBy = (pick: (row: (typeof rows)[number]) => string): TankerLossSummary[] => {
    const buckets = new Map<string, { trips: number; invoiceQty: Decimal; transitLoss: Decimal; excessTrips: number }>();
    for (const row of rows) {
      const key = pick(row) || "—";
      const bucket = buckets.get(key) ?? { trips: 0, invoiceQty: new Decimal(0), transitLoss: new Decimal(0), excessTrips: 0 };
      bucket.trips += 1;
      bucket.invoiceQty = bucket.invoiceQty.plus(new Decimal(row.invoiceQty.toString()));
      bucket.transitLoss = bucket.transitLoss.plus(new Decimal(row.transitLoss.toString()));
      if (!row.withinAllowance) bucket.excessTrips += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.entries()]
      .map(([key, bucket]) => ({
        key,
        trips: bucket.trips,
        invoiceQty: bucket.invoiceQty.toFixed(2),
        transitLoss: bucket.transitLoss.toFixed(2),
        lossPct: bucket.invoiceQty.isZero() ? "0.0000" : bucket.transitLoss.div(bucket.invoiceQty).mul(100).toFixed(4),
        excessTrips: bucket.excessTrips,
      }))
      .sort((left, right) => Number(right.transitLoss) - Number(left.transitLoss));
  };

  const invoiceQty = rows.reduce((sum, row) => sum.plus(new Decimal(row.invoiceQty.toString())), new Decimal(0));
  const transitLoss = rows.reduce((sum, row) => sum.plus(new Decimal(row.transitLoss.toString())), new Decimal(0));
  const lossValue = rows.reduce((sum, row) => sum.plus(new Decimal(row.lossValue.toString())), new Decimal(0));

  return {
    rows: mapped,
    byVehicle: groupBy((row) => row.vehicleNo ?? ""),
    byTransporter: groupBy((row) => row.transporterName ?? ""),
    byDriver: groupBy((row) => row.driverName ?? ""),
    totals: {
      invoiceQty: invoiceQty.toFixed(2),
      transitLoss: transitLoss.toFixed(2),
      lossPct: invoiceQty.isZero() ? "0.0000" : transitLoss.div(invoiceQty).mul(100).toFixed(4),
      lossValue: lossValue.toFixed(2),
      excessTrips: rows.filter((row) => !row.withinAllowance).length,
    },
  };
}

export type VariationRow = {
  id: string;
  date: string;
  tank: string;
  product: string;
  openingStock: string;
  receipts: string;
  sales: string;
  bookStock: string;
  dipStock: string;
  variationLitres: string;
  variationPct: string;
  allowedLitres: string;
  excessLossLitres: string;
  variationValue: string;
  withinAllowance: boolean;
};

export type VariationMonth = { month: string; sales: string; variationLitres: string; variationPct: string; excessLossLitres: string; variationValue: string };

export async function getVariationRegister(range: DateRange, only?: ReportScope): Promise<{
  rows: VariationRow[];
  months: VariationMonth[];
  totals: { sales: string; variationLitres: string; excessLossLitres: string; variationValue: string; breaches: number };
}> {
  const scope = await resolveScope(only);
  const rows = await db.stockVariation.findMany({
    where: { outletId: { in: scope.outletIds }, businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) } },
    include: { tank: true, product: true },
    orderBy: [{ businessDate: "desc" }, { tank: { code: "asc" } }],
  });

  const mapped: VariationRow[] = rows.map((row) => ({
    id: row.id,
    date: iso(row.businessDate),
    tank: row.tank.code,
    product: row.product.name,
    openingStock: str(row.openingStock),
    receipts: str(row.receipts),
    sales: str(row.sales),
    bookStock: str(row.bookStock),
    dipStock: str(row.dipStock),
    variationLitres: str(row.variationLitres),
    variationPct: str(row.variationPct),
    allowedLitres: str(row.allowedLitres),
    excessLossLitres: str(row.excessLossLitres),
    variationValue: str(row.variationValue),
    withinAllowance: row.withinAllowance,
  }));

  const buckets = new Map<string, { sales: Decimal; variation: Decimal; excess: Decimal; value: Decimal }>();
  for (const row of rows) {
    const month = iso(row.businessDate).slice(0, 7);
    const bucket = buckets.get(month) ?? { sales: new Decimal(0), variation: new Decimal(0), excess: new Decimal(0), value: new Decimal(0) };
    bucket.sales = bucket.sales.plus(new Decimal(row.sales.toString()));
    bucket.variation = bucket.variation.plus(new Decimal(row.variationLitres.toString()));
    bucket.excess = bucket.excess.plus(new Decimal(row.excessLossLitres.toString()));
    bucket.value = bucket.value.plus(new Decimal(row.variationValue.toString()));
    buckets.set(month, bucket);
  }

  const months = [...buckets.entries()]
    .map(([month, bucket]) => ({
      month,
      sales: bucket.sales.toFixed(2),
      variationLitres: bucket.variation.toFixed(2),
      variationPct: bucket.sales.isZero() ? "0.0000" : bucket.variation.div(bucket.sales).mul(100).toFixed(4),
      excessLossLitres: bucket.excess.toFixed(2),
      variationValue: bucket.value.toFixed(2),
    }))
    .sort((left, right) => left.month.localeCompare(right.month));

  const sum = (pick: (row: (typeof rows)[number]) => { toString(): string }) =>
    rows.reduce((total, row) => total.plus(new Decimal(pick(row).toString())), new Decimal(0));

  return {
    rows: mapped,
    months,
    totals: {
      sales: sum((row) => row.sales).toFixed(2),
      variationLitres: sum((row) => row.variationLitres).toFixed(2),
      excessLossLitres: sum((row) => row.excessLossLitres).toFixed(2),
      variationValue: sum((row) => row.variationValue).toFixed(2),
      breaches: rows.filter((row) => !row.withinAllowance).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Reminders and samples
// ---------------------------------------------------------------------------

export type ReminderRow = {
  id: string;
  title: string;
  notes: string;
  type: string;
  dueDate: string;
  dueTime: string;
  repeat: string;
  alertBefore: string;
  amount: string;
  referenceNo: string;
  status: string;
  party: string;
  customerId: string;
  supplierId: string;
  employeeId: string;
  assignedToId: string;
  assignedTo: string;
  daysToDue: number;
  overdue: boolean;
  dueSoon: boolean;
};

export async function getReminders(only?: ReportScope): Promise<{ rows: ReminderRow[]; open: number; overdue: number }> {
  const scope = await resolveScope(only);
  const today = businessDateToday();
  const rows = await db.reminder.findMany({
    where: { outletId: { in: scope.outletIds } },
    include: { customer: true, supplier: true, employee: true, assignedTo: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const mapped = rows.map((row) => {
    const effectiveDue = row.snoozedTill && row.snoozedTill > row.dueDate ? row.snoozedTill : row.dueDate;
    const daysToDue = Math.round((effectiveDue.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    const live = row.status === "OPEN" || row.status === "SNOOZED";
    return {
      id: row.id,
      title: row.title,
      notes: row.notes ?? "",
      type: row.type,
      dueDate: iso(row.dueDate),
      dueTime: row.dueTime ?? "",
      repeat: row.repeat,
      alertBefore: String(row.alertBefore),
      amount: str(row.amount),
      referenceNo: row.referenceNo ?? "",
      status: row.status,
      party: row.customer?.name ?? row.supplier?.name ?? row.employee?.name ?? "",
      customerId: row.customerId ?? "",
      supplierId: row.supplierId ?? "",
      employeeId: row.employeeId ?? "",
      assignedToId: row.assignedToId ?? "",
      assignedTo: row.assignedTo?.name ?? "",
      daysToDue,
      overdue: live && daysToDue < 0,
      dueSoon: live && daysToDue >= 0 && daysToDue <= row.alertBefore,
    };
  });

  return { rows: mapped, open: mapped.filter((row) => row.status === "OPEN" || row.status === "SNOOZED").length, overdue: mapped.filter((row) => row.overdue).length };
}

export type SampleRow = {
  id: string;
  date: string;
  product: string;
  productId: string;
  tank: string;
  tankId: string;
  type: string;
  quantity: string;
  tankerNo: string;
  invoiceNo: string;
  observedDensity: string;
  temperatureC: string;
  densityAt15C: string;
  sealNo: string;
  sealedBy: string;
  witnessName: string;
  retainedTill: string;
  storageRef: string;
  result: string;
  isDisposed: boolean;
  expired: boolean;
  daysLeft: number;
};

export async function getSamples(only?: ReportScope): Promise<{ rows: SampleRow[]; expired: number; sheet: { rows: number; columns: number } }> {
  const scope = await resolveScope(only);
  const outletId = scope.outletIds[0];
  const settings = outletId ? await loadSettings(outletId) : null;
  const today = businessDateToday();

  const rows = await db.sample.findMany({
    where: { outletId: { in: scope.outletIds } },
    include: { product: true, tank: true },
    orderBy: [{ businessDate: "desc" }, { createdAt: "desc" }],
  });

  const mapped = rows.map((row) => {
    const daysLeft = row.retainedTill ? Math.round((row.retainedTill.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)) : 999;
    return {
      id: row.id,
      date: iso(row.businessDate),
      product: row.product.name,
      productId: row.productId,
      tank: row.tank?.code ?? "",
      tankId: row.tankId ?? "",
      type: row.type,
      quantity: str(row.quantity),
      tankerNo: row.tankerNo ?? "",
      invoiceNo: row.invoiceNo ?? "",
      observedDensity: str(row.observedDensity),
      temperatureC: str(row.temperatureC),
      densityAt15C: str(row.densityAt15C),
      sealNo: row.sealNo ?? "",
      sealedBy: row.sealedBy ?? "",
      witnessName: row.witnessName ?? "",
      retainedTill: iso(row.retainedTill),
      storageRef: row.storageRef ?? "",
      result: row.result ?? "",
      isDisposed: row.isDisposed,
      expired: !row.isDisposed && daysLeft < 0,
      daysLeft,
    };
  });

  return {
    rows: mapped,
    expired: mapped.filter((row) => row.expired).length,
    sheet: { rows: settings?.number("reminder.stickerSheetRows") ?? 5, columns: settings?.number("reminder.stickerSheetColumns") ?? 2 },
  };
}

export async function getShiftList(range: DateRange, only?: ReportScope) {
  const session = await requirePermission("PUMP_OPERATIONS", "view");
  const scope = await resolveScope(only);
  const employee = session.user.role === "SALESMAN" ? await db.employee.findFirst({ where: { userId: session.user.id, outletId: { in: scope.outletIds } } }) : null;
  const rows = await db.shiftEntry.findMany({
    where: { outletId: { in: scope.outletIds }, businessDate: { gte: businessDateFromInput(range.from), lte: businessDateFromInput(range.to) }, ...(employee ? { OR: [{ nozzleReadings: { some: { salesmanEmployeeId: employee.id } } }, { settlements: { some: { employeeId: employee.id } } }] } : {}) },
    include: { shift: true, nozzleReadings: employee ? { where: { salesmanEmployeeId: employee.id } } : true, settlements: employee ? { where: { employeeId: employee.id } } : true },
    orderBy: [{ businessDate: "desc" }, { shift: { sequence: "asc" } }],
  });
  return rows.map((row) => { const ownSaleLitres = row.nozzleReadings.reduce((sum, reading) => sum.plus(reading.saleLitres.toString()), new Decimal(0)); const ownSaleValue = row.nozzleReadings.reduce((sum, reading) => sum.plus(reading.saleAmount.toString()), new Decimal(0)); const ownCollections = row.settlements.reduce((sum, settlement) => sum.plus(settlement.totalCollections.toString()), new Decimal(0)); const ownShortExcess = row.settlements.reduce((sum, settlement) => sum.plus(settlement.shortExcess.toString()), new Decimal(0)); return ({
    id: row.id,
    date: iso(row.businessDate),
    shiftId: row.shiftId,
    shift: row.shift.name,
    status: row.status,
    saleLitres: employee ? ownSaleLitres.toFixed(2) : str(row.saleLitres),
    totalSaleValue: employee ? ownSaleValue.toFixed(2) : str(row.totalSaleValue),
    totalCollections: employee ? ownCollections.toFixed(2) : str(row.totalCollections),
    shortExcess: employee ? ownShortExcess.toFixed(2) : str(row.shortExcess),
    hasRateSplit: row.hasRateSplit,
    nozzles: row.nozzleReadings.length,
    settlements: row.settlements.length,
  }); });
}
