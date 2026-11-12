import { describe, expect, it } from "vitest";
import { stockDriftChange } from "./stockDrift";

describe("nightly stock check: change since last night", () => {
  it("shows worse as +n, better as −n, and nothing when unchanged or first run", () => {
    expect(stockDriftChange({ drift_variants: 5, previous_drift_variants: 2 })).toBe("+3");
    expect(stockDriftChange({ drift_variants: 1, previous_drift_variants: 4 })).toBe("−3");
    expect(stockDriftChange({ drift_variants: 4, previous_drift_variants: 4 })).toBe("");
    expect(stockDriftChange({ drift_variants: 4, previous_drift_variants: null })).toBe("");
  });
});
