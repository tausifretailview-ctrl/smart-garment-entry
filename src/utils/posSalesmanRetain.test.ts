import { describe, expect, it } from "vitest";
import {
  shouldClearPosSalesmanAfterSave,
  shouldCreatePosCommissionOnSave,
} from "@/utils/posSalesmanRetain";

describe("shouldClearPosSalesmanAfterSave", () => {
  it("clears when retain setting is off (default)", () => {
    expect(shouldClearPosSalesmanAfterSave(false)).toBe(true);
  });

  it("retains when retain setting is on", () => {
    expect(shouldClearPosSalesmanAfterSave(true)).toBe(false);
  });
});

describe("shouldCreatePosCommissionOnSave", () => {
  it("records once for a new bill with a salesman", () => {
    expect(
      shouldCreatePosCommissionOnSave({
        salesmanName: "CHETAN",
        isEditingExistingSale: false,
      }),
    ).toBe(true);
  });

  it("does not record when salesman empty", () => {
    expect(
      shouldCreatePosCommissionOnSave({
        salesmanName: "  ",
        isEditingExistingSale: false,
      }),
    ).toBe(false);
  });

  it("does not record when editing an existing sale (no duplicate)", () => {
    expect(
      shouldCreatePosCommissionOnSave({
        salesmanName: "CHETAN",
        isEditingExistingSale: true,
      }),
    ).toBe(false);
  });

  it("retained name on the next new bill still records once", () => {
    // After save: currentSaleId cleared, salesman may still be "CHETAN"
    expect(
      shouldCreatePosCommissionOnSave({
        salesmanName: "CHETAN",
        isEditingExistingSale: false,
      }),
    ).toBe(true);
  });
});
