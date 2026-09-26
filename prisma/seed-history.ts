/**
 * Ninety days of plausible operating history for the MAIN outlet: three shifts
 * a day, nozzle readings chained off each other, weekly tanker receipts, daily
 * dips with realistic drift, and salesman settlements.
 *
 * Two anomalies are planted on purpose so the alerts and the variation report
 * are visibly doing their job rather than showing an empty screen:
 *
 *   1. A cash short of about ₹4,800 on day −17.
 *   2. A tanker on day −24 that delivers ~180 L less than invoiced, well past
 *      the permitted receipt loss, from a transporter that is otherwise clean.
 *
 * Run through `prisma/seed.ts`; this file only exports the history builder.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { computeDecantation, computeNozzleSale, computeSettlement, computeStockVariation, densityAt15C } from "../src/lib/pump";

const d = (value: Decimal.Value) => new Prisma.Decimal(value.toString());
const DAYS = 90;
const SHORT_DAY = 17; // days back — the planted cash short
const BAD_TANKER_DAY = 24; // days back — the planted receipt loss

/// Reorder when a tank falls below this share of capacity.
const REORDER_AT = "0.35";
/// Refill to this share of capacity — never to the brim, there must be ullage.
const FILL_TO = "0.90";
/// One tanker compartment. Deliveries come in whole compartments.
const COMPARTMENT_LITRES = 6000;

/** Deterministic pseudo-random so every seed run produces the same history. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const utcDate = (daysBack: number): Date => {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - daysBack);
  return date;
};

const at = (businessDate: Date, hours: number, minutes = 0): Date => {
  // Local IST clock time converted to UTC: IST is UTC+5:30.
  const stamp = new Date(businessDate);
  stamp.setUTCHours(hours - 5, minutes - 30, 0, 0);
  return stamp;
};

export async function seedHistory(db: PrismaClient, outletId: string): Promise<void> {
  const random = rng(20260920);

  const [shifts, nozzles, tanks, employees, customers, suppliers, paymentModes, expenseHeads] = await Promise.all([
    db.shift.findMany({ where: { outletId }, orderBy: { sequence: "asc" } }),
    db.nozzle.findMany({ where: { outletId }, include: { product: true, tank: true }, orderBy: { code: "asc" } }),
    db.tank.findMany({ where: { outletId }, include: { product: true, calibration: { where: { chartType: "FUEL" }, orderBy: { dipMm: "asc" } } }, orderBy: { code: "asc" } }),
    db.employee.findMany({ where: { outletId }, orderBy: { code: "asc" } }),
    db.customer.findMany({ where: { outletId }, include: { vehicles: true }, orderBy: { code: "asc" }, take: 12 }),
    db.supplier.findMany({ where: { outletId, type: "OMC" }, orderBy: { code: "asc" } }),
    db.paymentMode.findMany({ where: { outletId }, orderBy: { sortOrder: "asc" } }),
    db.expenseHead.findMany({ where: { outletId }, orderBy: { code: "asc" } }),
  ]);

  if (shifts.length === 0 || nozzles.length === 0 || tanks.length === 0 || employees.length === 0) return;
  if (await db.shiftEntry.findFirst({ where: { outletId } })) {
    console.log("History already seeded for this outlet; skipping.");
    return;
  }

  const salesmen = employees.filter((employee) => ["Salesman", "Cashier"].includes(employee.designation ?? "")).slice(0, 3);
  const crew = salesmen.length > 0 ? salesmen : employees.slice(0, 3);
  const cardMode = paymentModes.find((mode) => mode.type === "CARD");
  const upiMode = paymentModes.find((mode) => mode.code === "UPI");
  const creditMode = paymentModes.find((mode) => mode.type === "CREDIT");

  const chartFor = (tank: (typeof tanks)[number]) => tank.calibration.map((row) => ({ dipMm: new Decimal(row.dipMm.toString()), litres: new Decimal(row.litres.toString()) }));

  /** Inverse of the calibration chart: the dip in mm that holds this volume. */
  const litresToDip = (tank: (typeof tanks)[number], litres: Decimal): Decimal => {
    const chart = chartFor(tank);
    for (let index = 1; index < chart.length; index += 1) {
      const lower = chart[index - 1];
      const upper = chart[index];
      if (litres.gte(lower.litres) && litres.lte(upper.litres)) {
        const span = upper.litres.minus(lower.litres);
        if (span.isZero()) return lower.dipMm;
        return lower.dipMm.plus(litres.minus(lower.litres).div(span).mul(upper.dipMm.minus(lower.dipMm))).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
      }
    }
    return chart.at(-1)!.dipMm;
  };

  // Running state the whole simulation carries forward.
  const meter = new Map<string, Decimal>(nozzles.map((nozzle) => [nozzle.id, new Decimal(nozzle.initialReading.toString())]));
  const lastReadingId = new Map<string, string>();
  // Opening stock in the tanks on day one. seed-postings capitalises this
  // against the owner's account, so the stock asset starts from a real figure
  // rather than appearing out of nowhere the first time fuel is sold.
  const stock = new Map<string, Decimal>(tanks.map((tank) => [tank.id, new Decimal(tank.capacity.toString()).mul("0.55").toDecimalPlaces(2)]));
  const invoiceDensity = new Map<string, Decimal>(tanks.map((tank) => [tank.id, new Decimal(tank.product.productType === "FUEL_MS" ? "735.0" : "830.0")]));

  let creditSlipSeq = 0;
  let purchaseSeq = 0;

  console.log(`Seeding ${DAYS} days of history…`);

  for (let daysBack = DAYS; daysBack >= 1; daysBack -= 1) {
    const businessDate = utcDate(daysBack);
    const weekday = businessDate.getUTCDay();
    // Weekends and the first of the month run heavier.
    const demand = 0.82 + (weekday === 0 || weekday === 6 ? 0.26 : 0) + random() * 0.3;

    // ---- Tanker receipt: ordered when a tank runs low ---------------------
    // A real outlet reorders against cover, not against the calendar. Tanks
    // that are still comfortable are skipped, so stock stays between the
    // reorder level and capacity all 90 days.
    const needsRefill = tanks.filter((tank) => tank.product.isFuel && stock.get(tank.id)!.lt(new Decimal(tank.capacity.toString()).mul(REORDER_AT)));
    if (needsRefill.length > 0 || daysBack === BAD_TANKER_DAY) {
      const badTanker = daysBack === BAD_TANKER_DAY;
      const supplier = suppliers[0];
      if (supplier) {
        purchaseSeq += 1;
        const fuelTanks = needsRefill.length > 0 ? needsRefill : tanks.filter((tank) => tank.product.isFuel).slice(0, 1);
        const invoiceNo = `IOC/${String(businessDate.getUTCFullYear()).slice(2)}/${String(purchaseSeq).padStart(5, "0")}`;
        const vehicleNo = badTanker ? "TN 23 BZ 9041" : ["TN 09 AK 4412", "TN 11 CD 7788", "TN 23 BZ 9041"][purchaseSeq % 3];
        const transporter = badTanker ? "Velan Carriers" : ["Sree Logistics", "Annai Roadways", "Velan Carriers"][purchaseSeq % 3];
        const driver = badTanker ? "S. Manikandan" : ["R. Velu", "K. Arumugam", "S. Manikandan"][purchaseSeq % 3];

        const purchase = await db.purchase.create({
          data: {
            outletId,
            supplierId: supplier.id,
            seriesCode: "PURCHASE",
            seriesNumber: purchaseSeq,
            docNumber: `PUR/${String(purchaseSeq).padStart(5, "0")}`,
            businessDate,
            invoiceNo,
            invoiceDate: businessDate,
            vehicleNo,
            driverName: driver,
            transporterName: transporter,
            status: "POSTED",
          },
        });

        let subTotal = new Decimal(0);
        for (const [index, tank] of fuelTanks.entries()) {
          const isMs = tank.product.productType === "FUEL_MS";
          const rate = new Decimal(isMs ? "100.1500" : "91.8000");
          const before = stock.get(tank.id)!;

          // Fill to FILL_TO of capacity, rounded down to whole compartments,
          // and never more than the tank can physically hold.
          const capacity = new Decimal(tank.capacity.toString());
          const headroom = capacity.mul(FILL_TO).minus(before);
          const loads = headroom.div(COMPARTMENT_LITRES).floor();
          const invoiceQty = Decimal.max(loads, 1).mul(COMPARTMENT_LITRES);
          if (before.plus(invoiceQty).gt(capacity)) continue;

          // Normal trips lose 5–40 L; the planted tanker loses ~180 L.
          const loss = badTanker && index === 0 ? new Decimal(178).plus(Math.round(random() * 8)) : new Decimal(5 + Math.round(random() * 35));
          const received = invoiceQty.minus(loss);
          const after = before.plus(received);

          const dipBefore = litresToDip(tank, before);
          const dipAfter = litresToDip(tank, after);
          const observedTemp = new Decimal((29 + random() * 6).toFixed(1));
          const invDensity = invoiceDensity.get(tank.id)!;
          // The bad tanker is also off-spec on density — the two signals agree.
          const receiptObserved = badTanker && index === 0 ? invDensity.minus(7.4) : invDensity.plus(new Decimal((random() * 2.4 - 1.2).toFixed(1)));

          const result = computeDecantation({ invoiceQty, dipBeforeLitres: before, dipAfterLitres: after, allowancePct: "0.20", costPerLitre: rate });
          const receipt15 = densityAt15C(receiptObserved, observedTemp);

          await db.purchaseLine.create({
            data: {
              purchaseId: purchase.id,
              productId: tank.productId,
              tankId: tank.id,
              compartmentNo: String(index + 1),
              quantity: d(invoiceQty),
              rate: d(rate),
              invoiceDensity: d(invDensity),
              temperatureC: d(observedTemp),
              taxableValue: d(invoiceQty.mul(rate).toDecimalPlaces(2)),
              amount: d(invoiceQty.mul(rate).toDecimalPlaces(2)),
              lineNo: index + 1,
            },
          });

          const decantation = await db.decantation.create({
            data: {
              outletId,
              tankId: tank.id,
              productId: tank.productId,
              purchaseId: purchase.id,
              supplierId: supplier.id,
              businessDate,
              timeIn: at(businessDate, 10, 15),
              timeOut: at(businessDate, 11, 40),
              invoiceNo,
              invoiceDate: businessDate,
              depot: "Korukkupet Terminal",
              vehicleNo,
              driverName: driver,
              transporterName: transporter,
              compartmentNo: String(index + 1),
              sealNoTop: `T${String(purchaseSeq * 10 + index).padStart(5, "0")}`,
              sealNoBottom: `B${String(purchaseSeq * 10 + index).padStart(5, "0")}`,
              sealNoIntact: !(badTanker && index === 0),
              invoiceQty: d(invoiceQty),
              invoiceDensity: d(invDensity),
              invoiceTemperatureC: d(observedTemp),
              dipBeforeMm: d(dipBefore),
              dipAfterMm: d(dipAfter),
              stockBefore: d(before),
              stockAfter: d(after),
              receivedQty: d(result.decantedQty),
              observedDensity: d(receiptObserved),
              temperatureC: d(observedTemp),
              densityAt15C: d(receipt15),
              densityDeviation: d(receipt15.minus(densityAt15C(invDensity, observedTemp))),
              transitLoss: d(result.transitLoss),
              lossPct: d(result.lossPct),
              allowedLoss: d(result.allowedLoss),
              excessLoss: d(result.excessLoss),
              lossValue: d(result.lossValue),
              withinAllowance: result.withinAllowance,
              status: "COMPLETED",
              remarks: badTanker && index === 0 ? "Bottom seal found loose on arrival" : null,
            },
          });

          await db.stockMovement.create({
            data: {
              outletId,
              productId: tank.productId,
              businessDate,
              type: "PURCHASE_RECEIPT",
              quantity: d(result.decantedQty),
              rate: d(rate),
              value: d(result.decantedQty.mul(rate).toDecimalPlaces(2)),
              toTankId: tank.id,
              sourceType: "purchases",
              sourceId: purchase.id,
              remarks: `${vehicleNo} · ${invoiceNo}`,
            },
          });

          // A retained sample is drawn from every decantation.
          await db.sample.create({
            data: {
              outletId,
              tankId: tank.id,
              productId: tank.productId,
              decantationId: decantation.id,
              businessDate,
              type: "RETAINED_DECANTATION",
              quantity: d(1),
              observedDensity: d(receiptObserved),
              temperatureC: d(observedTemp),
              densityAt15C: d(receipt15),
              sealNo: `S${String(purchaseSeq * 10 + index).padStart(5, "0")}`,
              tankerNo: vehicleNo,
              invoiceNo,
              sealedBy: employees[0]?.name,
              retainedTill: new Date(businessDate.getTime() + 30 * 86400000),
              storageRef: `Rack ${1 + (purchaseSeq % 4)}`,
            },
          });

          stock.set(tank.id, after);
          invoiceDensity.set(tank.id, invDensity);
          subTotal = subTotal.plus(invoiceQty.mul(rate));
        }

        const tcs = subTotal.mul("0.001").toDecimalPlaces(2);
        await db.purchase.update({
          where: { id: purchase.id },
          data: { subTotal: d(subTotal.toDecimalPlaces(2)), tcsAmount: d(tcs), totalAmount: d(subTotal.plus(tcs).toDecimalPlaces(2)) },
        });
      }
    }

    // ---- Opening dip per tank --------------------------------------------
    for (const tank of tanks) {
      if (!tank.product.isFuel || tank.calibration.length === 0) continue;
      const litres = stock.get(tank.id)!;
      await db.dipReading.create({
        data: {
          outletId,
          tankId: tank.id,
          businessDate,
          readingType: "OPENING",
          readingAt: at(businessDate, 6),
          fuelDipMm: d(litresToDip(tank, litres)),
          waterDipMm: d(2 + Math.round(random() * 3)),
          fuelLitres: d(litres),
          waterLitres: d(0),
          netLitres: d(litres),
          temperatureC: d((30 + random() * 4).toFixed(1)),
        },
      });
    }

    const soldByTank = new Map<string, Decimal>(tanks.map((tank) => [tank.id, new Decimal(0)]));

    // ---- Three shifts ------------------------------------------------------
    for (const [shiftIndex, shift] of shifts.entries()) {
      const entry = await db.shiftEntry.create({
        data: {
          outletId,
          shiftId: shift.id,
          businessDate,
          openedAt: at(businessDate, Number(shift.startTime.slice(0, 2))),
          closedAt: at(businessDate, Number(shift.endTime.slice(0, 2))),
          cashierEmployeeId: crew[shiftIndex % crew.length]?.id,
          openingFloat: d(2000),
          status: "APPROVED",
        },
      });

      let shiftSale = new Decimal(0);
      let shiftLitres = new Decimal(0);
      const saleByCrew = new Map<string, { amount: Decimal; litres: Decimal }>();

      for (const nozzle of nozzles) {
        if (!nozzle.product.isFuel) continue;
        const price = await db.priceHistory.findFirst({
          where: { productId: nozzle.productId, isActive: true, effectiveFrom: { lte: entry.openedAt! } },
          orderBy: { effectiveFrom: "desc" },
        });
        if (!price) continue;

        const base = nozzle.product.productType === "FUEL_MS" ? 260 : 340;
        // Night shift is quiet; morning and evening carry the volume.
        const shiftFactor = shiftIndex === 2 ? 0.42 : shiftIndex === 0 ? 1.0 : 1.12;
        const litres = new Decimal((base * demand * shiftFactor * (0.85 + random() * 0.3)).toFixed(2));
        const testing = shiftIndex === 0 ? new Decimal(5) : new Decimal(0);

        const opening = meter.get(nozzle.id)!;
        const closing = opening.plus(litres).plus(testing);
        const sale = computeNozzleSale({
          openingReading: opening,
          closingReading: closing,
          testingLitres: testing,
          rate: new Decimal(price.rate.toString()),
          meterDigits: nozzle.meterDigits,
        });

        const salesman = crew[(shiftIndex + nozzles.indexOf(nozzle)) % crew.length];
        const reading = await db.nozzleReading.create({
          data: {
            outletId,
            shiftEntryId: entry.id,
            nozzleId: nozzle.id,
            productId: nozzle.productId,
            businessDate,
            rateSegment: 1,
            segmentFrom: entry.openedAt,
            segmentTo: entry.closedAt,
            openingReading: d(opening),
            closingReading: d(closing),
            testingLitres: d(testing),
            saleLitres: d(sale.saleLitres),
            rate: d(price.rate.toString()),
            saleAmount: d(sale.saleAmount),
            salesmanEmployeeId: salesman?.id,
            prevReadingId: lastReadingId.get(nozzle.id) ?? null,
          },
        });

        meter.set(nozzle.id, closing);
        lastReadingId.set(nozzle.id, reading.id);
        shiftSale = shiftSale.plus(sale.saleAmount);
        shiftLitres = shiftLitres.plus(sale.saleLitres);
        soldByTank.set(nozzle.tankId, (soldByTank.get(nozzle.tankId) ?? new Decimal(0)).plus(sale.saleLitres));

        if (salesman) {
          const bucket = saleByCrew.get(salesman.id) ?? { amount: new Decimal(0), litres: new Decimal(0) };
          saleByCrew.set(salesman.id, { amount: bucket.amount.plus(sale.saleAmount), litres: bucket.litres.plus(sale.saleLitres) });
        }
      }

      // ---- Settlement per salesman ----------------------------------------
      let collectionsTotal = new Decimal(0);
      let shortExcessTotal = new Decimal(0);

      for (const [employeeId, bucket] of saleByCrew) {
        const card = bucket.amount.mul(0.18 + random() * 0.07).toDecimalPlaces(2);
        const upi = bucket.amount.mul(0.2 + random() * 0.08).toDecimalPlaces(2);
        const credit = bucket.amount.mul(0.1 + random() * 0.06).toDecimalPlaces(2);
        const expenses = shiftIndex === 0 && random() > 0.7 ? new Decimal(Math.round(200 + random() * 900)) : new Decimal(0);

        // The planted short lands on the morning shift of one day only.
        const plantedShort = daysBack === SHORT_DAY && shiftIndex === 0 ? new Decimal(1600) : new Decimal(0);
        const drift = new Decimal((random() * 30 - 15).toFixed(2));
        const cash = bucket.amount.minus(card).minus(upi).minus(credit).minus(expenses).minus(plantedShort).plus(drift).toDecimalPlaces(2);

        const settlement = computeSettlement({
          nozzleSaleAmount: bucket.amount,
          cash,
          card,
          upi,
          credit,
          expenses,
          toleranceAmount: "20",
        });

        // Denominations are counted to exactly the cash declared.
        const denominations: Record<string, number> = {};
        let remaining = cash.toDecimalPlaces(0, Decimal.ROUND_DOWN);
        for (const face of [500, 200, 100, 50, 20, 10]) {
          const count = remaining.div(face).floor().toNumber();
          if (count > 0) {
            denominations[String(face)] = count;
            remaining = remaining.minus(new Decimal(face).mul(count));
          }
        }
        const coins = cash.minus(cash.toDecimalPlaces(0, Decimal.ROUND_DOWN)).plus(remaining).toDecimalPlaces(2);

        const record = await db.shiftSettlement.create({
          data: {
            outletId,
            shiftEntryId: entry.id,
            employeeId,
            businessDate,
            nozzleSaleAmount: d(bucket.amount.toDecimalPlaces(2)),
            nozzleSaleLitres: d(bucket.litres.toDecimalPlaces(2)),
            totalSaleValue: d(settlement.totalSaleValue),
            declaredCash: d(cash),
            denominationCount: denominations as Prisma.InputJsonValue,
            coinsAmount: d(coins),
            denominationTotal: d(cash),
            denominationDifference: d(0),
            cardTotal: d(card),
            upiTotal: d(upi),
            creditTotal: d(credit),
            expenseTotal: d(expenses),
            totalCollections: d(settlement.totalCollections),
            shortExcess: d(settlement.shortExcess),
            withinTolerance: settlement.withinTolerance,
            status: "APPROVED",
            remarks: plantedShort.gt(0) ? "Salesman could not account for the difference" : null,
          },
        });

        const lines: Prisma.ShiftCollectionCreateManyInput[] = [];
        if (cardMode) lines.push({ outletId, settlementId: record.id, kind: "CARD", paymentModeId: cardMode.id, amount: d(card), machineOrWallet: "HDFC POS 1", referenceNo: `B${String(daysBack).padStart(3, "0")}${shiftIndex}` });
        if (upiMode) lines.push({ outletId, settlementId: record.id, kind: "UPI", paymentModeId: upiMode.id, amount: d(upi), machineOrWallet: "UPI QR", referenceNo: `U${String(daysBack).padStart(3, "0")}${shiftIndex}` });
        if (creditMode && credit.gt(0)) {
          const customer = customers[(daysBack + shiftIndex) % customers.length];
          creditSlipSeq += 1;
          lines.push({
            outletId,
            settlementId: record.id,
            kind: "CREDIT",
            paymentModeId: creditMode.id,
            amount: d(credit),
            customerId: customer?.id,
            vehicleId: customer?.vehicles[0]?.id,
            slipNo: `CS${String(creditSlipSeq).padStart(5, "0")}`,
          });
          if (customer) {
            await db.creditSlip.create({
              data: {
                outletId,
                customerId: customer.id,
                vehicleId: customer.vehicles[0]?.id,
                shiftEntryId: entry.id,
                productId: nozzles[0].productId,
                businessDate,
                quantity: d(credit.div(100).toDecimalPlaces(2)),
                rate: d(100),
                amount: d(credit),
                slipNo: `CS${String(creditSlipSeq).padStart(5, "0")}`,
                issuedByEmployeeId: employeeId,
                seriesCode: "CREDIT_SLIP",
                seriesNumber: creditSlipSeq,
                docNumber: `CS/${String(creditSlipSeq).padStart(5, "0")}`,
              },
            });
          }
        }
        if (expenses.gt(0) && expenseHeads[0]) {
          lines.push({ outletId, settlementId: record.id, kind: "EXPENSE", amount: d(expenses), expenseHeadId: expenseHeads[0].id, narration: "Paid from shift cash" });
        }
        if (lines.length > 0) await db.shiftCollection.createMany({ data: lines });

        collectionsTotal = collectionsTotal.plus(settlement.totalCollections);
        shortExcessTotal = shortExcessTotal.plus(settlement.shortExcess);
      }

      await db.shiftEntry.update({
        where: { id: entry.id },
        data: {
          saleAmount: d(shiftSale.toDecimalPlaces(2)),
          saleLitres: d(shiftLitres.toDecimalPlaces(2)),
          totalSaleValue: d(shiftSale.toDecimalPlaces(2)),
          totalCollections: d(collectionsTotal.toDecimalPlaces(2)),
          shortExcess: d(shortExcessTotal.toDecimalPlaces(2)),
          expectedCash: d(shiftSale.minus(collectionsTotal).abs().toDecimalPlaces(2)),
        },
      });
    }

    // ---- Closing dip, stock movement and the day's variation ---------------
    for (const tank of tanks) {
      if (!tank.product.isFuel || tank.calibration.length === 0) continue;
      const sold = soldByTank.get(tank.id) ?? new Decimal(0);
      if (sold.isZero()) continue;

      const opening = stock.get(tank.id)!;
      const rate = new Decimal(tank.product.productType === "FUEL_MS" ? "100.1500" : "91.8000");

      await db.stockMovement.create({
        data: {
          outletId,
          productId: tank.productId,
          businessDate,
          type: "SALE",
          quantity: d(sold.negated()),
          rate: d(rate),
          value: d(sold.mul(rate).negated().toDecimalPlaces(2)),
          fromTankId: tank.id,
          sourceType: "shift_entries",
        },
      });

      // Physical stock drifts a little below book — normal evaporation and
      // metering tolerance, well inside the permitted allowance.
      const bookClosing = opening.minus(sold);
      const drift = sold.mul(new Decimal((0.0006 + random() * 0.0022).toFixed(6))).toDecimalPlaces(2);
      const physical = bookClosing.minus(drift);

      const fuelDip = litresToDip(tank, physical);
      const waterMm = new Decimal(2 + Math.round(random() * 4));
      await db.dipReading.create({
        data: {
          outletId,
          tankId: tank.id,
          businessDate,
          readingType: "CLOSING",
          readingAt: at(businessDate, 22),
          fuelDipMm: d(fuelDip),
          waterDipMm: d(waterMm),
          fuelLitres: d(physical),
          waterLitres: d(0),
          netLitres: d(physical),
          temperatureC: d((29 + random() * 5).toFixed(1)),
        },
      });

      const allowancePct = tank.product.productType === "FUEL_MS" ? "0.75" : "0.50";
      const result = computeStockVariation({
        openingStock: opening,
        purchases: 0,
        sales: sold,
        physicalStock: physical,
        allowancePct,
        costPerLitre: rate,
      });

      await db.stockVariation.create({
        data: {
          outletId,
          tankId: tank.id,
          productId: tank.productId,
          businessDate,
          openingStock: d(opening),
          receipts: d(0),
          sales: d(sold.toDecimalPlaces(2)),
          bookStock: d(result.bookStock),
          dipStock: d(result.physicalStock),
          variationLitres: d(result.variationLitres),
          variationPct: d(result.variationPct),
          allowancePct: d(allowancePct),
          allowedLitres: d(result.permissibleLitres),
          excessLossLitres: d(result.excessLossLitres),
          excessLossValue: d(result.excessLossValue),
          withinAllowance: result.withinAllowance,
          costPerLitre: d(rate),
          variationValue: d(result.variationValue),
          status: result.withinAllowance ? "APPROVED" : "PENDING",
        },
      });

      // Density is checked a couple of times a week.
      if (daysBack % 3 === 0) {
        const observedTemp = new Decimal((30 + random() * 4).toFixed(1));
        const invDensity = invoiceDensity.get(tank.id)!;
        const observed = invDensity.plus(new Decimal((random() * 2.2 - 1.1).toFixed(1)));
        const corrected = densityAt15C(observed, observedTemp);
        const deviation = corrected.minus(densityAt15C(invDensity, observedTemp));
        await db.densityReading.create({
          data: {
            outletId,
            tankId: tank.id,
            productId: tank.productId,
            businessDate,
            readingAt: at(businessDate, 7),
            observedDensity: d(observed),
            temperatureC: d(observedTemp),
            densityAt15C: d(corrected),
            invoiceDensity: d(invDensity),
            deviation: d(deviation),
            withinTolerance: deviation.abs().lte(3),
          },
        });
      }

      stock.set(tank.id, physical);
    }
  }

  // ---- A few live reminders so the screen is not empty --------------------
  const today = utcDate(0);
  const addDays = (days: number) => new Date(today.getTime() + days * 86400000);
  await db.reminder.createMany({
    data: [
      { outletId, title: "Explosives licence renewal", type: "LICENCE_RENEWAL", dueDate: addDays(24), alertBefore: 45, repeat: "YEARLY", isRecurring: true, referenceNo: "PESO/TN/4412" },
      { outletId, title: "DU stamping — Legal Metrology", type: "CALIBRATION_DUE", dueDate: addDays(-6), alertBefore: 30, repeat: "YEARLY", isRecurring: true, notes: "All three dispensing units" },
      { outletId, title: "Fire insurance renewal", type: "INSURANCE_RENEWAL", dueDate: addDays(51), alertBefore: 30, repeat: "YEARLY", isRecurring: true, amount: d(46500) },
      { outletId, title: "GSTR-3B filing", type: "STATUTORY_FILING", dueDate: addDays(9), alertBefore: 7, repeat: "MONTHLY", isRecurring: true },
      { outletId, title: "Tank calibration due", type: "CALIBRATION_DUE", dueDate: addDays(-2), alertBefore: 60, notes: "T3 and T4 five-year recalibration" },
    ],
  });

  const anomalyDate = utcDate(SHORT_DAY).toISOString().slice(0, 10);
  const tankerDate = utcDate(BAD_TANKER_DAY).toISOString().slice(0, 10);
  console.log(`History seeded. Planted anomalies: cash short on ${anomalyDate} (morning shift), excess tanker receipt loss on ${tankerDate} (TN 23 BZ 9041 / Velan Carriers).`);
}
