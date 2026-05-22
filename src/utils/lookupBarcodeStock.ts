import { supabase } from "@/integrations/supabase/client";

export type BarcodeStockMatch = {
  variantId: string;
  productId: string;
  productName: string;
  brand: string | null;
  category: string | null;
  style: string | null;
  size: string;
  color: string | null;
  barcode: string | null;
  currentStock: number;
  salePrice: number;
  mrp: number;
  purPrice: number;
};

function escapeIlike(term: string) {
  return term.replace(/[%_\\]/g, "\\$&");
}

/**
 * Look up product variant(s) by barcode for quick stock check (mobile scan).
 */
export async function lookupBarcodeStock(
  organizationId: string,
  barcode: string,
): Promise<BarcodeStockMatch[]> {
  const term = barcode.trim();
  if (!term || !organizationId) return [];

  const variantSelect =
    "id, barcode, size, color, current_stock, stock_qty, sale_price, mrp, pur_price, product_id, products!inner(id, product_name, brand, category, style, organization_id, deleted_at)";

  const { data: exactRows, error: exactErr } = await supabase
    .from("product_variants")
    .select(variantSelect)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("active", true)
    .eq("barcode", term)
    .limit(25);

  if (exactErr) throw exactErr;

  let rows = exactRows ?? [];

  if (rows.length === 0) {
    const escaped = escapeIlike(term);
    const { data: fuzzyRows, error: fuzzyErr } = await supabase
      .from("product_variants")
      .select(variantSelect)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("active", true)
      .ilike("barcode", `%${escaped}%`)
      .limit(25);

    if (fuzzyErr) throw fuzzyErr;
    rows = fuzzyRows ?? [];
  }

  return rows
    .filter((row: any) => {
      const p = row.products;
      return p && !p.deleted_at && p.organization_id === organizationId;
    })
    .map((row: any) => ({
      variantId: row.id,
      productId: row.product_id,
      productName: row.products.product_name,
      brand: row.products.brand ?? null,
      category: row.products.category ?? null,
      style: row.products.style ?? null,
      size: row.size ?? "—",
      color: row.color ?? null,
      barcode: row.barcode ?? null,
      currentStock: Number(row.current_stock ?? row.stock_qty) || 0,
      salePrice: Number(row.sale_price) || 0,
      mrp: Number(row.mrp) || 0,
      purPrice: Number(row.pur_price) || 0,
    }));
}
