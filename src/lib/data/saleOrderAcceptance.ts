/**
 * Sale order acceptance (Nov 2026): Accepted / Hold / Rejected from the Sale Order dashboard
 * (sale_orders.acceptance_status, migration 20270612120000). customer_accepted stays in step
 * (true only when Accepted); before the SQL is run only Accept can be saved.
 */
export type SaleOrderAcceptance = "accepted" | "hold" | "rejected";

export const SALE_ORDER_ACCEPTANCE_OPTIONS: ReadonlyArray<{ value: SaleOrderAcceptance; label: string }> = [
  { value: "accepted", label: "Accept" },
  { value: "hold", label: "Hold" },
  { value: "rejected", label: "Reject" },
];

/** What the row shows: the saved status, else Accepted for orders accepted the old way. */
export function readSaleOrderAcceptance(row: { acceptance_status?: unknown; customer_accepted?: unknown }): SaleOrderAcceptance | null {
  const v = row.acceptance_status;
  if (v === "accepted" || v === "hold" || v === "rejected") return v;
  return row.customer_accepted === true ? "accepted" : null;
}

export function saleOrderAcceptanceLabel(v: SaleOrderAcceptance): string {
  return v === "accepted" ? "Accepted" : v === "hold" ? "On hold" : "Rejected";
}

type DbError = { code?: string; message?: string } | null;

export function isMissingAcceptanceColumn(err: DbError): boolean {
  if (!err) return false;
  return /acceptance_status/i.test(String(err.message || "")) || err.code === "42703" || err.code === "PGRST204";
}

export type SaleOrderAcceptanceDb = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (col: string, v: string) => { eq: (col: string, v: string) => PromiseLike<{ error: DbError }> };
    };
  };
};

/** Saves the choice. Before SQL 75 an Accept still saves (old flag); Hold / Reject ask for the SQL. */
export async function setSaleOrderAcceptance(
  db: SaleOrderAcceptanceDb,
  orgId: string,
  orderId: string,
  value: SaleOrderAcceptance,
): Promise<void> {
  const { error } = await db
    .from("sale_orders")
    .update({ acceptance_status: value, customer_accepted: value === "accepted" })
    .eq("id", orderId)
    .eq("organization_id", orgId);
  if (!error) return;
  if (!isMissingAcceptanceColumn(error)) throw new Error(error.message || "Not saved");
  if (value !== "accepted") throw new Error("Run SQL 75 (sale order Hold / Reject) in the database first.");
  const retry = await db.from("sale_orders").update({ customer_accepted: true }).eq("id", orderId).eq("organization_id", orgId);
  if (retry.error) throw new Error(retry.error.message || "Not saved");
}
