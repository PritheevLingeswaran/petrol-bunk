import { describe, expect, it } from "vitest";
import { Decimal } from "../src/lib/money";
import { interpolateDip } from "../src/lib/dip";

describe("dip interpolation", () => {
  const points = [{ dipMm: new Decimal("100"), litres: new Decimal("2400") }, { dipMm: new Decimal("200"), litres: new Decimal("5100") }];
  it("interpolates between certified rows instead of snapping to a row", () => {
    expect(interpolateDip(points, "150").toString()).toBe("3750");
  });
  it("retains decimal precision before the final litre rounding", () => {
    expect(interpolateDip(points, "125").toString()).toBe("3075");
  });
  it("rejects dips outside the certified range", () => {
    expect(() => interpolateDip(points, "99")).toThrow("outside");
  });
});
