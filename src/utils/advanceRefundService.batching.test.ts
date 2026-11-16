import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAdvanceRefundsForAdvances } from "./advanceRefundService";
import { fetchFreshSupplierBillsPending } from "./supplierOverpaymentGuard";

type Row = Record<string, unknown>;

/** Minimal PostgREST-like fake: records `.in()` sizes, serves `.range()` pages from `rows`. */
function fakeClient(rows: Row[], opts: { failSelectContaining?: string } = {}) {
  const inSizes: number[] = [];
  const selects: string[] = [];
  const client = {
    from() {
      let ids: string[] = [];
      let col = "id";
      let select = "";
      const q: Record<string, unknown> = {};
      q.select = (s: string) => {
        select = s;
        selects.push(s);
        return q;
      };
      for (const m of ["eq", "is", "gte", "lte", "order"]) q[m] = () => q;
      q.in = (c: string, v: string[]) => {
        col = c;
        ids = v;
        inSizes.push(v.length);
        return q;
      };
      q.range = (a: number, b: number) => {
        if (opts.failSelectContaining && select.includes(opts.failSelectContaining)) {
          return Promise.resolve({ data: null, error: { code: "42703", message: `column ${opts.failSelectContaining} does not exist` } });
        }
        const hit = rows.filter((r) => ids.includes(String(r[col])));
        return Promise.resolve({ data: hit.slice(a, b + 1), error: null });
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, inSizes, selects };
}

describe("advance refunds for many advances", () => {
  it("reads 200 advances per request and returns every refund in date order", async () => {
    const advanceIds = Array.from({ length: 450 }, (_, i) => `a${i}`);
    const rows = advanceIds.map((id, i) => ({
      id: `r${i}`,
      advance_id: id,
      refund_amount: 10,
      refund_date: `2026-0${(i % 9) + 1}-01`,
    }));
    const { client, inSizes } = fakeClient(rows);

    const refunds = await fetchAdvanceRefundsForAdvances(client, "org-1", advanceIds);

    expect(refunds).toHaveLength(450);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(200);
    const dates = refunds.map((r) => String(r.refund_date));
    expect(dates).toEqual([...dates].sort());
  });

  it("falls back to the older columns when refund_number is missing", async () => {
    const { client, selects } = fakeClient(
      [{ id: "r1", advance_id: "a1", refund_amount: 5, refund_date: "2026-01-01" }],
      { failSelectContaining: "refund_number" },
    );
    const refunds = await fetchAdvanceRefundsForAdvances(client, "org-1", ["a1"]);
    expect(refunds).toHaveLength(1);
    expect(selects.some((s) => !s.includes("refund_number"))).toBe(true);
  });
});

describe("supplier overpayment guard with many selected bills", () => {
  it("sums pending on every selected bill, 200 per request", async () => {
    const billIds = Array.from({ length: 350 }, (_, i) => `b${i}`);
    const rows = billIds.map((id) => ({ id, supplier_id: "s1", net_amount: 100, paid_amount: 40, is_cancelled: false }));
    const { client, inSizes } = fakeClient(rows);

    const pending = await fetchFreshSupplierBillsPending(client, "org-1", "s1", billIds);

    expect(pending).toBe(350 * 60);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(200);
  });
});
