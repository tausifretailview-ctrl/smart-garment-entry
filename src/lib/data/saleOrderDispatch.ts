/**
 * Dispatch of accepted sale orders (Nov 2026, migration 20270613120000): Sales → Dispatch.
 * pending → in_process (Start, with the staff who dispatches) → delivered.
 */
export type DispatchStatus = "pending" | "in_process" | "delivered";

export const DISPATCH_TABS: ReadonlyArray<{ value: DispatchStatus | "all"; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "in_process", label: "Dispatching" },
  { value: "delivered", label: "Delivered" },
  { value: "all", label: "All" },
];

export function dispatchStatusLabel(s: string | null | undefined): string {
  return s === "in_process" ? "Dispatching" : s === "delivered" ? "Delivered" : "Pending";
}

export type DispatchOrderRow = {
  id: string;
  order_number: string;
  order_date: string;
  customer_name: string;
  customer_phone: string | null;
  net_amount: number;
  status: string;
  salesman: string | null;
  dispatch_status: DispatchStatus;
  dispatch_staff: string | null;
  dispatch_started_at: string | null;
  delivered_at: string | null;
  total_qty: number;
};

type DbError = { code?: string; message?: string } | null;

/** Before SQL 76 the dispatch columns do not exist. */
export function isMissingDispatchColumns(err: DbError): boolean {
  if (!err) return false;
  return /dispatch_|delivered_at/i.test(String(err.message || "")) || err.code === "42703" || err.code === "PGRST204";
}

type Filterable<T> = {
  eq: (c: string, v: unknown) => Filterable<T>;
  neq: (c: string, v: unknown) => Filterable<T>;
  is: (c: string, v: null) => Filterable<T>;
  order: (c: string, o: { ascending: boolean }) => Filterable<T>;
  limit: (n: number) => PromiseLike<{ data: T[] | null; error: DbError }>;
};
type CountQuery = {
  eq: (c: string, v: unknown) => CountQuery;
  neq: (c: string, v: unknown) => CountQuery;
  is: (c: string, v: null) => PromiseLike<{ count: number | null; error: DbError }>;
};
export type DispatchDb = {
  from: (table: string) => {
    select: ((cols: string) => Filterable<Record<string, unknown>>) &
      ((cols: string, opts: { count: "exact"; head: true }) => CountQuery);
    update: (values: Record<string, unknown>) => {
      eq: (c: string, v: string) => { eq: (c: string, v: string) => PromiseLike<{ error: DbError }> };
    };
  };
};

const LIST_COLUMNS =
  "id, order_number, order_date, customer_name, customer_phone, net_amount, status, salesman, dispatch_status, dispatch_staff, dispatch_started_at, delivered_at, sale_order_items(order_qty)";

/** How many accepted orders the list shows at most per tab (newest first). */
export const DISPATCH_LIST_LIMIT = 300;

/** Accepted orders (not cancelled) for a tab; null before SQL 76. */
export async function fetchDispatchOrders(
  db: DispatchDb,
  orgId: string,
  tab: DispatchStatus | "all",
): Promise<DispatchOrderRow[] | null> {
  let q = (db.from("sale_orders").select as (c: string) => Filterable<Record<string, unknown>>)(LIST_COLUMNS)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("customer_accepted", true)
    .neq("status", "cancelled");
  if (tab !== "all") q = q.eq("dispatch_status", tab);
  const { data, error } = await q.order("order_date", { ascending: false }).limit(DISPATCH_LIST_LIMIT);
  if (error) {
    if (isMissingDispatchColumns(error)) return null;
    throw new Error(error.message || "Could not load dispatch list");
  }
  return (data ?? []).map((r) => {
    const items = (r.sale_order_items as Array<{ order_qty?: number | null }> | null) ?? [];
    const ds = r.dispatch_status;
    return {
      id: String(r.id),
      order_number: String(r.order_number ?? ""),
      order_date: String(r.order_date ?? ""),
      customer_name: String(r.customer_name ?? ""),
      customer_phone: (r.customer_phone as string | null) ?? null,
      net_amount: Number(r.net_amount) || 0,
      status: String(r.status ?? ""),
      salesman: (r.salesman as string | null) ?? null,
      dispatch_status: ds === "in_process" || ds === "delivered" ? ds : "pending",
      dispatch_staff: (r.dispatch_staff as string | null) ?? null,
      dispatch_started_at: (r.dispatch_started_at as string | null) ?? null,
      delivered_at: (r.delivered_at as string | null) ?? null,
      total_qty: items.reduce((s, i) => s + (Number(i.order_qty) || 0), 0),
    };
  });
}

/** Tab counts (accepted, not cancelled). */
export async function fetchDispatchCounts(db: DispatchDb, orgId: string): Promise<Record<DispatchStatus, number> | null> {
  const out: Record<DispatchStatus, number> = { pending: 0, in_process: 0, delivered: 0 };
  for (const s of ["pending", "in_process", "delivered"] as const) {
    const { count, error } = await (db.from("sale_orders").select as (c: string, o: { count: "exact"; head: true }) => CountQuery)(
      "id",
      { count: "exact", head: true },
    )
      .eq("organization_id", orgId)
      .eq("customer_accepted", true)
      .neq("status", "cancelled")
      .eq("dispatch_status", s)
      .is("deleted_at", null);
    if (error) {
      if (isMissingDispatchColumns(error)) return null;
      throw new Error(error.message || "Could not count orders");
    }
    out[s] = count ?? 0;
  }
  return out;
}

async function update(db: DispatchDb, orgId: string, orderId: string, values: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("sale_orders").update(values).eq("id", orderId).eq("organization_id", orgId);
  if (!error) return;
  if (isMissingDispatchColumns(error)) throw new Error("Run SQL 76 (dispatch) in the database first.");
  throw new Error(error.message || "Not saved");
}

/** Start: the staff who dispatches (name as typed or picked; employee id when picked from the list). */
export async function startDispatch(
  db: DispatchDb,
  orgId: string,
  orderId: string,
  staff: { name: string; employeeId?: string | null },
  now = new Date(),
): Promise<void> {
  const name = staff.name.trim();
  if (!name) throw new Error("Pick or type the staff name");
  await update(db, orgId, orderId, {
    dispatch_status: "in_process",
    dispatch_staff: name,
    dispatch_staff_id: staff.employeeId || null,
    dispatch_started_at: now.toISOString(),
    delivered_at: null,
  });
}

export async function markDelivered(db: DispatchDb, orgId: string, orderId: string, now = new Date()): Promise<void> {
  await update(db, orgId, orderId, { dispatch_status: "delivered", delivered_at: now.toISOString() });
}

/** Undo one step: Delivered → Dispatching (keeps the staff), Dispatching → Pending (clears it). */
export async function undoDispatchStep(db: DispatchDb, orgId: string, orderId: string, from: DispatchStatus): Promise<void> {
  if (from === "delivered") {
    await update(db, orgId, orderId, { dispatch_status: "in_process", delivered_at: null });
  } else if (from === "in_process") {
    await update(db, orgId, orderId, {
      dispatch_status: "pending",
      dispatch_staff: null,
      dispatch_staff_id: null,
      dispatch_started_at: null,
    });
  }
}

/** Employee picked by name (case-insensitive), for the staff id. */
export function matchEmployee<T extends { id: string; employee_name: string }>(list: readonly T[], name: string): T | null {
  const n = name.trim().toLowerCase();
  return list.find((e) => e.employee_name.trim().toLowerCase() === n) ?? null;
}
