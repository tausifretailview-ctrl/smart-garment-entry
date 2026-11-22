import { supabase } from "@/integrations/supabase/client";

/**
 * Change an item's stock from Stock Adjustment or the closing-stock import (review item D6).
 *
 * Stock Adjustment used to write "the stock the screen had loaded + the user's change". A bill
 * saved while the screen was open was overwritten: its stock reduction was lost. Now the
 * change is applied in the database to the stock as it is at that moment, together with its
 * movement row (adjust_variant_stock, migration 20270515120000).
 *
 * - `delta`: add this to stock and to opening (Stock Adjustment; opening moves with stock).
 * - `setTo`: stock and opening become this figure (closing-stock import); the movement
 *   records the real difference.
 *
 * While the SQL has not been run, the old two writes are used, but on the stock read just
 * before them instead of the figure loaded when the screen opened.
 */
export type StockAdjustResult = {
  mode: "one-step" | "steps";
  stockBefore: number;
  stockAfter: number;
  /** Real change in stock (0 = nothing was written to the movement log). */
  change: number;
};

type DbError = { code?: string; message?: string } | null;

export function isMissingAdjustStockRpc(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const msg = String(err.message || "");
  return /adjust_variant_stock/i.test(msg) && /schema cache|does not exist|not find/i.test(msg);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const tidy = (n: number): string => String(Math.round(n * 1000) / 1000);

export function stockAdjustmentNote(
  label: string | undefined,
  v: { stockBefore: number; stockAfter: number; openingBefore: number; openingAfter: number },
): string {
  return `${label?.trim() || "Stock Adjustment"}: stock ${tidy(v.stockBefore)} → ${tidy(v.stockAfter)}, opening ${tidy(v.openingBefore)} → ${tidy(v.openingAfter)}`;
}

type LooseDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
  from: (table: string) => {
    select: (cols: string) => {
      eq: (k: string, v: string) => {
        eq: (k: string, v: string) => { single: () => PromiseLike<{ data: Record<string, unknown> | null; error: DbError }> };
      };
    };
    update: (patch: Record<string, unknown>) => {
      eq: (k: string, v: string) => { eq: (k: string, v: string) => PromiseLike<{ error: DbError }> };
    };
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: DbError }>;
  };
};

export async function adjustVariantStock(opts: {
  organizationId: string;
  variantId: string;
  /** Exactly one of `delta` / `setTo`. */
  delta?: number;
  setTo?: number;
  /** Start of the movement note, e.g. "Closing stock import". */
  notes?: string;
  billNumber?: string;
  userId?: string | null;
}): Promise<StockAdjustResult> {
  const { organizationId, variantId, delta, setTo, notes, billNumber, userId } = opts;
  if ((delta === undefined) === (setTo === undefined)) {
    throw new Error("adjustVariantStock needs either a change or a new stock figure");
  }
  const db = supabase as unknown as LooseDb;

  const { data, error } = await db.rpc("adjust_variant_stock", {
    p_organization_id: organizationId,
    p_variant_id: variantId,
    p_delta: delta ?? null,
    p_set_to: setTo ?? null,
    p_notes: notes ?? null,
    p_bill_number: billNumber ?? null,
  });
  if (!error) {
    const r = (data ?? null) as Record<string, unknown> | null;
    if (!r || r.success !== true) throw new Error("The stock change was not saved. Please try again.");
    return { mode: "one-step", stockBefore: num(r.stock_before), stockAfter: num(r.stock_after), change: num(r.change) };
  }
  if (!isMissingAdjustStockRpc(error)) throw error;

  // SQL not run yet: the old writes, from the stock as it is now (not as the screen loaded it).
  const { data: row, error: readErr } = await db
    .from("product_variants")
    .select("stock_qty, opening_qty")
    .eq("id", variantId)
    .eq("organization_id", organizationId)
    .single();
  if (readErr) throw readErr;
  if (!row) throw new Error("Item not found");
  const stockBefore = num(row.stock_qty);
  const openingBefore = num(row.opening_qty);
  const stockAfter = setTo !== undefined ? setTo : stockBefore + (delta as number);
  const openingAfter = setTo !== undefined ? setTo : openingBefore + (delta as number);
  const change = stockAfter - stockBefore;

  const { error: updateErr } = await db
    .from("product_variants")
    .update({ stock_qty: stockAfter, opening_qty: openingAfter, updated_at: new Date().toISOString() })
    .eq("id", variantId)
    .eq("organization_id", organizationId);
  if (updateErr) throw updateErr;

  if (change !== 0) {
    const { error: movementErr } = await db.from("stock_movements").insert({
      variant_id: variantId,
      organization_id: organizationId,
      movement_type: "reconciliation",
      quantity: change,
      notes: stockAdjustmentNote(notes, { stockBefore, stockAfter, openingBefore, openingAfter }),
      user_id: userId ?? null,
      ...(billNumber ? { bill_number: billNumber } : {}),
    });
    if (movementErr) {
      throw new Error(`Stock was changed but its movement entry failed (qty ${tidy(change)}): ${movementErr.message || "unknown error"}`);
    }
  }
  return { mode: "steps", stockBefore, stockAfter, change };
}
