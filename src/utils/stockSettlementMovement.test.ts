import { describe, expect, it } from "vitest";
import { isStockSettlementMovement, movementLabelKey } from "./stockSettlementMovement";

describe("stock settlement movement label", () => {
  it("tags settlement and write-off notes", () => {
    expect(isStockSettlementMovement("reconciliation", "Stock Settlement: 5 → 3 (counted 3, software 5)")).toBe(true);
    expect(isStockSettlementMovement("reconciliation", "Stock settlement: 5 → 3 (adjustment: -2)")).toBe(true);
    expect(isStockSettlementMovement("reconciliation", "Stock Settlement write off (not found): 4 → 0")).toBe(true);
    expect(isStockSettlementMovement("reconciliation", "Physical Count — not found: 4 → 0 (session ab12cd34)")).toBe(true);
    expect(isStockSettlementMovement("reconciliation", "Reversal: Physical Count — not found: restored 4")).toBe(true);
  });

  it("keeps Stock Adjustment and other types", () => {
    expect(isStockSettlementMovement("reconciliation", "Stock Adjustment: stock 5 → 3, opening 5 → 3")).toBe(false);
    expect(isStockSettlementMovement("reconciliation", null)).toBe(false);
    expect(isStockSettlementMovement("sale", "Stock Settlement: x")).toBe(false);
    expect(movementLabelKey("reconciliation", "Stock Adjustment: x")).toBe("reconciliation");
    expect(movementLabelKey("reconciliation", "Stock Settlement: x")).toBe("stock_settlement");
  });
});
