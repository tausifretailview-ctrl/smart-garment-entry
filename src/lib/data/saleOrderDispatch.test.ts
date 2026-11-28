import { describe, expect, it } from "vitest";
import {
  dispatchStatusLabel,
  fetchDispatchOrders,
  markDelivered,
  matchEmployee,
  startDispatch,
  undoDispatchStep,
  type DispatchDb,
} from "./saleOrderDispatch";

function fakeDb(opts: { rows?: Record<string, unknown>[]; error?: { code?: string; message?: string } | null } = {}) {
  const filters: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const chain = {
    eq: (c: string, v: unknown) => (filters.push(`eq ${c}=${String(v)}`), chain),
    neq: (c: string, v: unknown) => (filters.push(`neq ${c}=${String(v)}`), chain),
    is: (c: string) => (filters.push(`is ${c}`), chain),
    order: () => chain,
    limit: () => Promise.resolve({ data: opts.rows ?? [], error: opts.error ?? null }),
  };
  const db = {
    from: () => ({
      select: () => chain,
      update: (v: Record<string, unknown>) => {
        updates.push(v);
        return { eq: () => ({ eq: () => Promise.resolve({ error: opts.error ?? null }) }) };
      },
    }),
  } as unknown as DispatchDb;
  return { db, filters, updates };
}

describe("dispatch", () => {
  it("lists accepted, not cancelled orders for the tab, with total quantity", async () => {
    const { db, filters } = fakeDb({
      rows: [{ id: "so1", order_number: "SO/1", net_amount: "500", dispatch_status: null, sale_order_items: [{ order_qty: 4 }, { order_qty: "2" }] }],
    });
    const rows = await fetchDispatchOrders(db, "o1", "pending");
    expect(filters).toEqual([
      "eq organization_id=o1",
      "is deleted_at",
      "eq customer_accepted=true",
      "neq status=cancelled",
      "eq dispatch_status=pending",
    ]);
    expect(rows?.[0]).toMatchObject({ id: "so1", net_amount: 500, dispatch_status: "pending", total_qty: 6 });
  });

  it("null before SQL 76; saving asks for it", async () => {
    const missing = { code: "42703", message: "column sale_orders.dispatch_status does not exist" };
    expect(await fetchDispatchOrders(fakeDb({ error: missing }).db, "o1", "all")).toBeNull();
    await expect(markDelivered(fakeDb({ error: missing }).db, "o1", "so1")).rejects.toThrow(/SQL 76/);
  });

  it("start needs a staff name; delivered and undo write the right fields", async () => {
    const { db, updates } = fakeDb();
    await expect(startDispatch(db, "o1", "so1", { name: "  " })).rejects.toThrow(/staff/);
    const now = new Date("2026-11-28T10:00:00Z");
    await startDispatch(db, "o1", "so1", { name: " RAMESH ", employeeId: "e1" }, now);
    await markDelivered(db, "o1", "so1", now);
    await undoDispatchStep(db, "o1", "so1", "delivered");
    await undoDispatchStep(db, "o1", "so1", "in_process");
    expect(updates).toEqual([
      { dispatch_status: "in_process", dispatch_staff: "RAMESH", dispatch_staff_id: "e1", dispatch_started_at: now.toISOString(), delivered_at: null },
      { dispatch_status: "delivered", delivered_at: now.toISOString() },
      { dispatch_status: "in_process", delivered_at: null },
      { dispatch_status: "pending", dispatch_staff: null, dispatch_staff_id: null, dispatch_started_at: null },
    ]);
  });

  it("labels and employee match", () => {
    expect(dispatchStatusLabel("in_process")).toBe("Dispatching");
    expect(dispatchStatusLabel(null)).toBe("Pending");
    expect(matchEmployee([{ id: "e1", employee_name: "Ramesh" }], " RAMESH ")?.id).toBe("e1");
    expect(matchEmployee([{ id: "e1", employee_name: "Ramesh" }], "Raj")).toBeNull();
  });
});
