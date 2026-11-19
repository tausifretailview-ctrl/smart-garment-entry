import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stockCeilingMax, validateStockCeiling } from "./stockCeilingValidation";

type Filters = Record<string, unknown>;
type Rows = Record<string, unknown>[];

/** Tiny fake of the query builder: each table answers from `data(filters)`. */
function fakeClient(data: Record<string, (f: Filters) => Rows | Record<string, unknown>>): SupabaseClient {
  const from = (table: string) => {
    const filters: Filters = {};
    const q: Record<string, unknown> = {};
    const chain = (fn: (col: string, v: unknown) => void) => (col: string, v: unknown) => {
      fn(col, v);
      return q;
    };
    Object.assign(q, {
      select: () => q,
      eq: chain((c, v) => (filters[c] = v)),
      in: chain((c, v) => (filters[`${c}:in`] = v)),
      is: chain((c, v) => (filters[`${c}:is`] = v)),
      single: async () => ({ data: data[table](filters), error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: data[table](filters), error: null }),
    });
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const variantRow = (stock: number, opening = 0) => () => ({ stock_qty: stock, opening_qty: opening, products: { product_type: "goods" } });

describe("stock ceiling counts stock transfers", () => {
  it("formula: opening + purchased − purchase-returned + transfers in − transfers out", () => {
    expect(stockCeilingMax({ opening: 2, purchased: 10, purchaseReturned: 1 })).toBe(11);
    expect(stockCeilingMax({ opening: 0, purchased: 0, purchaseReturned: 0, transferredIn: 5 })).toBe(5);
    expect(stockCeilingMax({ opening: 0, purchased: 10, purchaseReturned: 0, transferredOut: 7 })).toBe(3);
  });

  it("allows a sale return of an item that arrived by stock transfer (user report)", async () => {
    // Receiving shop: 5 received, 2 sold → stock 3; never purchased here.
    const client = fakeClient({
      product_variants: variantRow(3),
      purchase_items: () => [],
      purchase_return_items: () => [],
      stock_transfer_items: (f) => {
        expect(f["stock_transfers.status"] ?? f["stock_transfers.status:in"]).toBeTruthy();
        return f.to_variant_id ? [{ qty: 5 }] : [];
      },
    });
    expect((await validateStockCeiling(client, "v-dest", 2, "Sale Return")).valid).toBe(true);
    const over = await validateStockCeiling(client, "v-dest", 3, "Sale Return");
    expect(over.valid).toBe(false);
    expect(over.maxAllowed).toBe(5);
    expect(over.reason).toContain("Transfer in: 5");
  });

  it("counts only accepted transfers in, and pending/accepted transfers out", async () => {
    const seen: Filters[] = [];
    const client = fakeClient({
      product_variants: variantRow(2),
      purchase_items: () => [{ qty: 10 }],
      purchase_return_items: () => [],
      stock_transfer_items: (f) => {
        seen.push({ ...f });
        return f.from_variant_id ? [{ qty: 5 }, { qty: 2 }] : [];
      },
    });
    // Sending shop: 10 bought, 7 sent → ceiling 3; stock 2 + 1 fits, + 2 does not.
    expect((await validateStockCeiling(client, "v-src", 1, "Sale Return")).valid).toBe(true);
    expect((await validateStockCeiling(client, "v-src", 2, "Sale Return")).valid).toBe(false);
    expect(seen.find((f) => f.to_variant_id)?.["stock_transfers.status"]).toBe("accepted");
    expect(seen.find((f) => f.from_variant_id)?.["stock_transfers.status:in"]).toEqual(["pending", "accepted"]);
  });
});
