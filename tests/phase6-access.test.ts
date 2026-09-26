import { describe, expect, it } from "vitest";
import { describeDevice, isDateWithinWindow } from "../src/lib/access";

describe("Phase 6 user restrictions", () => {
  const today = new Date("2026-09-23T00:00:00.000Z");
  it("rejects a prior date when a salesman is locked to today", () => {
    expect(
      isDateWithinWindow(new Date("2026-09-22T00:00:00.000Z"), today, today),
    ).toBe(false);
    expect(isDateWithinWindow(today, today, today)).toBe(true);
  });
  it("honours open-ended date windows", () => {
    expect(isDateWithinWindow(today, null, null)).toBe(true);
    expect(
      isDateWithinWindow(today, new Date("2026-09-24T00:00:00.000Z"), null),
    ).toBe(false);
  });
  it("derives a filterable device label without storing credentials", () => {
    expect(
      describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/140.0"),
    ).toBe("Windows · Chrome");
    expect(describeDevice(null)).toBeNull();
  });
});
