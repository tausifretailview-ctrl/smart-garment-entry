import { supabase } from "@/integrations/supabase/client";

/**
 * Writes to a saved purchase bill's lines from Purchase Entry (Plan Phase 4, S4 + D6).
 * Every write is scoped to the bill and skips deleted lines; each returns the first error
 * message (or "") so the screen keeps its own "bill not updated" message.
 */

type LineClient = {
  from: (t: string) => {
    update: (v: Record<string, unknown>) => {
      in: (k: string, v: string[]) => { eq: (k: string, v: string) => { is: (k: string, v: null) => PromiseLike<{ error: { message: string } | null }> } };
      eq: (k: string, v: string) => { eq: (k: string, v: string) => { is: (k: string, v: null) => PromiseLike<{ error: { message: string } | null }> } };
    };
  };
};
const db = () => supabase as unknown as LineClient;

/** Same change on these lines of the bill (one request per 200 lines). */
export async function updatePurchaseLines(billId: string, lineIds: string[], patch: Record<string, unknown>): Promise<string> {
  for (let i = 0; i < lineIds.length; i += 200) {
    const { error } = await db()
      .from("purchase_items")
      .update(patch)
      .in("id", lineIds.slice(i, i + 200))
      .eq("bill_id", billId)
      .is("deleted_at", null);
    if (error) return error.message;
  }
  return "";
}

/** How many per-line writes run at once (was one after another). */
export const PER_LINE_WRITE_CONCURRENCY = 8;

/**
 * A different change per line (e.g. each line's own total after a price edit). Runs a few at a
 * time instead of one after another; stops starting new writes after the first error.
 */
export async function updatePurchaseLinesEach(
  billId: string,
  changes: Array<{ id: string; patch: Record<string, unknown> }>,
  concurrency = PER_LINE_WRITE_CONCURRENCY,
): Promise<string> {
  let firstError = "";
  for (let i = 0; i < changes.length && !firstError; i += concurrency) {
    const results = await Promise.all(
      changes.slice(i, i + concurrency).map(({ id, patch }) =>
        db().from("purchase_items").update(patch).eq("id", id).eq("bill_id", billId).is("deleted_at", null),
      ),
    );
    firstError = results.find((r) => r.error)?.error?.message ?? "";
  }
  return firstError;
}

/** Brand on lines, grouped by brand (brand -> line ids). */
export async function syncPurchaseLineBrands(billId: string, idsByBrand: Map<string, string[]>): Promise<string> {
  for (const [brand, ids] of idsByBrand) {
    const err = await updatePurchaseLines(billId, ids, { brand });
    if (err) return err;
  }
  return "";
}
