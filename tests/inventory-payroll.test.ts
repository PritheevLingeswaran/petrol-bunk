import { describe, expect, it } from "vitest";
import {
  fifoCost,
  productMargin,
  stockCover,
  stockLedgerBalances,
} from "../src/lib/inventory";
import { attendanceSummary, calculateSalary } from "../src/lib/payroll";

describe("inventory arithmetic", () => {
  it("keeps quantity and value running balances without floating point", () => {
    const rows = stockLedgerBalances([
      { quantity: "100.00", rate: "91.1234", value: "9112.34" },
      { quantity: "-35.50", rate: "91.1234", value: "-3234.88" },
    ]);
    expect(rows[1].quantity.toString()).toBe("64.5");
    expect(rows[1].value.toString()).toBe("5877.46");
  });

  it("computes ullage and 30-day cover", () => {
    const result = stockCover({
      stock: "7500",
      capacity: "30000",
      averageDailySale: "2500",
    });
    expect(result.daysCover?.toString()).toBe("3");
    expect(result.ullage?.toString()).toBe("22500");
    expect(result.fillPct?.toString()).toBe("25");
  });

  it("uses actual FIFO layers instead of the latest rate", () => {
    const cost = fifoCost([
      { quantity: "100", rate: "10" },
      { quantity: "100", rate: "12" },
      { quantity: "-150", rate: "0", countsAsSale: true, inPeriod: true },
    ]);
    expect(cost.toString()).toBe("1600");
  });

  it("preserves thin margin per litre at four decimals", () => {
    const result = productMargin({
      saleQuantity: "1000",
      saleValue: "102930",
      cogs: "100150",
    });
    expect(result.grossProfit.toString()).toBe("2780");
    expect(result.marginPerUnit.toString()).toBe("2.78");
  });
});

describe("payroll arithmetic", () => {
  it("summarises P, A, HD, leave and overtime", () => {
    const result = attendanceSummary([
      { status: "PRESENT" },
      { status: "ABSENT" },
      { status: "HALF_DAY" },
      { status: "CASUAL_LEAVE" },
      { status: "OVERTIME", overtimeHours: "2.5" },
    ]);
    expect(result.present.toString()).toBe("2.5");
    expect(result.absent.toString()).toBe("1.5");
    expect(result.payable.toString()).toBe("3.5");
    expect(result.overtime.toString()).toBe("2.5");
  });

  it("calculates earnings, incentives, deductions and capped short recovery", () => {
    const result = calculateSalary({
      daysPayable: "25.5",
      overtimeHours: "10",
      shiftsWorked: "24",
      litresSold: "5000",
      shortRecoverable: "1200",
      advanceRecovery: "500",
      components: [
        { code: "BASIC", name: "Basic", type: "EARNING", amount: "18000" },
        { code: "OT", name: "Overtime", type: "EARNING", perHourRate: "75" },
        {
          code: "LITRE",
          name: "Litre incentive",
          type: "EARNING",
          perLitreRate: "0.05",
        },
        { code: "PF", name: "PF", type: "DEDUCTION", amount: "1800" },
      ],
    });
    expect(result.grossEarnings.toString()).toBe("19000");
    expect(result.totalDeductions.toString()).toBe("3500");
    expect(result.netPay.toString()).toBe("15500");
  });
});
