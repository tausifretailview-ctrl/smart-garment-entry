import { supabase } from "@/integrations/supabase/client";
import { fetchInIdBatches, ID_BATCH_SIZE } from "@/lib/data/fetchInIdBatches";

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
  /** New colour for the product and every size / barcode of it; undefined = leave as is. */
  color?: string;
};

/** Colours are stored upper-case and trimmed (Product Entry does the same). */
export function normalizeColorInput(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

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

export type ProductHsnGstResult = {
  /** Products whose HSN / GST / colour changed. */
  updated: number;
  /** Products left with their colours because their sizes carry more than one colour. */
  colorSkipped: number;
};

/**
 * Set HSN, GST % and / or colour on the given products of one shop, 200 ids per request.
 * Colour goes on the product and on every size / barcode (bills, labels and stock read the size
 * colour first). A product whose sizes have different colours is skipped for colour: one colour
 * on all of them would clash (same size twice) — change those per size in Product Entry.
 * Saved bills keep the HSN / GST / colour copied onto their own lines.
 */
export async function updateProductsHsnGst(params: {
  organizationId: string;
  productIds: string[];
  patch: ProductHsnGstPatch;
}): Promise<ProductHsnGstResult> {
  const { organizationId, patch } = params;
  const { color, ...rest } = patch;
  const otherCols = productHsnGstColumns(rest);
  const none = { updated: 0, colorSkipped: 0 };
  if (!organizationId || (Object.keys(otherCols).length === 0 && color === undefined)) return none;
  if (patch.hsn !== undefined && !isValidHsn(patch.hsn)) throw new Error("HSN must be 2 to 8 digits.");
  if (
    patch.gstPercent !== undefined &&
    !(PRODUCT_GST_RATES as readonly number[]).includes(patch.gstPercent)
  ) {
    throw new Error(`GST ${patch.gstPercent}% is not a product GST rate.`);
  }
  if (color !== undefined && !color) throw new Error("Enter a colour.");

  const ids = [...new Set(params.productIds.filter(Boolean))];
  const touched = new Set<string>();

  let colorIds: string[] = [];
  let colorSkipped = 0;
  if (color !== undefined) {
    const variants = await fetchInIdBatches<{ product_id: string; color: string | null }>(ids, (batch) =>
      supabase
        .from("product_variants")
        .select("product_id, color")
        .eq("organization_id", organizationId)
        .in("product_id", batch)
        .is("deleted_at", null)
        .order("id"),
    );
    const colorsByProduct = new Map<string, Set<string>>();
    for (const v of variants) {
      const c = String(v.color ?? "").trim().toUpperCase();
      if (!c) continue;
      if (!colorsByProduct.has(v.product_id)) colorsByProduct.set(v.product_id, new Set());
      colorsByProduct.get(v.product_id)!.add(c);
    }
    colorIds = ids.filter((id) => (colorsByProduct.get(id)?.size ?? 0) <= 1);
    colorSkipped = ids.length - colorIds.length;
  }

  const runProducts = async (batchIds: string[], cols: Record<string, string | number>) => {
    for (let i = 0; i < batchIds.length; i += ID_BATCH_SIZE) {
      const batch = batchIds.slice(i, i + ID_BATCH_SIZE);
      const { data, error } = await supabase
        .from("products")
        .update(cols as never)
        .eq("organization_id", organizationId)
        .in("id", batch)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      for (const row of data ?? []) touched.add((row as { id: string }).id);
    }
  };

  if (Object.keys(otherCols).length > 0) await runProducts(ids, otherCols);

  if (color !== undefined && colorIds.length > 0) {
    for (let i = 0; i < colorIds.length; i += ID_BATCH_SIZE) {
      const batch = colorIds.slice(i, i + ID_BATCH_SIZE);
      const { error } = await supabase
        .from("product_variants")
        .update({ color } as never)
        .eq("organization_id", organizationId)
        .in("product_id", batch)
        .is("deleted_at", null);
      if (error) throw error;
    }
    await runProducts(colorIds, { color });
  }

  return { updated: touched.size, colorSkipped };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find & replace on one colour value (exact, or every case-insensitive occurrence). */
export function replaceColorText(current: string, find: string, replace: string, exactMatch: boolean): string | null {
  if (!current || !find) return null;
  if (exactMatch) return current === find ? replace : null;
  if (!current.toLowerCase().includes(find.toLowerCase())) return null;
  return current.replace(new RegExp(escapeRegExp(find), "gi"), replace);
}

/**
 * Bulk Product Update → Find & Replace on Colour: the same replace on every size / barcode of the
 * given products (bills, labels and stock show the size colour first). Returns sizes changed.
 */
export async function replaceVariantColors(params: {
  organizationId: string;
  productIds: string[];
  find: string;
  replace: string;
  exactMatch: boolean;
}): Promise<number> {
  const { organizationId, find, replace, exactMatch } = params;
  if (!organizationId || !find) return 0;
  const variants = await fetchInIdBatches<{ id: string; color: string | null }>(params.productIds, (batch) =>
    supabase
      .from("product_variants")
      .select("id, color")
      .eq("organization_id", organizationId)
      .in("product_id", batch)
      .is("deleted_at", null)
      .not("color", "is", null)
      .order("id"),
  );
  const idsByNewColor = new Map<string, string[]>();
  for (const v of variants) {
    const next = replaceColorText(String(v.color ?? ""), find, replace, exactMatch);
    if (next == null || next === v.color) continue;
    if (!idsByNewColor.has(next)) idsByNewColor.set(next, []);
    idsByNewColor.get(next)!.push(v.id);
  }
  let changed = 0;
  for (const [next, ids] of idsByNewColor) {
    for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
      const batch = ids.slice(i, i + ID_BATCH_SIZE);
      const { error } = await supabase
        .from("product_variants")
        .update({ color: next || null } as never)
        .eq("organization_id", organizationId)
        .in("id", batch);
      if (error) throw error;
      changed += batch.length;
    }
  }
  return changed;
}
