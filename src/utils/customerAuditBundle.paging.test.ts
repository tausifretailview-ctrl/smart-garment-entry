import { describe, expect, it } from "vitest";
import { fetchCustomerAuditBundle } from "@/utils/customerAuditBundle";

/**
 * A fake Supabase client: eq / in filters on known columns, range() slices, at most 1,000 rows
 * per answer (like the real server), and a URL-length check on `.in()` lists.
 */
function fakeClient(tables: Record<string, Array<Record<string, unknown>>>) {
  const stats = { maxInList: 0 };
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let range: [number, number] | null = null;
    const b: Record<string, unknown> = {};
    for (const m of ["select", "is", "or", "not", "order", "neq", "gte", "lte"]) b[m] = () => b;
    b.eq = (col: string, val: unknown) => (filters.push((r) => !(col in r) || r[col] === val), b);
    b.in = (col: string, vals: unknown[]) => {
      stats.maxInList = Math.max(stats.maxInList, vals.length);
      if (vals.length > 400) throw new Error("URL too long");
      filters.push((r) => !(col in r) || vals.includes(r[col]));
      return b;
    };
    b.range = (f: number, t: number) => ((range = [f, t]), b);
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((fn) => fn(r)));
    b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    b.then = (resolve: (v: unknown) => void) => {
      const all = rows();
      const page = range ? all.slice(range[0], range[1] + 1) : all;
      resolve({ data: page.slice(0, 1000), error: null });
    };
    return b;
  };
  return { client: { from } as never, stats };
}

describe("fetchCustomerAuditBundle on a long-standing customer", () => {
  it("keeps every bill and every bill line (no 1,000-row cut, no over-long id list)", async () => {
    const sales = Array.from({ length: 1500 }, (_, i) => ({
      id: `s${String(i).padStart(5, "0")}`,
      customer_id: "c1",
      organization_id: "org-1",
      net_amount: 100,
    }));
    // 2,500 lines: every bill has one line of mrp 100; the first 1,000 bills have a second.
    const saleItems = [
      ...sales.map((s, i) => ({ id: `i${i}`, sale_id: s.id, quantity: 1, mrp: 100 })),
      ...sales.slice(0, 1000).map((s, i) => ({ id: `j${i}`, sale_id: s.id, quantity: 1, mrp: 50 })),
    ];
    const { client, stats } = fakeClient({
      customers: [{ id: "c1", organization_id: "org-1", customer_name: "RAVI", opening_balance: 0 }],
      sales,
      sale_items: saleItems,
    });

    const bundle = await fetchCustomerAuditBundle(client, "org-1", "c1");

    expect(bundle.allSales).toHaveLength(1500);
    const gross = bundle.allSales.reduce((sum, s) => sum + Number(s.items_gross), 0);
    expect(gross).toBe(1500 * 100 + 1000 * 50);
    expect(stats.maxInList).toBeLessThanOrEqual(200);
  });
});
