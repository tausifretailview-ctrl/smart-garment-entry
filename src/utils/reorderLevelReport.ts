import { supabase } from "@/integrations/supabase/client";
import { reorderState, type ReorderState } from "./industrialMode";

/**
 * Industrial mode "Below reorder level": items with a reorder level whose total
 * stock (all live variants) is at or under it. Read-only.
 */

export type ReorderProductRow = {
  id: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  uom: string | null;
  alt_uom: string | null;
  alt_uom_factor: number | null;
  reorder_level: number | null;
  product_variants: Array<{ stock_qty: number | null; deleted_at: string | null }> | null;
};

export type ReorderLevelItem = {
  productId: string;
  productName: string;
  brand: string;
  category: string;
  uom: string;
  altUom: string | null;
  altFactor: number | null;
  reorderLevel: number;
  stockQty: number;
  shortQty: number;
  state: Exclude<ReorderState, "ok">;
};

export type ReorderLevelSummary = {
  tracked: number;
  items: ReorderLevelItem[];
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Keeps items below or at their level; emptiest first (stock as a share of the level). */
export function summarizeReorderLevels(rows: ReorderProductRow[]): ReorderLevelSummary {
  let tracked = 0;
  const items: ReorderLevelItem[] = [];
  for (const r of rows) {
    if (r.reorder_level === null || r.reorder_level === undefined) continue;
    tracked += 1;
    const level = Number(r.reorder_level) || 0;
    const stock = round3(
      (r.product_variants ?? [])
        .filter((v) => !v.deleted_at)
        .reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0),
    );
    const state = reorderState(stock, level);
    if (state !== "below" && state !== "at") continue;
    items.push({
      productId: r.id,
      productName: (r.product_name ?? "").trim() || "Item",
      brand: (r.brand ?? "").trim(),
      category: (r.category ?? "").trim(),
      uom: r.uom || "NOS",
      altUom: r.alt_uom || null,
      altFactor: r.alt_uom_factor ?? null,
      reorderLevel: level,
      stockQty: stock,
      shortQty: round3(Math.max(0, level - stock)),
      state,
    });
  }
  const fill = (i: ReorderLevelItem) => (i.reorderLevel > 0 ? i.stockQty / i.reorderLevel : 1);
  items.sort((a, b) => fill(a) - fill(b) || b.shortQty - a.shortQty || a.productName.localeCompare(b.productName));
  return { tracked, items };
}

export function filterReorderItems(items: ReorderLevelItem[], search: string): ReorderLevelItem[] {
  const term = search.trim().toLowerCase();
  if (!term) return items;
  return items.filter(
    (i) =>
      i.productName.toLowerCase().includes(term) ||
      i.brand.toLowerCase().includes(term) ||
      i.category.toLowerCase().includes(term),
  );
}

const PAGE = 1000;
const MAX_PAGES = 10;

export async function fetchReorderLevelItems(organizationId: string): Promise<ReorderLevelSummary & { truncated: boolean }> {
  const rows: ReorderProductRow[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, category, uom, alt_uom, alt_uom_factor, reorder_level, product_variants(stock_qty, deleted_at)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("reorder_level", "is", null)
      .order("id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as ReorderProductRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  return { ...summarizeReorderLevels(rows), truncated };
}
