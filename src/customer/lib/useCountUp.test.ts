import { describe, expect, it } from "vitest";
import { countUpValue, easeOutCubic } from "./useCountUp";

describe("count-up easing", () => {
  it("starts at 0, ends at 1 and is clamped", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it("counts in whole rupees from start to target", () => {
    expect(countUpValue(0, 1800, 0)).toBe(0);
    expect(countUpValue(0, 1800, 1)).toBe(1800);
    expect(countUpValue(1800, 1200, 1)).toBe(1200);
    expect(Number.isInteger(countUpValue(0, 999, 0.37))).toBe(true);
  });
});
