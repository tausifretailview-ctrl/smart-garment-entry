import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { op: string; arg?: unknown };
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  rpc: { data: null as unknown, error: null as unknown },
  row: { stock_qty: 9, opening_qty: 4 } as Record<string, unknown> | null,
  updateError: null as unknown,
  movementError: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: unknown) => (db.calls.push({ op: `rpc:${name}`, arg: args }), db.rpc),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ single: async () => (db.calls.push({ op: `read:${table}` }), { data: db.row, error: null }) }) }),
      }),
      update: (patch: unknown) => ({
        eq: () => ({ eq: async () => (db.calls.push({ op: `update:${table}`, arg: patch }), { error: db.updateError }) }),
      }),
      insert: async (row: unknown) => (db.calls.push({ op: `insert:${table}`, arg: row }), { error: db.movementError }),
    }),
  },
}));

import { adjustVariantStock, isMissingAdjustStockRpc, stockAdjustmentNote } from "@/lib/data/adjustVariantStock";

const missing = { code: "PGRST202", message: "Could not find the function public.adjust_variant_stock" };
const base = { organizationId: "org1", variantId: "v1" };
const ops = () => db.calls.map((c) => c.op);

beforeEach(() => {
  db.calls = [];
  db.rpc = { data: { success: true, stock_before: 9, stock_after: 11, opening_before: 4, opening_after: 6, change: 2 }, error: null };
  db.row = { stock_qty: 9, opening_qty: 4 };
  db.updateError = null;
  db.movementError = null;
});

/** Review item D6: a stock adjustment keeps the sales made while its screen was open. */
describe("adjustVariantStock", () => {
  it("sends the change, not a stock figure, and returns what the database applied", async () => {
    const r = await adjustVariantStock({ ...base, delta: 2, billNumber: "ADJ-1" });
    expect(ops()).toEqual(["rpc:adjust_variant_stock"]);
    expect(db.calls[0].arg).toEqual({
      p_organization_id: "org1",
      p_variant_id: "v1",
      p_delta: 2,
      p_set_to: null,
      p_notes: null,
      p_bill_number: "ADJ-1",
    });
    expect(r).toEqual({ mode: "one-step", stockBefore: 9, stockAfter: 11, change: 2 });
  });

  it("closing-stock import sends the counted figure", async () => {
    await adjustVariantStock({ ...base, setTo: 20, notes: "Closing stock import" });
    expect(db.calls[0].arg).toMatchObject({ p_delta: null, p_set_to: 20, p_notes: "Closing stock import" });
  });

  it("needs exactly one of change / new figure", async () => {
    await expect(adjustVariantStock({ ...base })).rejects.toThrow(/either/);
    await expect(adjustVariantStock({ ...base, delta: 1, setTo: 5 })).rejects.toThrow(/either/);
    expect(db.calls).toEqual([]);
  });

  it("a refused change (e.g. stock below zero) is thrown, nothing is written from the browser", async () => {
    db.rpc = { data: null, error: { code: "P0001", message: "Stock cannot go below zero" } };
    await expect(adjustVariantStock({ ...base, delta: -100 })).rejects.toMatchObject({ message: "Stock cannot go below zero" });
    expect(ops()).toEqual(["rpc:adjust_variant_stock"]);
  });

  it("SQL not run: the change is applied to the stock read just now (screen had 10, a sale left 9, +2 = 11)", async () => {
    db.rpc = { data: null, error: missing };
    const r = await adjustVariantStock({ ...base, delta: 2, billNumber: "ADJ-1", userId: "u1" });
    expect(ops()).toEqual(["rpc:adjust_variant_stock", "read:product_variants", "update:product_variants", "insert:stock_movements"]);
    expect(db.calls[2].arg).toMatchObject({ stock_qty: 11, opening_qty: 6 });
    expect(db.calls[3].arg).toEqual({
      variant_id: "v1",
      organization_id: "org1",
      movement_type: "reconciliation",
      quantity: 2,
      notes: "Stock Adjustment: stock 9 → 11, opening 4 → 6",
      user_id: "u1",
      bill_number: "ADJ-1",
    });
    expect(r).toEqual({ mode: "steps", stockBefore: 9, stockAfter: 11, change: 2 });
  });

  it("SQL not run, import: stock and opening become the counted figure, movement = real difference", async () => {
    db.rpc = { data: null, error: missing };
    db.row = { stock_qty: 9.5, opening_qty: 4.5 };
    const r = await adjustVariantStock({ ...base, setTo: 20, notes: "Closing stock import" });
    expect(db.calls[2].arg).toMatchObject({ stock_qty: 20, opening_qty: 20 });
    expect(db.calls[3].arg).toMatchObject({ quantity: 10.5, notes: "Closing stock import: stock 9.5 → 20, opening 4.5 → 20" });
    expect(r.change).toBe(10.5);
  });

  it("SQL not run: no movement row when the stock does not change; a failed movement is reported", async () => {
    db.rpc = { data: null, error: missing };
    await adjustVariantStock({ ...base, setTo: 9 });
    expect(ops()).toEqual(["rpc:adjust_variant_stock", "read:product_variants", "update:product_variants"]);

    db.calls = [];
    db.movementError = { message: "denied" };
    await expect(adjustVariantStock({ ...base, delta: 1 })).rejects.toThrow(/movement entry failed.*denied/);
  });

  it("helpers", () => {
    expect(isMissingAdjustStockRpc(missing)).toBe(true);
    expect(isMissingAdjustStockRpc({ code: "42883", message: "x" })).toBe(true);
    expect(isMissingAdjustStockRpc({ code: "P0002", message: "Item not found" })).toBe(false);
    expect(isMissingAdjustStockRpc(null)).toBe(false);
    expect(stockAdjustmentNote(undefined, { stockBefore: 1, stockAfter: 2.5, openingBefore: 0, openingAfter: 1.5 })).toBe(
      "Stock Adjustment: stock 1 → 2.5, opening 0 → 1.5",
    );
  });
});
