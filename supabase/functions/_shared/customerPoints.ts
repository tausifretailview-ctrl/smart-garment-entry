/**
 * Loyalty points added from an edge function (JOIN welcome points, birthday bonus) without
 * losing a change made at the same moment (a POS bill saving the same customer's points).
 * PostgREST has no "balance = balance + n", so this is a compare-and-set on the balance it
 * read, retried when another write got in first.
 */

type Db = { from: (table: string) => any };

/** Adds points and returns the new balance, or null when the customer is missing or every try lost the race. */
export async function addCustomerPoints(db: Db, customerId: string, points: number, attempts = 4): Promise<number | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { data: c, error } = await db.from("customers").select("points_balance").eq("id", customerId).maybeSingle();
    if (error || !c) return null;
    const after = Number(c.points_balance || 0) + points;
    let update = db.from("customers").update({ points_balance: after }).eq("id", customerId);
    update = c.points_balance == null ? update.is("points_balance", null) : update.eq("points_balance", c.points_balance);
    const { data: rows, error: updateError } = await update.select("points_balance");
    if (updateError) return null;
    if ((rows ?? []).length === 1) return after;
  }
  return null;
}
