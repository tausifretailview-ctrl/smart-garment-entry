/**
 * Loyalty points change in one database step (apply_customer_points, migration
 * 20270605120000).
 *
 * The browser used to read the customer's balance and write balance + change. Two counters
 * billing the same customer at once both read the same balance and the second write lost
 * the first one's points. The database function locks the customer, changes the balance it
 * holds and writes the history row in one go; the same bill never earns or redeems twice.
 *
 * While the SQL has not been run, the old steps are used (same result as before).
 */
type DbError = { code?: string; message?: string } | null;

export type PointsKind = "earned" | "redeemed";

export type ApplyPointsArgs = {
  organizationId: string;
  customerId: string;
  kind: PointsKind;
  /** Positive; the kind gives the sign. */
  points: number;
  saleId?: string | null;
  invoiceAmount?: number | null;
  description?: string | null;
  userId?: string | null;
};

export type ApplyPointsResult = {
  mode: "one-step" | "steps";
  applied: number;
  /** This bill already had this change: nothing was written. */
  duplicate: boolean;
};

export function isMissingApplyPointsRpc(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const msg = String(err.message || "");
  return /apply_customer_points/i.test(msg) && /schema cache|does not exist|not find/i.test(msg);
}

type Query = PromiseLike<{ data: unknown; error: DbError }>;
export type PointsDb = {
  rpc: (fn: string, args: Record<string, unknown>) => Query;
  from: (table: string) => {
    select: (cols: string) => { eq: (k: string, v: string) => { single: () => Query } };
    update: (patch: Record<string, unknown>) => { eq: (k: string, v: string) => PromiseLike<{ error: DbError }> };
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: DbError }>;
  };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function applyCustomerPoints(db: PointsDb, args: ApplyPointsArgs): Promise<ApplyPointsResult> {
  const points = Math.abs(num(args.points));
  if (points <= 0) return { mode: "one-step", applied: 0, duplicate: false };

  const { data, error } = await db.rpc("apply_customer_points", {
    p_organization_id: args.organizationId,
    p_customer_id: args.customerId,
    p_kind: args.kind,
    p_points: points,
    p_sale_id: args.saleId ?? null,
    p_invoice_amount: args.invoiceAmount ?? null,
    p_description: args.description ?? null,
  });
  if (!error) {
    const row = (data ?? {}) as { applied?: unknown; duplicate?: unknown };
    return { mode: "one-step", applied: num(row.applied), duplicate: row.duplicate === true };
  }
  if (!isMissingApplyPointsRpc(error)) throw error;

  // SQL not run yet: the old steps.
  const { error: historyError } = await db.from("customer_points_history").insert({
    organization_id: args.organizationId,
    customer_id: args.customerId,
    sale_id: args.saleId ?? null,
    transaction_type: args.kind,
    points: args.kind === "earned" ? points : -points,
    invoice_amount: args.invoiceAmount ?? null,
    description: args.description ?? null,
    created_by: args.userId ?? null,
  });
  if (historyError) throw historyError;

  const { data: customer, error: readError } = await db
    .from("customers")
    .select("points_balance, total_points_earned, points_redeemed")
    .eq("id", args.customerId)
    .single();
  if (readError) throw readError;
  const c = (customer ?? {}) as Record<string, unknown>;
  const patch =
    args.kind === "earned"
      ? { points_balance: num(c.points_balance) + points, total_points_earned: num(c.total_points_earned) + points }
      : { points_balance: Math.max(0, num(c.points_balance) - points), points_redeemed: num(c.points_redeemed) + points };
  const { error: updateError } = await db.from("customers").update(patch).eq("id", args.customerId);
  if (updateError) throw updateError;
  return { mode: "steps", applied: points, duplicate: false };
}
