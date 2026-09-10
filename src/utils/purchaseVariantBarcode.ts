/** Decide how to fill a purchase line barcode on an existing SKU.
 * Never generate-and-write when the variant already has a barcode in the DB
 * (search grouping used to blank the displayed code and overwrite master).
 * Save/edit: a line that already carries barcode X is attached to the live
 * item holding X in purchaseLineBarcodeMatch / resolve_purchase_line_existing_barcode. */
export function planExistingSkuBarcodeFill(
  displayedBarcode: string | null | undefined,
  databaseBarcode: string | null | undefined,
): "displayed" | "database" | "generate" {
  if ((displayedBarcode || "").trim()) return "displayed";
  if ((databaseBarcode || "").trim()) return "database";
  return "generate";
}
