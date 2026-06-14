import { supabase } from "@/integrations/supabase/client";

export type BarcodeConflict = {
  barcode: string;
  productName: string;
};

/** Trim, drop blanks, dedupe. */
export function normalizeBarcodes(
  barcodes: Array<string | null | undefined>,
): string[] {
  return [...new Set(
    barcodes.map((b) => String(b ?? "").trim()).filter(Boolean),
  )];
}

/**
 * Check if a barcode already exists in product_variants for the given organization.
 * Optionally exclude a specific variant ID (useful for edit scenarios).
 */
export async function checkBarcodeExists(
  barcode: string,
  organizationId: string,
  excludeVariantId?: string,
): Promise<{ exists: boolean; productName?: string }> {
  const conflicts = await findBarcodeConflictsInOrg(
    [barcode],
    organizationId,
    excludeVariantId ? { excludeVariantIds: [excludeVariantId] } : undefined,
  );
  if (!conflicts.length) return { exists: false };
  return { exists: true, productName: conflicts[0].productName };
}

/**
 * Return barcodes from the list that already exist on another product in the org.
 */
export async function findBarcodeConflictsInOrg(
  barcodes: Array<string | null | undefined>,
  organizationId: string,
  options?: {
    excludeProductId?: string | null;
    excludeVariantIds?: string[];
  },
): Promise<BarcodeConflict[]> {
  const cleaned = normalizeBarcodes(barcodes);
  if (!cleaned.length) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, barcode, product_id, products!inner(product_name)")
    .eq("organization_id", organizationId)
    .in("barcode", cleaned)
    .is("deleted_at", null);

  if (error) throw error;

  const excludeVariantIds = new Set(options?.excludeVariantIds?.filter(Boolean) ?? []);

  return (data ?? [])
    .filter((row) => {
      if (excludeVariantIds.has(row.id)) return false;
      if (options?.excludeProductId && row.product_id === options.excludeProductId) {
        return false;
      }
      return true;
    })
    .map((row) => ({
      barcode: String(row.barcode),
      productName:
        (row.products as { product_name?: string } | null)?.product_name ||
        "Unknown Product",
    }));
}

export function formatBarcodeConflictMessage(conflicts: BarcodeConflict[]): string {
  const seen = new Map<string, string>();
  for (const conflict of conflicts) {
    if (!seen.has(conflict.barcode)) {
      seen.set(conflict.barcode, conflict.productName);
    }
  }
  return [...seen.entries()]
    .map(([barcode, productName]) => `"${barcode}" (${productName})`)
    .join(", ");
}
