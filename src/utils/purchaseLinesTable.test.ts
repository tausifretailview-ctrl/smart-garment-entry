import { describe, expect, it } from "vitest";
import {
  nextInlineSearchIndex,
  purchaseInlineSearchRowSpans,
  purchaseLinesColumnCount,
  purchaseTotalRowSpans,
} from "./purchaseLinesTable";

const all = { showSize: true, showMrp: true, showGst: true, showDiscPercent: true };
const none = { showSize: false, showMrp: false, showGst: false, showDiscPercent: false };

describe("purchase lines table spans", () => {
  it("column count: 11 fixed plus each optional column", () => {
    expect(purchaseLinesColumnCount(all)).toBe(15);
    expect(purchaseLinesColumnCount(none)).toBe(11);
    expect(purchaseLinesColumnCount({ ...none, showMrp: true })).toBe(12);
  });
  it("inline search row: tick + SR + search + rest = every column", () => {
    for (const c of [all, none, { ...all, showSize: false }, { ...none, showSize: true }]) {
      const s = purchaseInlineSearchRowSpans(c);
      expect(2 + s.search + s.rest).toBe(purchaseLinesColumnCount(c));
    }
    expect(purchaseInlineSearchRowSpans(all)).toEqual({ search: 3, rest: 10 });
    expect(purchaseInlineSearchRowSpans(none)).toEqual({ search: 2, rest: 7 });
  });
  it("total row: QTY total lands in the QTY column with or without SIZE", () => {
    // QTY is column 6 with SIZE (tick, SR, item, size, barcode, qty) and 5 without.
    for (const c of [all, none, { ...all, showSize: false }]) {
      const s = purchaseTotalRowSpans(c);
      const qtyColumn = s.label + 2; // label cells, blank barcode cell, then QTY
      expect(qtyColumn).toBe(c.showSize ? 6 : 5);
      expect(s.label + 2 + s.rest).toBe(purchaseLinesColumnCount(c));
    }
  });
});

describe("nextInlineSearchIndex", () => {
  it("moves and wraps; no results keeps the index", () => {
    expect(nextInlineSearchIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextInlineSearchIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextInlineSearchIndex("ArrowUp", 0, 3)).toBe(2);
    expect(nextInlineSearchIndex("ArrowUp", 2, 3)).toBe(1);
    expect(nextInlineSearchIndex("ArrowDown", 4, 0)).toBe(4);
  });
});
