import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  expandRowsIntoPieces,
  isPerPieceBarcodeEnabled,
  isPerPieceMeasuredUom,
  pieceCountToSplit,
  PER_PIECE_BARCODE_MAX_PIECES,
} from "./purchasePerPieceBarcode";

describe("per-piece barcode setting", () => {
  it("is OFF unless the purchase setting is explicitly true", () => {
    expect(isPerPieceBarcodeEnabled(undefined)).toBe(false);
    expect(isPerPieceBarcodeEnabled({})).toBe(false);
    expect(isPerPieceBarcodeEnabled({ per_piece_barcode: false })).toBe(false);
    expect(isPerPieceBarcodeEnabled({ per_piece_barcode: true })).toBe(true);
  });

  it("splits only whole quantities of 2 or more", () => {
    expect(pieceCountToSplit(1)).toBe(0);
    expect(pieceCountToSplit(2)).toBe(2);
    expect(pieceCountToSplit("3")).toBe(3);
    expect(pieceCountToSplit(2.5)).toBe(0);
    expect(pieceCountToSplit(PER_PIECE_BARCODE_MAX_PIECES + 1)).toBe(0);
  });

  it("treats measured units as never split", () => {
    expect(isPerPieceMeasuredUom("mtr")).toBe(true);
    expect(isPerPieceMeasuredUom("KG")).toBe(true);
    expect(isPerPieceMeasuredUom("NOS")).toBe(false);
    expect(isPerPieceMeasuredUom(undefined)).toBe(false);
  });

  it("S = 2, M = 1 becomes three qty-1 rows; scanned EAN row stays whole", () => {
    const rows = [
      { size: "S", qty: 2, barcode: "" },
      { size: "M", qty: 1, barcode: "" },
      { size: "L", qty: 3, barcode: "8901234567890" },
    ];
    const { rows: out, skippedTooMany } = expandRowsIntoPieces(
      rows,
      (r) => r.qty,
      (r) => !r.barcode,
      (r) => ({ ...r, qty: 1 }),
    );
    expect(out.map((r) => `${r.size}/${r.qty}`)).toEqual(["S/1", "S/1", "M/1", "L/3"]);
    expect(skippedTooMany).toBe(0);
  });

  it("reports rows kept whole because they have too many pieces", () => {
    const { rows, skippedTooMany } = expandRowsIntoPieces(
      [{ qty: PER_PIECE_BARCODE_MAX_PIECES + 5 }],
      (r) => r.qty,
      () => true,
      (r) => ({ ...r, qty: 1 }),
    );
    expect(rows).toHaveLength(1);
    expect(skippedTooMany).toBe(1);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

describe("per-piece barcode wiring", () => {
  it("Add New Product splits rows and clears the copied barcode on extra pieces", () => {
    const dialog = readFileSync(join(root, "src/components/ProductEntryDialog.tsx"), "utf8");
    const fn = dialog.slice(dialog.indexOf("perPieceBarcodeEnabled &&"));
    expect(fn.slice(0, 1500)).toContain("expandRowsIntoPieces(");
    expect(fn.slice(0, 1500)).toContain('barcode: ""');
  });

  it("size grid / use-existing splits before creating SKUs", () => {
    const purchase = readFileSync(join(root, "src/pages/PurchaseEntry.tsx"), "utf8");
    const fn = purchase.slice(
      purchase.indexOf("const handleSizeGridConfirm = async"),
      purchase.indexOf("for (const { variant, qty } of items)", purchase.indexOf("const handleSizeGridConfirm = async")),
    );
    expect(fn).toContain("perPieceBarcodeEnabled");
    expect(fn).toContain("expandRowsIntoPieces(");
  });

  it("Settings > Purchase has the toggle", () => {
    const settings = readFileSync(join(root, "src/pages/Settings.tsx"), "utf8");
    expect(settings).toContain("per_piece_barcode: checked as boolean");
  });
});
