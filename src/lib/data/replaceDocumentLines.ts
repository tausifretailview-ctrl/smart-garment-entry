import { supabase } from "@/integrations/supabase/client";

/**
 * Replace all lines of a document (challan, sale order, quotation, purchase order) when it is
 * edited and saved (Plan Phase 4, R6).
 *
 * These screens deleted the old lines without checking, then inserted the new ones:
 * - a failed delete left the old lines in place, so the insert doubled every quantity;
 * - a failed insert (network, a database rule) left the document with no lines at all,
 *   while the screen still said it was saved.
 * Now: read the old lines, delete (checked), insert (checked); if the insert fails, the old
 * lines are put back and the error is thrown so the screen shows "save failed".
 */
export type DocumentLineTable =
  | "delivery_challan_items"
  | "sale_order_items"
  | "quotation_items"
  | "purchase_order_items";

export async function replaceDocumentLines(opts: {
  table: DocumentLineTable;
  parentColumn: string;
  parentId: string;
  rows: Record<string, unknown>[];
}): Promise<void> {
  const { table, parentColumn, parentId, rows } = opts;
  // Loose client: the four tables share this flow but have different row types.
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> };
      delete: () => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
      insert: (r: Record<string, unknown>[]) => Promise<{ error: unknown }>;
    };
  };

  const { data: previous, error: readErr } = await db.from(table).select("*").eq(parentColumn, parentId);
  if (readErr) throw readErr;

  const { error: deleteErr } = await db.from(table).delete().eq(parentColumn, parentId);
  if (deleteErr) throw deleteErr;

  if (rows.length === 0) return;
  const { error: insertErr } = await db.from(table).insert(rows);
  if (insertErr) {
    if (previous && previous.length > 0) {
      const { error: restoreErr } = await db.from(table).insert(previous);
      if (restoreErr) console.error(`Could not restore ${table} after a failed save:`, restoreErr);
    }
    throw insertErr;
  }
}
