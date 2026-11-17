import { supabase } from "@/integrations/supabase/client";
import { ID_BATCH_SIZE } from "@/lib/data/fetchInIdBatches";

/** GST rates a product can carry (0.25% / 3% are for debit notes and gold, not product masters). */
export const PRODUCT_GST_RATES = [0, 5, 12, 18, 28, 40] as const;

/** HSN / SAC: 2 to 8 digits. */
export function normalizeHsnInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 8);
}

export function isValidHsn(hsn: string): boolean {
  return /^\d{2,8}$/.test(hsn);
}

export type ProductHsnGstPatch = {
  /** New HSN; undefined = leave as is. */
  hsn?: string;
  /** New GST %; undefined = leave as is. */
  gstPercent?: number;
};

/**
 * Columns to write for an HSN / GST change.
 * POS, Sales Invoice and Purchase read `sale_gst_percent` / `purchase_gst_percent` before
 * `gst_per`, so a GST change sets all three — changing only `gst_per` left bills on the old rate.
 */
export function productHsnGstColumns(patch: ProductHsnGstPatch): Record<string, string | number> {
  const cols: Record<string, string | number> = {};
  if (patch.hsn !== undefined) cols.hsn_code = patch.hsn;
  if (patch.gstPercent !== undefined) {
    cols.gst_per = patch.gstPercent;
    cols.sale_gst_percent = patch.gstPercent;
    cols.purchase_gst_percent = patch.gstPercent;
  }
  return cols;
}

/**
 * Set HSN and / or GST % on the given products of one shop, 200 ids per request.
 * Only the product masters change: bills already saved keep the HSN / GST they were made with.
 * Returns how many products were updated; the first failed batch throws.
 */
export async function updateProductsHsnGst(params: {
  organizationId: string;
  productIds: string[];
  patch: ProductHsnGstPatch;
}): Promise<number> {
  const { organizationId, patch } = params;
  const cols = productHsnGstColumns(patch);
  if (!organizationId || Object.keys(cols).length === 0) return 0;
  if (patch.hsn !== undefined && !isValidHsn(patch.hsn)) throw new Error("HSN must be 2 to 8 digits.");
  if (
    patch.gstPercent !== undefined &&
    !(PRODUCT_GST_RATES as readonly number[]).includes(patch.gstPercent)
  ) {
    throw new Error(`GST ${patch.gstPercent}% is not a product GST rate.`);
  }

  const ids = [...new Set(params.productIds.filter(Boolean))];
  let updated = 0;
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    const batch = ids.slice(i, i + ID_BATCH_SIZE);
    const { data, error } = await supabase
      .from("products")
      .update(cols as never)
      .eq("organization_id", organizationId)
      .in("id", batch)
      .is("deleted_at", null)
      .select("id");
    if (error) throw error;
    updated += data?.length ?? 0;
  }
  return updated;
}
