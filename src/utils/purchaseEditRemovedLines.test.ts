import { describe, expect, it } from "vitest";
import {
  findRemovedSavedPurchaseLines,
  removedSavedPurchaseLinesMessage,
} from "./purchaseEditRemovedLines";

const saved = [
  { temp_id: "a", qty: 7, product_name: "SMART LOOK", barcode: "10000293" },
  { temp_id: "b", qty: 8, product_name: "CRUSH PATOLA", barcode: "10000294" },
];

describe("findRemovedSavedPurchaseLines", () => {
  it("returns nothing when every saved line is still in the grid", () => {
    expect(
      findRemovedSavedPurchaseLines(saved, [...saved, { temp_id: "new", qty: 3 }]),
    ).toEqual([]);
  });

  it("returns saved lines missing from the grid", () => {
    expect(
      findRemovedSavedPurchaseLines(saved, [{ temp_id: "b", qty: 8 }]).map((l) => l.temp_id),
    ).toEqual(["a"]);
  });
});

describe("removedSavedPurchaseLinesMessage", () => {
  it("flags removing all saved lines", () => {
    const msg = removedSavedPurchaseLinesMessage("PUR/26-27/124", saved, 2);
    expect(msg).toContain("REMOVE ALL 2 saved line(s) (15 qty) from PUR/26-27/124");
    expect(msg).toContain("SMART LOOK (10000293) × 7");
  });

  it("lists at most five lines", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ temp_id: String(i), qty: 1, product_name: `P${i}` }));
    const msg = removedSavedPurchaseLinesMessage("PUR/1", many, 10);
    expect(msg).toContain("remove 7 saved line(s) (7 qty)");
    expect(msg).toContain("…and 2 more");
    expect(msg).not.toContain("P6");
  });
});
