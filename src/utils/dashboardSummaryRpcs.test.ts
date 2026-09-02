import { describe, expect, it, vi } from "vitest";
import {
  fetchDashboardPurchaseSummary,
  fetchDashboardStockSummary,
} from "./dashboardSummaryRpcs";

function mockClient(rpcImpl: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn(rpcImpl),
  } as never;
}

describe("fetchDashboardStockSummary", () => {
  it("returns the first row (view maybeSingle equivalent)", async () => {
    const row = {
      organization_id: "org-1",
      total_stock_qty: 42,
      total_stock_value: 100,
      total_sale_value: 200,
      total_variant_count: 3,
    };
    const client = mockClient(async (fn, args) => {
      expect(fn).toBe("get_dashboard_stock_summary");
      expect(args).toEqual({ p_org_id: "org-1" });
      return { data: [row], error: null };
    });
    await expect(fetchDashboardStockSummary(client, "org-1")).resolves.toEqual(row);
  });

  it("returns null when the org has no matching variants", async () => {
    const client = mockClient(async () => ({ data: [], error: null }));
    await expect(fetchDashboardStockSummary(client, "org-1")).resolves.toBeNull();
  });

  it("throws on RPC error", async () => {
    const client = mockClient(async () => ({
      data: null,
      error: { message: "Not authorized for this organization", code: "42501" },
    }));
    await expect(fetchDashboardStockSummary(client, "org-1")).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("fetchDashboardPurchaseSummary", () => {
  it("forwards org + from-day (same bound StatsChartsSection used on the view)", async () => {
    const rows = [
      {
        organization_id: "org-1",
        purchase_day: "2026-09-01",
        bill_count: 2,
        total_purchase_amount: 50,
        total_paid_amount: 10,
        total_pending_amount: 40,
        total_items_purchased: 3,
      },
    ];
    const client = mockClient(async (fn, args) => {
      expect(fn).toBe("get_dashboard_purchase_summary");
      expect(args).toEqual({ p_org_id: "org-1", p_from_day: "2026-08-26" });
      return { data: rows, error: null };
    });
    await expect(
      fetchDashboardPurchaseSummary(client, "org-1", "2026-08-26"),
    ).resolves.toEqual(rows);
  });

  it("returns [] when there are no bills in range", async () => {
    const client = mockClient(async () => ({ data: [], error: null }));
    await expect(fetchDashboardPurchaseSummary(client, "org-1", "2026-08-26")).resolves.toEqual(
      [],
    );
  });
});
