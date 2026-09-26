import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { INSPECTION_CHECKLIST } from "../src/lib/inspection";
import { postVoucher } from "../src/server/accounts/posting";

const d = (value: string) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

export async function seedPhase6(
  db: PrismaClient,
  outletId: string,
  ownerId: string,
) {
  const [products, employees, stock, capital] = await Promise.all([
    db.product.findMany({ where: { outletId, isFuel: false } }),
    db.employee.findMany({ where: { outletId }, orderBy: { code: "asc" } }),
    db.account.findFirstOrThrow({
      where: { outletId, systemKey: "STOCK_IN_TRADE" },
    }),
    db.account.findFirstOrThrow({ where: { outletId, systemKey: "CAPITAL" } }),
  ]);
  const openingDate = day("2026-06-01");
  for (const [index, product] of products.entries()) {
    const batchNo = `B26-${product.code}-01`;
    const rate =
      product.code === "LUBE-5W30"
        ? "525.0000"
        : product.code === "2T"
          ? "132.0000"
          : product.code === "ADBLUE"
            ? "49.5000"
            : product.code === "COOLANT"
              ? "218.0000"
              : "120.0000";
    const batch = await db.inventoryBatch.upsert({
      where: {
        outletId_productId_batchNo: {
          outletId,
          productId: product.id,
          batchNo,
        },
      },
      create: {
        outletId,
        productId: product.id,
        batchNo,
        mrp: d(
          product.code === "MERCH"
            ? "199"
            : product.code === "LUBE-5W30"
              ? "720"
              : "310",
        ),
        purchaseRate: d(rate),
        manufacturedOn: day("2026-05-01"),
        expiryDate:
          product.code === "MERCH"
            ? null
            : day(`2027-${String(3 + index).padStart(2, "0")}-01`),
        barcode: `890100000${String(index).padStart(3, "0")}`,
        createdById: ownerId,
      },
      update: { purchaseRate: d(rate), isActive: true },
    });
    const sourceId = `phase6:${batch.id}`;
    if (
      !(await db.stockMovement.findFirst({
        where: { outletId, sourceType: "phase6_seed", sourceId },
      }))
    ) {
      const quantity = d(product.type === "PIECE" ? "80" : "120");
      const value = quantity.mul(rate).toDecimalPlaces(2);
      await db.stockMovement.create({
        data: {
          outletId,
          productId: product.id,
          batchId: batch.id,
          businessDate: openingDate,
          type: "OPENING",
          quantity,
          rate: d(rate),
          value,
          sourceType: "phase6_seed",
          sourceId,
          remarks: "Opening batch stock",
          createdById: ownerId,
        },
      });
      await db.$transaction(async (tx) => {
        if (
          !(await tx.voucher.findUnique({
            where: { outletId_sourceKey: { outletId, sourceKey: sourceId } },
          }))
        )
          await postVoucher(tx, {
            outletId,
            type: "OPENING_BALANCE",
            businessDate: openingDate,
            narration: `Opening batch stock · ${product.name}`,
            sourceKey: sourceId,
            createdById: ownerId,
            lines: [
              {
                accountId: stock.id,
                debit: value,
                productId: product.id,
                quantity,
              },
              { accountId: capital.id, credit: value },
            ],
          });
      });
    }
  }

  const fuelTanks = await db.tank.findMany({
    where: { outletId, status: "ACTIVE" },
    include: {
      product: {
        include: {
          priceHistory: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        },
      },
    },
  });
  for (const tank of fuelTanks) {
    const sourceId = `phase6-fuel-opening:${tank.id}`;
    if (
      await db.stockMovement.findFirst({
        where: { outletId, sourceType: "phase6_seed", sourceId },
      })
    )
      continue;
    const quantity = d("15000.00");
    const rate = tank.product.priceHistory[0]?.purchaseRate ?? d("0");
    const value = quantity.mul(rate).toDecimalPlaces(2);
    await db.stockMovement.create({
      data: {
        outletId,
        productId: tank.productId,
        toTankId: tank.id,
        businessDate: openingDate,
        type: "OPENING",
        quantity,
        rate,
        value,
        sourceType: "phase6_seed",
        sourceId,
        remarks: `Opening stock · ${tank.code}`,
        createdById: ownerId,
      },
    });
    await db.$transaction(async (tx) => {
      if (
        !(await tx.voucher.findUnique({
          where: { outletId_sourceKey: { outletId, sourceKey: sourceId } },
        }))
      )
        await postVoucher(tx, {
          outletId,
          type: "OPENING_BALANCE",
          businessDate: openingDate,
          narration: `Opening fuel stock · ${tank.code}`,
          sourceKey: sourceId,
          createdById: ownerId,
          lines: [
            {
              accountId: stock.id,
              debit: value,
              productId: tank.productId,
              quantity,
            },
            { accountId: capital.id, credit: value },
          ],
        });
    });
  }

  const componentDefs = [
    ["BASIC", "Basic salary", "EARNING", "18000", null, null, null],
    ["HRA", "House rent allowance", "EARNING", "6000", null, null, null],
    ["SHIFT_INC", "Shift incentive", "EARNING", null, null, "75", null],
    [
      "LITRE_INC",
      "Sales litre incentive",
      "EARNING",
      null,
      null,
      null,
      "0.0150",
    ],
    ["OT", "Overtime", "EARNING", null, "120", null, null],
    ["PF", "Provident fund", "DEDUCTION", "2160", null, null, null],
    ["ESI", "ESI contribution", "DEDUCTION", "150", null, null, null],
    ["PT", "Professional tax", "DEDUCTION", "200", null, null, null],
    ["ADVANCE", "Advance recovery", "DEDUCTION", "500", null, null, null],
  ] as const;
  for (const employee of employees)
    for (const [
      componentCode,
      componentName,
      type,
      amount,
      perHourRate,
      perShiftRate,
      perLitreRate,
    ] of componentDefs)
      await db.salaryStructure.upsert({
        where: {
          employeeId_componentCode_effectiveFrom: {
            employeeId: employee.id,
            componentCode,
            effectiveFrom: day("2026-04-01"),
          },
        },
        create: {
          outletId,
          employeeId: employee.id,
          componentCode,
          componentName,
          type,
          amount: amount ? d(amount) : null,
          perHourRate: perHourRate ? d(perHourRate) : null,
          perShiftRate: perShiftRate ? d(perShiftRate) : null,
          perLitreRate: perLitreRate ? d(perLitreRate) : null,
          effectiveFrom: day("2026-04-01"),
          isStatutory: ["PF", "ESI", "PT"].includes(componentCode),
          createdById: ownerId,
        },
        update: {
          amount: amount ? d(amount) : null,
          perHourRate: perHourRate ? d(perHourRate) : null,
          perShiftRate: perShiftRate ? d(perShiftRate) : null,
          perLitreRate: perLitreRate ? d(perLitreRate) : null,
        },
      });
  for (let offset = 0; offset < 45; offset += 1) {
    const date = new Date(Date.UTC(2026, 7, 1 + offset));
    if (date.getUTCDay() === 0) continue;
    for (const [index, employee] of employees.entries()) {
      const status =
        date.getUTCDay() === 6
          ? "WEEKLY_OFF"
          : (offset + index) % 17 === 0
            ? "ABSENT"
            : (offset + index) % 13 === 0
              ? "HALF_DAY"
              : (offset + index) % 11 === 0
                ? "CASUAL_LEAVE"
                : (offset + index) % 7 === 0
                  ? "OVERTIME"
                  : "PRESENT";
      const overtimeHours = status === "OVERTIME" ? d("2") : d("0");
      const existing = await db.attendance.findFirst({
        where: { employeeId: employee.id, businessDate: date, shiftId: null },
      });
      if (existing)
        await db.attendance.update({
          where: { id: existing.id },
          data: { status, overtimeHours, markedById: ownerId },
        });
      else
        await db.attendance.create({
          data: {
            outletId,
            employeeId: employee.id,
            businessDate: date,
            status,
            overtimeHours,
            markedById: ownerId,
          },
        });
    }
  }

  const inspectionDefs = [
    [
      "INS-2026-001",
      "2026-07-10",
      "OMC",
      "V. Srinivasan",
      "Territory Manager",
      "IOCL",
      "PASS_WITH_OBSERVATIONS",
    ],
    [
      "INS-2026-002",
      "2026-08-05",
      "LEGAL_METROLOGY",
      "J. Meenakshi",
      "Inspector",
      "Legal Metrology Department",
      "PASS",
    ],
    [
      "INS-2026-003",
      "2026-09-12",
      "INTERNAL_AUDIT",
      "S. Narayanan",
      "Safety Officer",
      "GT Fuel Retailers",
      "FAIL",
    ],
  ] as const;
  for (const [
    referenceNo,
    date,
    type,
    inspectorName,
    inspectorDesignation,
    organisation,
    result,
  ] of inspectionDefs) {
    let report = await db.inspection.findFirst({
      where: { outletId, referenceNo },
    });
    const data = {
      type,
      businessDate: day(date),
      inspectorName,
      inspectorDesignation,
      organisation,
      authority: organisation,
      result,
      observations:
        result === "FAIL"
          ? "Fire extinguisher near DU-3 expires within 15 days."
          : result === "PASS_WITH_OBSERVATIONS"
            ? "Forecourt display board requires repainting."
            : "All items satisfactory.",
      correctiveAction:
        result === "FAIL"
          ? "Replace extinguisher and record service certificate."
          : result === "PASS_WITH_OBSERVATIONS"
            ? "Repaint display board."
            : null,
      correctiveActionDueDate: result === "PASS" ? null : day("2026-09-30"),
      completedAt: day(date),
      createdById: ownerId,
    };
    report = report
      ? await db.inspection.update({ where: { id: report.id }, data })
      : await db.inspection.create({
          data: { outletId, referenceNo, ...data },
        });
    for (const item of INSPECTION_CHECKLIST)
      await db.inspectionItem.upsert({
        where: {
          inspectionId_code: { inspectionId: report.id, code: item.code },
        },
        create: {
          outletId,
          inspectionId: report.id,
          code: item.code,
          category: item.category,
          label: item.label,
          unit: "unit" in item ? item.unit : null,
          expectedValue: "expectedValue" in item ? d(item.expectedValue) : null,
          measuredValue:
            item.code === "NOZZLE_ACCURACY"
              ? d(result === "FAIL" ? "35" : "10")
              : null,
          result:
            result === "FAIL" && item.code === "FIRE_EXPIRY" ? "FAIL" : "PASS",
          observation:
            result === "FAIL" && item.code === "FIRE_EXPIRY"
              ? "Expiry due"
              : null,
          sortOrder: item.sortOrder,
        },
        update: {
          result:
            result === "FAIL" && item.code === "FIRE_EXPIRY" ? "FAIL" : "PASS",
        },
      });
  }

  const alertTank = await db.tank.findFirst({
    where: { outletId, code: "T4" },
  });
  if (alertTank) {
    const movement = await db.stockMovement.aggregate({
      where: {
        outletId,
        isCancelled: false,
        OR: [{ fromTankId: alertTank.id }, { toTankId: alertTank.id }],
      },
      _sum: { quantity: true },
    });
    const current = movement._sum.quantity ?? d("0");
    const threshold = current.plus("1000").toDecimalPlaces(2);
    await db.tank.update({
      where: { id: alertTank.id },
      data: { lowLevelAlert: threshold },
    });
    const referenceNo = `LOWSTOCK:${alertTank.id}`;
    const existing = await db.reminder.findFirst({
      where: { outletId, referenceNo },
    });
    const data = {
      type: "OTHER" as const,
      title: `Low stock · ${alertTank.code}`,
      description: `Tank stock is at or below the configured ${threshold.toFixed(2)} L reorder level.`,
      dueDate: day("2026-09-20"),
      alertBefore: 1,
      referenceNo,
      status: "OPEN" as const,
      createdById: ownerId,
    };
    if (existing)
      await db.reminder.update({ where: { id: existing.id }, data });
    else await db.reminder.create({ data: { outletId, ...data } });
  }
}
