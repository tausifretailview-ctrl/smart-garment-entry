import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  fetchDailyIncentiveConfig,
  loadOrComputeDailyIncentiveDays,
} from "./dailySalesmanIncentiveSync";

const ORG = "b230c582-4f0b-420f-b18b-bef26c2f5ce8";

function chainable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  return chain;
}

describe("dailySalesmanIncentiveSync", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("loadOrComputeDailyIncentiveDays uses sync RPC only (no raw sales fetch)", async () => {
    fromMock
      .mockReturnValueOnce(
        chainable({
          data: { qty_threshold: 5, is_enabled: true },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        chainable({
          data: [
            { min_net_amount: 0, max_net_amount: 500, incentive_amount: 3, sort_order: 1 },
          ],
          error: null,
        }),
      );

    rpcMock.mockResolvedValue({
      data: [
        {
          id: "row-1",
          employee_id: "e1",
          employee_name: "MOHD ASHRAF FAROOQUI",
          incentive_date: "2026-09-15",
          total_qty: 12,
          total_net_amount: 20449.99,
          is_eligible: true,
          incentive_amount: 100,
          is_locked: false,
          computed_at: "2026-09-15T10:00:00Z",
        },
      ],
      error: null,
    });

    const rows = await loadOrComputeDailyIncentiveDays({
      organizationId: ORG,
      startYmd: "2026-09-15",
      endYmd: "2026-09-15",
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("sync_daily_salesman_incentive_days", {
      p_org_id: ORG,
      p_start_date: "2026-09-15",
      p_end_date: "2026-09-15",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].incentive_amount).toBe(100);
    expect(rows[0].total_qty).toBe(12);
  });

  it("returns empty when config disabled", async () => {
    fromMock.mockReturnValueOnce(
      chainable({
        data: null,
        error: null,
      }),
    );

    const rows = await loadOrComputeDailyIncentiveDays({
      organizationId: ORG,
      startYmd: "2026-09-01",
      endYmd: "2026-09-30",
    });

    expect(rows).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("fetchDailyIncentiveConfig loads brackets", async () => {
    fromMock
      .mockReturnValueOnce(
        chainable({
          data: { qty_threshold: 5, is_enabled: true },
          error: null,
        }),
      )
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [{ min_net_amount: 1000, max_net_amount: null, incentive_amount: 10, sort_order: 3 }],
          error: null,
        }),
      });

    const config = await fetchDailyIncentiveConfig(ORG);
    expect(config?.qty_threshold).toBe(5);
    expect(config?.brackets).toHaveLength(1);
  });
});
