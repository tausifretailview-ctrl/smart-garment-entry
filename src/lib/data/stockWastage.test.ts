import { describe, expect, it } from "vitest";
import { isMissingWastageSchema, recordStockWastage, wastageTotalsByReason, type WastageDb, type WastageRow } from "./stockWastage";

/** Wastage / damage entry (supermarket phase 2, Nov 2026). */
const row = (p: Partial<WastageRow>): WastageRow => ({
  id: "x", doc_number: "WST-1", variant_id: "v", quantity: 1, reason: "breakage", unit_cost: 10, cost_value: 10,
  notes: null, wasted_on: "2026-11-28", created_at: "", reversed_at: null, ...p,
});

describe("wastage report", () => {
  it("totals by reason, largest cost first; reversed lines left out", () => {
    expect(
      wastageTotalsByReason([
        row({ reason: "breakage", quantity: 2, cost_value: 360 }),
        row({ reason: "expired", quantity: 1.5, cost_value: 78.75 }),
        row({ reason: "breakage", quantity: 1, cost_value: 180 }),
        row({ reason: "theft", quantity: 9, cost_value: 900, reversed_at: "2026-11-28T10:00:00Z" }),
      ]),
    ).toEqual([
      { reason: "breakage", quantity: 3, cost: 540, lines: 2 },
      { reason: "expired", quantity: 1.5, cost: 78.75, lines: 1 },
    ]);
  });
});

describe("saving wastage", () => {
  const db = (result: { data: unknown; error: { code?: string; message?: string } | null }, calls: unknown[] = []) =>
    ({ rpc: (_f: string, args: unknown) => (calls.push(args), Promise.resolve(result)) }) as unknown as WastageDb;

  it("sends the lines with quantity > 0 in one call", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const res = await recordStockWastage(
      db({ data: { doc_number: "WST-20261128-114355", total_qty: 3.5, total_cost: 438.75 }, error: null }, calls),
      "org",
      [
        { variantId: "a", quantity: 2, reason: "breakage" },
        { variantId: "b", quantity: 1.5, reason: "expired", notes: " batch B7 " },
        { variantId: "c", quantity: 0, reason: "other" },
      ],
      "shelf check",
    );
    expect(res).toEqual({ docNumber: "WST-20261128-114355", totalQty: 3.5, totalCost: 438.75 });
    expect(calls[0]).toMatchObject({
      p_organization_id: "org",
      p_notes: "shelf check",
      p_lines: [
        { variant_id: "a", quantity: 2, reason: "breakage", notes: null },
        { variant_id: "b", quantity: 1.5, reason: "expired", notes: "batch B7" },
      ],
    });
  });

  it("nothing to save, missing SQL and short stock explain themselves", async () => {
    await expect(recordStockWastage(db({ data: null, error: null }), "o", [])).rejects.toThrow("at least one");
    await expect(recordStockWastage(db({ data: null, error: { code: "PGRST202", message: "x" } }), "o", [{ variantId: "a", quantity: 1, reason: "other" }])).rejects.toThrow("SQL 72");
    await expect(recordStockWastage(db({ data: null, error: { message: "Insufficient stock" } }), "o", [{ variantId: "a", quantity: 1, reason: "other" }])).rejects.toThrow("Not enough stock");
    expect(isMissingWastageSchema({ code: "42P01" })).toBe(true);
  });
});
