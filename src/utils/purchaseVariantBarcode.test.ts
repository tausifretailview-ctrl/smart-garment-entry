import { describe, expect, it } from "vitest";
import { planExistingSkuBarcodeFill } from "./purchaseVariantBarcode";

describe("planExistingSkuBarcodeFill", () => {
  it("does not generate when the line already shows a barcode", () => {
    expect(planExistingSkuBarcodeFill("90001001", "")).toBe("displayed");
  });

  it("uses the saved variant barcode when search stripped the displayed one", () => {
    expect(planExistingSkuBarcodeFill("", "90001999")).toBe("database");
    expect(planExistingSkuBarcodeFill("   ", "90001999")).toBe("database");
  });

  it("generates only when both the line and the SKU are empty", () => {
    expect(planExistingSkuBarcodeFill("", "")).toBe("generate");
    expect(planExistingSkuBarcodeFill(null, null)).toBe("generate");
  });

  it("keeps the stocked barcode when the line shows a different number", () => {
    expect(planExistingSkuBarcodeFill("0040008515", "40004714")).toBe("database");
    expect(planExistingSkuBarcodeFill("0040011045", "0040012977")).toBe("database");
    expect(planExistingSkuBarcodeFill("40004714", "40004714")).toBe("database");
  });
});
