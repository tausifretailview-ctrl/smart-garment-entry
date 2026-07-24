import { describe, expect, it } from "vitest";
import {
  getSettlementLockedCartItems,
  toLockedVariantIdSet,
} from "@/hooks/useOpenSettlementVariantIds";

describe("toLockedVariantIdSet", () => {
  it("rebuilds a Set from a string array (persist-safe query shape)", () => {
    const set = toLockedVariantIdSet(["a", "b", ""]);
    expect(set).toBeInstanceOf(Set);
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(true);
    expect(set.has("")).toBe(false);
  });

  it("treats persisted empty object (dehydrated Set) as empty locks", () => {
    // JSON.stringify(new Set(["x"])) === "{}" — this is what broke POS barcode add.
    const set = toLockedVariantIdSet({});
    expect(set).toBeInstanceOf(Set);
    expect(set.size).toBe(0);
    expect(() => set.has("x")).not.toThrow();
    expect(set.has("x")).toBe(false);
  });

  it("passes through a real Set", () => {
    const original = new Set(["locked-1"]);
    expect(toLockedVariantIdSet(original)).toBe(original);
  });
});

describe("getSettlementLockedCartItems", () => {
  it("does not throw when locked ids were restored as a plain object", () => {
    const items = [
      { variantId: "v1", productName: "A", barcode: "1" },
      { variantId: "v2", productName: "B", barcode: "2" },
    ];
    expect(() => getSettlementLockedCartItems(items, {})).not.toThrow();
    expect(getSettlementLockedCartItems(items, {})).toEqual([]);
    expect(getSettlementLockedCartItems(items, ["v2"]).map((i) => i.variantId)).toEqual(["v2"]);
  });
});
