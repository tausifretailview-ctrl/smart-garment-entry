import { describe, expect, it } from "vitest";
import { isPurchaseBillLoadIncomplete } from "./purchaseBillLoadIncomplete";

describe("isPurchaseBillLoadIncomplete", () => {
  it("does not flag KS-style header qty drift when all lines loaded", () => {
    expect(
      isPurchaseBillLoadIncomplete({
        loadedQty: 378,
        loadedLineCount: 80,
        headerQty: 382,
        headerLineCount: 80,
      }),
    ).toBe(false);
  });

  it("flags truncated fetches when header line count is higher", () => {
    expect(
      isPurchaseBillLoadIncomplete({
        loadedQty: 1000,
        loadedLineCount: 1000,
        headerQty: 1400,
        headerLineCount: 1200,
      }),
    ).toBe(true);
  });

  it("falls back to qty when total_items is missing", () => {
    expect(
      isPurchaseBillLoadIncomplete({
        loadedQty: 378,
        loadedLineCount: 80,
        headerQty: 382,
        headerLineCount: 0,
      }),
    ).toBe(true);
  });
});
