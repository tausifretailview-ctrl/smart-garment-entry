/** Decide how to fill a purchase line barcode on an existing SKU.
 * The barcode already on the stocked item wins, even when the line shows a
 * different number. A second barcode for the same SKU is how a bill can print
 * 0040008515 while POS only finds 40004714.
 * A line barcode is kept only when the SKU barcode is still empty (the caller
 * writes it onto that SKU). Generate only when both are empty. */
export function planExistingSkuBarcodeFill(
  displayedBarcode: string | null | undefined,
  databaseBarcode: string | null | undefined,
): "displayed" | "database" | "generate" {
  const saved = (databaseBarcode || "").trim();
  if (saved) return "database";
  if ((displayedBarcode || "").trim()) return "displayed";
  return "generate";
}
