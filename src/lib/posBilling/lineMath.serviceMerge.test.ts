import { describe, expect, it } from "vitest";
import { findPosServiceMergeIndex } from "./lineMath";
import type { PosCartItem } from "./types";

const svc = (over: Partial<PosCartItem>): PosCartItem =>
  ({
    id: "l1",
    barcode: "501",
    productName: "FOOTWEAR",
    size: "-",
    color: "",
    quantity: 1,
    mrp: 949,
    unitCost: 949,
    gstPer: 5,
    discountPercent: 0,
    discountAmount: 0,
    netAmount: 949,
    productId: "p1",
    variantId: "v1",
    productType: "service",
    ...over,
  }) as PosCartItem;

const key = { barcode: "501", variantId: "v1", mrp: 949, unitCost: 949 };

describe("findPosServiceMergeIndex — service line descriptions", () => {
  it("merges same service + price when neither line has a description", () => {
    expect(findPosServiceMergeIndex([svc({})], key)).toBe(0);
  });

  it("merges when both lines carry the same description", () => {
    expect(
      findPosServiceMergeIndex([svc({ itemNotes: "D-102 Bata" })], { ...key, itemNotes: " D-102 Bata " }),
    ).toBe(0);
  });

  it("keeps a new line when the descriptions differ", () => {
    expect(
      findPosServiceMergeIndex([svc({ itemNotes: "D-102 Bata" })], { ...key, itemNotes: "D-205 Paragon" }),
    ).toBe(-1);
  });

  it("does not merge a plain add into a described line (or the reverse)", () => {
    expect(findPosServiceMergeIndex([svc({ itemNotes: "D-102 Bata" })], key)).toBe(-1);
    expect(findPosServiceMergeIndex([svc({})], { ...key, itemNotes: "D-102 Bata" })).toBe(-1);
  });
});
