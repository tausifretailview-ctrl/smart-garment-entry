import { describe, expect, it } from "vitest";
import {
  PURCHASE_SEARCH_MAX_ITEM_IDS,
  purchaseBillTextSearchFilter,
  purchaseSearchOrFilter,
} from "./purchaseBillDashboardSearch";

describe("purchaseSearchOrFilter", () => {
  const text = purchaseBillTextSearchFilter("abc");

  it("is the bill text filter when no line item matched", () => {
    expect(purchaseSearchOrFilter(text, [])).toBe(text);
  });

  it("adds line-item matched bills, deduplicated and capped so the URL stays short", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `b${i}`);
    const filter = purchaseSearchOrFilter(text, [...ids, "b1"]);
    expect(filter.startsWith(`${text},id.in.(`)).toBe(true);
    const inList = filter.slice(filter.indexOf("id.in.(") + 7, -1).split(",");
    expect(inList).toHaveLength(PURCHASE_SEARCH_MAX_ITEM_IDS);
    expect(new Set(inList).size).toBe(inList.length);
  });
});
