import { describe, expect, it } from "vitest";
import type { LabelItem } from "@/types/labelTypes";
import { buildFullPageSlots, computeSheetFit, expandLabelsByQty, fitA4PageZoom } from "./fullPageSheet";

const item = (barcode: string, qty: number) =>
  ({ product_name: `P${barcode}`, barcode, sale_price: 100, qty } as unknown as LabelItem);

const kinds = (slots: { kind: string; item?: LabelItem }[]) =>
  slots.map((s) => (s.kind === "label" ? s.item!.barcode : s.kind === "skip" ? "-" : "."));

describe("fullPageSheet", () => {
  it("expands labels by qty in order", () => {
    expect(expandLabelsByQty([item("A", 2), item("B", 0), item("C", 1)]).map((i) => i.barcode)).toEqual(["A", "A", "C"]);
  });

  it("print mode: skips used slots, then labels, then empty; pages like the PDF", () => {
    const r = buildFullPageSlots({ items: [item("A", 3), item("B", 2)], slotsPerPage: 4, startPosition: 2, mode: "print" });
    expect(r.pageCount).toBe(2);
    expect(r.totalLabels).toBe(5);
    expect(kinds(r.slots)).toEqual(["-", "A", "A", "A"]);
    const p2 = buildFullPageSlots({ items: [item("A", 3), item("B", 2)], slotsPerPage: 4, startPosition: 2, mode: "print", page: 1 });
    expect(kinds(p2.slots)).toEqual(["B", "B", ".", "."]);
  });

  it("print mode with no labels shows one empty page", () => {
    const r = buildFullPageSlots({ items: [], slotsPerPage: 3, mode: "print" });
    expect(r.pageCount).toBe(1);
    expect(kinds(r.slots)).toEqual([".", ".", "."]);
  });

  it("fill mode repeats labels across the whole sheet", () => {
    const r = buildFullPageSlots({ items: [item("A", 1), item("B", 1)], slotsPerPage: 5, mode: "fill", startPosition: 3 });
    expect(kinds(r.slots)).toEqual(["A", "B", "A", "B", "A"]);
    // An item added with qty 0 still fills the sheet so the design can be judged.
    expect(kinds(buildFullPageSlots({ items: [item("Z", 0)], slotsPerPage: 2, mode: "fill" }).slots)).toEqual(["Z", "Z"]);
  });

  it("reports how the grid fits on A4", () => {
    // Novajet 65: 5×13 of 38×21mm, 1mm gap → 194×285mm.
    const fit = computeSheetFit({ cols: 5, rows: 13, widthMm: 38, heightMm: 21, gapMm: 1, marginTopMm: 6, marginLeftMm: 8 });
    expect(fit.contentWidthMm).toBe(194);
    expect(fit.contentHeightMm).toBe(285);
    expect(fit.rightMm).toBe(8);
    expect(fit.bottomMm).toBe(6);
    expect(fit.overflowXMm).toBe(0);
    const over = computeSheetFit({ cols: 5, rows: 13, widthMm: 38, heightMm: 21, gapMm: 1, marginTopMm: 15, marginLeftMm: 20 });
    expect(over.overflowXMm).toBe(4);
    expect(over.overflowYMm).toBe(3);
  });

  it("fits the page into the panel", () => {
    expect(fitA4PageZoom(800, 1123)).toBe(1);
    expect(fitA4PageZoom(400, 2000)).toBe(0.5);
    expect(fitA4PageZoom(0, 100)).toBe(0.5);
  });
});
