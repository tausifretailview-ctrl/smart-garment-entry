import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn() }));

import { runHistoricalAccountingBackfill } from "@/utils/accounting/historicalMigration";

/**
 * A fake database: `sales` rows with net 0 (no journal needed, only the "posted" marker).
 * Reads honour the journal_status / id filters, order by id and limit; updates flip the status.
 */
function fakeClient(saleCount: number, failMarkerFor: Set<string> = new Set()) {
  const sales = Array.from({ length: saleCount }, (_, i) => ({
    id: `s-${String(i).padStart(5, "0")}`,
    organization_id: "org-1",
    net_amount: 0,
    journal_status: "pending",
    is_cancelled: false,
    deleted_at: null,
  }));
  const tables: Record<string, Array<Record<string, unknown>>> = {
    sales,
    purchase_bills: [],
    sale_returns: [],
    purchase_returns: [],
  };

  const from = (table: string) => {
    if (table === "settings") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { accounting_engine_enabled: false }, error: null }) }) }),
      };
    }
    const rows = tables[table];
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let limit = Infinity;
    let rangeFrom = 0;
    const read = {
      select: () => read,
      eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), read),
      is: (col: string, val: unknown) => (filters.push((r) => (r[col] ?? null) === val), read),
      gt: (col: string, val: string) => (filters.push((r) => String(r[col]) > val), read),
      order: () => read,
      limit: (n: number) => ((limit = n), read),
      range: (a: number, b: number) => ((rangeFrom = a), (limit = b - a + 1), read),
      then: (resolve: (v: unknown) => void) => {
        const data = rows
          .filter((r) => filters.every((f) => f(r)))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          .slice(rangeFrom, rangeFrom + limit);
        resolve({ data, error: null });
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          if (failMarkerFor.has(id)) return { error: { message: "write failed" } };
          Object.assign(rows.find((r) => r.id === id)!, patch);
          return { error: null };
        },
      }),
    };
    return read;
  };
  return { client: { from } as never, sales };
}

describe("historical backfill paging", () => {
  it("posts every pending bill in one run, across pages (no rows skipped)", async () => {
    const { client, sales } = fakeClient(1200);
    const summary = await runHistoricalAccountingBackfill("org-1", client);
    expect(summary.sales).toEqual({ ok: 1200, err: 0 });
    expect(sales.every((s) => s.journal_status === "posted")).toBe(true);
  });

  it("counts a bill whose posted marker failed as an error, not OK", async () => {
    const { client, sales } = fakeClient(3, new Set(["s-00001"]));
    const summary = await runHistoricalAccountingBackfill("org-1", client);
    expect(summary.sales).toEqual({ ok: 2, err: 1 });
    expect(sales[1].journal_status).toBe("pending");
  });
});
