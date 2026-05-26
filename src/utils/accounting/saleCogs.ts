import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

type ItemQtyVariant = { quantity?: number | null; qty?: number | null; variant_id: string | null };

async function sumQtyTimesPurPrice(
  items: ItemQtyVariant[],
  client: SupabaseClient<Database>
): Promise<number> {
  if (!items.length) return 0;
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter(Boolean))] as string[];
  const priceMap = new Map<string, number>();
  if (variantIds.length > 0) {
    const { data: variants, error } = await client
      .from("product_variants")
      .select("id, pur_price")
      .in("id", variantIds);
    if (error) throw error;
    for (const v of variants ?? []) {
      priceMap.set(v.id, Number(v.pur_price ?? 0));
    }
  }
  let total = 0;
  for (const item of items) {
    const qty = Number(item.quantity ?? item.qty ?? 0);
    const pur = item.variant_id ? priceMap.get(item.variant_id) ?? 0 : 0;
    total += qty * pur;
  }
  return round2(total);
}

/** COGS for a sale: Σ (qty × variant pur_price) — matches operational P&L. */
export async function fetchSaleCogsAmount(
  saleId: string,
  client: SupabaseClient<Database>
): Promise<number> {
  const { data: items, error } = await client
    .from("sale_items")
    .select("quantity, variant_id")
    .eq("sale_id", saleId)
    .is("deleted_at", null);
  if (error) throw error;
  return sumQtyTimesPurPrice((items ?? []) as ItemQtyVariant[], client);
}

/** Stock cost reversed on sale return. */
export async function fetchSaleReturnCogsAmount(
  saleReturnId: string,
  client: SupabaseClient<Database>
): Promise<number> {
  const { data: items, error } = await client
    .from("sale_return_items")
    .select("quantity, variant_id")
    .eq("return_id", saleReturnId)
    .is("deleted_at", null);
  if (error) throw error;
  return sumQtyTimesPurPrice((items ?? []) as ItemQtyVariant[], client);
}

/** Inventory value reversed on purchase return (uses line pur_price). */
export async function fetchPurchaseReturnStockAmount(
  purchaseReturnId: string,
  client: SupabaseClient<Database>
): Promise<number> {
  const { data: items, error } = await client
    .from("purchase_return_items")
    .select("qty, pur_price")
    .eq("return_id", purchaseReturnId)
    .is("deleted_at", null);
  if (error) throw error;
  let total = 0;
  for (const row of items ?? []) {
    total += Number(row.qty ?? 0) * Number(row.pur_price ?? 0);
  }
  return round2(total);
}
