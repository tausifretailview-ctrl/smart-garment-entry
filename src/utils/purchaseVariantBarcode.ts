/** Decide how to fill a purchase line barcode on an existing SKU.
 * Never generate-and-write when the variant already has a barcode in the DB
 * (search grouping used to blank the displayed code and overwrite master). */
export function planExistingSkuBarcodeFill(
  displayedBarcode: string | null | undefined,
  databaseBarcode: string | null | undefined,
): "displayed" | "database" | "generate" {
  if ((displayedBarcode || "").trim()) return "displayed";
  if ((databaseBarcode || "").trim()) return "database";
  return "generate";
}
