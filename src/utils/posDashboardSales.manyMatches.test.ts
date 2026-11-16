import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchPosDashboardExportRows,
  fetchPosDashboardPage,
  POS_SEARCH_MAX_IN_IDS,
  type PosDashboardFilters,
} from "./posDashboardSales";

/** 300 bills match "1" on the header; the page must still load (no 300-id URL). */
function salesRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    sale_number: `POS/26-27/${i + 1}`,
    // Two bills per day so the id tie-break matters.
    sale_date: `2026-${String((Math.floor(i / 2) % 12) + 1).padStart(2, "0")}-${String((Math.floor(i / 24) % 28) + 1).padStart(2, "0")}T10:00:00Z`,
    customer_id: null,
    net_amount: 100,
    paid_amount: 100,
    payment_status: "completed",
    is_cancelled: false,
  }));
}

function fakeClient(rows: ReturnType<typeof salesRows>) {
  const inSizes: number[] = [];
  const client = {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from(table: string) {
      let ids: string[] | null = null;
      let limit: number | null = null;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "or", "order", "gte", "lte", "gt", "neq", "not", "abortSignal"]) {
        q[m] = () => q;
      }
      q.in = (col: string, v: string[]) => {
        if (col === "id") {
          ids = v;
          inSizes.push(v.length);
        }
        return q;
      };
      q.limit = (n: number) => {
        limit = n;
        return q;
      };
      const pick = () => {
        if (table !== "sales") return [];
        const hit = ids ? rows.filter((r) => ids!.includes(r.id)) : rows;
        return limit ? hit.slice(0, limit) : hit;
      };
      q.range = (a: number, b: number) => Promise.resolve({ data: pick().slice(a, b + 1), error: null, count: null });
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({ data: pick(), error: null, count: pick().length }).then(resolve, reject);
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, inSizes };
}

const filters: PosDashboardFilters = {
  organizationId: "org-many",
  search: "1",
  startDate: "",
  endDate: "",
  paymentMethodFilter: "all",
  paymentStatusFilter: [],
  saleTypeFilter: "all",
  refundFilter: "all",
  creditNoteFilter: "all",
  userFilter: "all",
  cancelFilter: "all",
};

const tableOrder = (rows: ReturnType<typeof salesRows>) =>
  [...rows].sort((a, b) =>
    a.sale_date !== b.sale_date ? (a.sale_date < b.sale_date ? 1 : -1) : a.id < b.id ? 1 : -1,
  );

describe("POS dashboard search with many matching bills", () => {
  it("pages 300 matches without ever sending more than 150 ids, in table order", async () => {
    const rows = salesRows(300);
    const { client, inSizes } = fakeClient(rows);

    const page2 = await fetchPosDashboardPage(client, { ...filters, organizationId: "org-many-a" }, {
      page: 2,
      pageSize: 50,
      reconcile: false,
    });

    expect(page2.totalCount).toBe(300);
    expect(inSizes.length).toBeGreaterThan(0);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(POS_SEARCH_MAX_IN_IDS);
    const expectedIds = tableOrder(rows).slice(50, 100).map((r) => r.id);
    expect(new Set(page2.sales.map((s: { id: string }) => s.id))).toEqual(new Set(expectedIds));
  });

  it("exports every one of the 300 matches", async () => {
    const rows = salesRows(300);
    const { client, inSizes } = fakeClient(rows);

    const result = await fetchPosDashboardExportRows(client, { ...filters, organizationId: "org-many-b" });

    expect(result.sales).toHaveLength(300);
    expect(Math.max(...inSizes)).toBeLessThanOrEqual(POS_SEARCH_MAX_IN_IDS);
  });
});
