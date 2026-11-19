/**
 * Sale Invoice: live stock of each line's barcode, shown under the barcode on screen only
 * (bills are printed from the invoice templates, which never read it).
 *
 *   available  = stock in the shop now + what this invoice already took when it was saved
 *                (editing: those pieces come back if removed)
 *   left       = available − pieces of this barcode on the bill now
 */
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";
import { isNonStockTrackedProduct } from "@/utils/productStockDisplay";

export const LIVE_STOCK_REFRESH_MS = 20_000;

export type LiveStockTone = "ok" | "low" | "out";

export type LiveStockView = {
  available: number;
  left: number;
  tone: LiveStockTone;
  /** "Stock 12 · 10 left" style line for the badge. */
  label: string;
  /** Longer text for the tooltip / screen readers. */
  title: string;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/** Null for service / combo lines (no stock kept) and lines without a variant. */
export function saleLineLiveStock(input: {
  productType?: string | null;
  variantId?: string | null;
  stockNow: number | undefined;
  /** Pieces of this variant on the saved invoice being edited (0 for a new bill). */
  freedByEdit: number;
  /** Pieces of this variant on all lines of the bill now. */
  onBill: number;
  lowAt?: number;
}): LiveStockView | null {
  if (!input.variantId || isNonStockTrackedProduct(input.productType)) return null;
  if (input.stockNow === undefined || !Number.isFinite(input.stockNow)) return null;
  const available = input.stockNow + Math.max(0, input.freedByEdit || 0);
  const left = available - Math.max(0, input.onBill || 0);
  const lowAt = input.lowAt ?? 2;
  const tone: LiveStockTone = left < 0 ? "out" : left <= lowAt ? "low" : "ok";
  const label = `Stock ${fmt(available)}${input.onBill > 0 ? ` · ${left < 0 ? `${fmt(-left)} short` : `${fmt(left)} left`}` : ""}`;
  const title =
    left < 0
      ? `Only ${fmt(available)} in stock; the bill has ${fmt(input.onBill)} (${fmt(-left)} more than stock).`
      : `${fmt(available)} in stock; ${fmt(left)} more can be added.`;
  return { available, left, tone, label, title };
}

/** Pieces per variant across the bill's lines. */
export function qtyByVariant(lines: Array<{ variantId?: string | null; quantity?: number | null }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (!l.variantId) continue;
    out.set(l.variantId, (out.get(l.variantId) ?? 0) + (Number(l.quantity) || 0));
  }
  return out;
}

/** Current stock of the bill's barcodes (only these ids; batched past ~200). */
export async function fetchVariantStock(
  client: { from: (t: string) => any },
  orgId: string,
  variantIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(variantIds.filter(Boolean))].sort();
  if (ids.length === 0) return {};
  const rows = await fetchInIdBatches<{ id: string; stock_qty: number | null }>(ids, (batch) =>
    client
      .from("product_variants")
      .select("id, stock_qty")
      .eq("organization_id", orgId)
      .in("id", batch)
      .order("id"),
  );
  return Object.fromEntries(rows.map((r) => [r.id, Number(r.stock_qty) || 0]));
}
