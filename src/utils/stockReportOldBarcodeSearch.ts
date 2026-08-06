/**
 * Org-scoped historical barcode lookup for Stock Report.
 * sale_items has no organization_id — tenant scope is via sales!inner.
 */

export const OLD_BARCODE_SALE_ITEMS_SELECT =
  "variant_id, barcode, sales!inner(organization_id)" as const;

/** Minimal PostgREST-shaped client surface used by the lookup. */
export type OldBarcodeSaleItemsClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: "sale_items") => any;
};

/**
 * Map historical sale_items barcodes → variant_id for the given org only.
 * Must never omit the sales.organization_id filter (cross-tenant leak).
 */
export async function fetchOldBarcodeSaleItemMappings(
  client: OldBarcodeSaleItemsClient,
  organizationId: string,
  barcode: string,
): Promise<Map<string, string>> {
  if (!organizationId || !barcode.trim()) return new Map();

  const { data, error } = await client
    .from("sale_items")
    .select(OLD_BARCODE_SALE_ITEMS_SELECT)
    .eq("sales.organization_id", organizationId)
    .is("sales.deleted_at", null)
    .ilike("barcode", `%${barcode}%`)
    .is("deleted_at", null)
    .limit(50);

  if (error) throw error;

  const map = new Map<string, string>();
  (data || []).forEach((item) => {
    if (item.variant_id && item.barcode) {
      map.set(item.barcode.toLowerCase(), item.variant_id);
    }
  });
  return map;
}
