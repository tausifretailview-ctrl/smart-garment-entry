import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args), from: (...args: unknown[]) => from(...args) },
}));

import { fetchCustomerSegmentIndex } from "./customerSegments";

const today = new Date().toISOString().slice(0, 10);

function rpcRows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    customer_id: `c${String(offset + i).padStart(5, "0")}`,
    segment: i === 0 ? "vip" : "regular",
    order_count: 6,
    revenue: "1200.50",
    last_sale_date: today,
  }));
}

/** rpc(...).order(col).range(a, b) — answers page by page from `pages`. */
function rpcReturning(pages: Array<{ data: unknown[] | null; error: unknown }>) {
  const ranges: Array<[number, number]> = [];
  const orders: string[] = [];
  rpc.mockImplementation(() => ({
    order(col: string) {
      orders.push(col);
      return {
        range(a: number, b: number) {
          ranges.push([a, b]);
          return Promise.resolve(pages[ranges.length - 1] ?? { data: [], error: null });
        },
      };
    },
  }));
  return { ranges, orders };
}

describe("fetchCustomerSegmentIndex (Customer Master badges)", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it("reads the server index page by page past 1,000 customers and never downloads sales", async () => {
    const { ranges, orders } = rpcReturning([
      { data: rpcRows(1000), error: null },
      { data: rpcRows(5, 1000), error: null },
    ]);

    const index = await fetchCustomerSegmentIndex("org-1");

    expect(rpc).toHaveBeenCalledWith("get_customer_segment_index", { p_org_id: "org-1" });
    expect(orders).toEqual(["customer_id", "customer_id"]);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(index.counts.total).toBe(1005);
    expect(index.counts.vip).toBe(2);
    expect(index.segments.c00000).toBe("vip");
    expect(index.stats.c01004).toEqual({ orders: 6, revenue: 1200.5, lastSaleDate: today });
    expect(from).not.toHaveBeenCalled();
  });

  it("falls back to the browser count when the server index fails", async () => {
    rpcReturning([{ data: null, error: { message: "function missing" } }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const page = (data: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "not", "order"]) q[m] = () => q;
      q.range = () => Promise.resolve({ data, error: null });
      return q;
    };
    from.mockImplementation((table: string) =>
      table === "customers"
        ? page([{ id: "c1" }])
        : page([
            { customer_id: "c1", sale_date: today, net_amount: 100, payment_status: "paid", is_cancelled: false },
          ]),
    );

    const index = await fetchCustomerSegmentIndex("org-1");

    expect(from).toHaveBeenCalledWith("sales");
    expect(index.counts.total).toBe(1);
    expect(index.stats.c1).toEqual({ orders: 1, revenue: 100, lastSaleDate: today });
    errorSpy.mockRestore();
  });
});
