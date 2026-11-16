import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAvailableCN } from "./saleSettlement";

describe("getAvailableCN with many credit notes", () => {
  it("reads live credit note balances 200 ids per request and counts every return", async () => {
    const returns = Array.from({ length: 300 }, (_, i) => ({
      id: `sr${i}`,
      net_amount: 100,
      credit_available_balance: 100,
      credit_status: "pending",
      return_number: `SR/${i}`,
      linked_sale_id: null,
      return_date: "2026-11-01",
      refund_type: "credit_note",
      credit_note_id: `cn${i}`,
    }));
    const notes = returns.map((r) => ({ id: r.credit_note_id, credit_amount: 100, used_amount: 25 }));
    const inSizes: number[] = [];

    const client = {
      from(table: string) {
        let ids: string[] | null = null;
        const q: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "neq", "order"]) q[m] = () => q;
        q.in = (col: string, v: string[]) => {
          if (col === "id") {
            ids = v;
            inSizes.push(v.length);
          }
          return q;
        };
        q.range = (a: number, b: number) =>
          Promise.resolve({ data: notes.filter((n) => ids!.includes(n.id)).slice(a, b + 1), error: null });
        q.then = (resolve: (v: unknown) => void) =>
          resolve({ data: table === "sale_returns" ? returns : [], error: null });
        return q;
      },
    } as unknown as SupabaseClient;

    const result = await getAvailableCN(client, "cust-1", "org-1");

    expect(result.returns).toHaveLength(300);
    expect(result.total).toBeCloseTo(300 * 75);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(200);
  });
});
