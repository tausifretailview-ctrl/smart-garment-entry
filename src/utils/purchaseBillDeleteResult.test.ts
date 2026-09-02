import { describe, expect, it } from "vitest";
import { parsePurchaseBillDeleteResult } from "./purchaseBillDeleteResult";

describe("parsePurchaseBillDeleteResult", () => {
  it("treats the legacy integer RPC as zero-stock remaining (no auto-delete)", () => {
    expect(parsePurchaseBillDeleteResult(3)).toEqual({
      autoDeletedProducts: 0,
      zeroStockRemaining: 3,
    });
  });

  it("reads jsonb counts from the restored new-product cleanup", () => {
    expect(
      parsePurchaseBillDeleteResult({
        auto_deleted_product_count: 2,
        zero_stock_remaining_count: 1,
      }),
    ).toEqual({ autoDeletedProducts: 2, zeroStockRemaining: 1 });
  });

  it("ignores null / empty payloads", () => {
    expect(parsePurchaseBillDeleteResult(null)).toEqual({
      autoDeletedProducts: 0,
      zeroStockRemaining: 0,
    });
    expect(parsePurchaseBillDeleteResult(0)).toEqual({
      autoDeletedProducts: 0,
      zeroStockRemaining: 0,
    });
  });
});
