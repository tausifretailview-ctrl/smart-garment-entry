import { describe, expect, it } from "vitest";
import {
  paginatePurchaseReturnItems,
  purchaseReturnPadRowCount,
  PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS,
} from "@/utils/purchaseReturnPrintLayout";

describe("purchaseReturnPrintLayout", () => {
  it("keeps a typical return on one page", () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(paginatePurchaseReturnItems(items)).toEqual([items]);
  });

  it("splits when items exceed first-page cap", () => {
    const n = PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS + 5;
    const items = Array.from({ length: n }, (_, i) => i);
    const pages = paginatePurchaseReturnItems(items);
    expect(pages[0].length).toBe(PURCHASE_RETURN_FIRST_PAGE_MAX_ITEMS);
    expect(pages[1].length).toBe(5);
  });

  it("pads rows only on a single-page print", () => {
    expect(purchaseReturnPadRowCount(3, 1)).toBeGreaterThan(0);
    expect(purchaseReturnPadRowCount(12, 1)).toBe(0);
    expect(purchaseReturnPadRowCount(12, 2)).toBe(0);
  });
});
