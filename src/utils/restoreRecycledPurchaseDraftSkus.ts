import { supabase } from "@/integrations/supabase/client";
import { isUnusedGeneratedSkuCandidate } from "@/utils/recycleUnusedGeneratedBarcode";

const IN_QUERY_CHUNK = 100;

export function shouldRestoreRecycledDraftVariant(
  row: {
    organization_id?: string | null;
    deleted_at?: string | null;
    stock_qty?: number | null;
    barcode_source?: string | null;
    barcode?: string | null;
  },
  organizationId: string,
): boolean {
  if (!row || String(row.organization_id || "") !== organizationId) return false;
  if (!row.deleted_at) return false;
  if ((Number(row.stock_qty) || 0) > 0) return false;
  return isUnusedGeneratedSkuCandidate(row);
}

/**
 * Recycle can soft-delete a generated SKU that is still on an unsaved bill
 * (size-grid loop / stale lineItemsRef). Undelete those rows so save can
 * find them: Line N: variant … not found for organization.
 */
export async function restoreRecycledPurchaseDraftSkus(opts: {
  organizationId: string;
  skuIds: Array<string | null | undefined>;
}): Promise<{ restored: string[] }> {
  const { organizationId } = opts;
  const unique = [
    ...new Set(
      (opts.skuIds || []).map((id) => String(id || "").trim()).filter(Boolean),
    ),
  ];
  if (!organizationId || unique.length === 0) return { restored: [] };

  const restored: string[] = [];
  for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK) {
    const chunk = unique.slice(i, i + IN_QUERY_CHUNK);
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, organization_id, deleted_at, stock_qty, barcode, barcode_source")
      .eq("organization_id", organizationId)
      .in("id", chunk);
    if (error) throw error;

    const toRestore = ((data as Array<{
      id: string;
      organization_id?: string | null;
      deleted_at?: string | null;
      stock_qty?: number | null;
      barcode_source?: string | null;
      barcode?: string | null;
    }>) ?? []).filter((row) => shouldRestoreRecycledDraftVariant(row, organizationId));

    for (const row of toRestore) {
      const { error: updErr } = await supabase
        .from("product_variants")
        .update({ deleted_at: null, active: true } as never)
        .eq("organization_id", organizationId)
        .eq("id", row.id);
      if (!updErr) restored.push(row.id);
    }
  }
  return { restored };
}
