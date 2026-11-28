/**
 * Wastage / damage entry (supermarket phase 2, Nov 2026): record_stock_wastage /
 * reverse_stock_wastage and the stock_wastage report rows (migration 20270609120000).
 */
import { fetchAllRows, type RangeQuery } from "@/lib/data/fetchInIdBatches";

export const WASTAGE_REASONS = [
  { value: "breakage", label: "Breakage" },
  { value: "spoilage", label: "Spoiled" },
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "theft", label: "Theft / missing" },
  { value: "shrinkage", label: "Shrinkage (weight loss)" },
  { value: "other", label: "Other" },
] as const;

export type WastageReason = (typeof WASTAGE_REASONS)[number]["value"];

export type WastageLineInput = { variantId: string; quantity: number; reason: WastageReason; notes?: string };

export type WastageRow = {
  id: string;
  doc_number: string;
  variant_id: string;
  quantity: number;
  reason: WastageReason;
  unit_cost: number;
  cost_value: number;
  notes: string | null;
  wasted_on: string;
  created_at: string;
  reversed_at: string | null;
  product_variants?: { barcode: string | null; size: string | null; products?: { product_name: string | null } | null } | null;
};

type DbError = { code?: string; message?: string } | null;

export type WastageDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => {
        gte: (k: string, v: string) => { lte: (k: string, v: string) => { order: (c: string) => RangeQuery<WastageRow> } };
      };
    };
  };
};

export function isMissingWastageSchema(err: DbError | unknown): boolean {
  const e = (err ?? null) as DbError;
  if (!e) return false;
  if (["PGRST202", "42883", "42P01", "PGRST205"].includes(String(e.code))) return true;
  return /stock_wastage|record_stock_wastage/i.test(String(e.message || "")) && /does not exist|schema cache|not find/i.test(String(e.message || ""));
}

export function wastageReasonLabel(reason: string): string {
  return WASTAGE_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export async function recordStockWastage(
  db: WastageDb,
  organizationId: string,
  lines: WastageLineInput[],
  notes?: string,
): Promise<{ docNumber: string; totalQty: number; totalCost: number }> {
  const clean = lines.filter((l) => l.variantId && l.quantity > 0);
  if (clean.length === 0) throw new Error("Add at least one item with a quantity.");
  const { data, error } = await db.rpc("record_stock_wastage", {
    p_organization_id: organizationId,
    p_lines: clean.map((l) => ({ variant_id: l.variantId, quantity: l.quantity, reason: l.reason, notes: l.notes?.trim() || null })),
    p_notes: notes?.trim() || null,
  });
  if (error) {
    if (isMissingWastageSchema(error)) throw new Error("Run SQL 72 (wastage) in the database first.");
    if (/insufficient stock|negative stock/i.test(String(error.message))) throw new Error("Not enough stock for one of the items.");
    throw new Error(error.message || "Wastage not saved");
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return { docNumber: String(r.doc_number ?? ""), totalQty: Number(r.total_qty) || 0, totalCost: Number(r.total_cost) || 0 };
}

export async function reverseStockWastage(db: WastageDb, organizationId: string, docNumber: string): Promise<void> {
  const { error } = await db.rpc("reverse_stock_wastage", { p_organization_id: organizationId, p_doc_number: docNumber });
  if (error) throw new Error(error.message || "Not reversed");
}

/** Report rows between two dates (yyyy-mm-dd), every page. null before the SQL is run. */
export async function fetchWastageRows(db: WastageDb, organizationId: string, from: string, to: string): Promise<WastageRow[] | null> {
  try {
    return await fetchAllRows<WastageRow>(() =>
      db
        .from("stock_wastage")
        .select("id, doc_number, variant_id, quantity, reason, unit_cost, cost_value, notes, wasted_on, created_at, reversed_at, product_variants(barcode, size, products(product_name))")
        .eq("organization_id", organizationId)
        .gte("wasted_on", from)
        .lte("wasted_on", to)
        .order("id"),
    );
  } catch (e) {
    if (isMissingWastageSchema(e)) return null;
    throw e;
  }
}

/** Totals by reason (reversed lines left out), largest cost first. */
export function wastageTotalsByReason(rows: readonly WastageRow[]): Array<{ reason: string; quantity: number; cost: number; lines: number }> {
  const map = new Map<string, { quantity: number; cost: number; lines: number }>();
  for (const r of rows) {
    if (r.reversed_at) continue;
    const t = map.get(r.reason) ?? { quantity: 0, cost: 0, lines: 0 };
    t.quantity = Math.round((t.quantity + Number(r.quantity)) * 1000) / 1000;
    t.cost = Math.round((t.cost + Number(r.cost_value)) * 100) / 100;
    t.lines += 1;
    map.set(r.reason, t);
  }
  return [...map.entries()].map(([reason, t]) => ({ reason, ...t })).sort((a, b) => b.cost - a.cost);
}
