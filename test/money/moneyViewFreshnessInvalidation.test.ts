import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import {
  CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY,
  invalidateCustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { ORGANIZATION_RECEIVABLES_QUERY_KEY } from "@/utils/organizationReceivables";
import {
  getMoneyViewVisibilityQueryKeys,
  invalidateMoneyViewFreshness,
  MONEY_VIEW_FRESHNESS_DEBOUNCE_MS,
} from "@/utils/moneyViewFreshnessInvalidation";

vi.mock("@/utils/customerFinancialSnapshot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/customerFinancialSnapshot")>();
  return {
    ...actual,
    invalidateCustomerFinancialSnapshot: vi.fn(),
  };
});

describe("moneyViewFreshnessInvalidation", () => {
  it("debounce window is 300–500ms", () => {
    expect(MONEY_VIEW_FRESHNESS_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
    expect(MONEY_VIEW_FRESHNESS_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });

  it("invalidates customer snapshot, POS dashboard, and org receivables", () => {
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;
    const orgId = "org-abc";

    invalidateMoneyViewFreshness(queryClient, orgId);

    expect(invalidateCustomerFinancialSnapshot).toHaveBeenCalledWith(queryClient, orgId);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["pos-dashboard-sales", orgId],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [ORGANIZATION_RECEIVABLES_QUERY_KEY],
    });
  });

  it("visibility keys cover ledger, balances, POS, and org receivables", () => {
    const orgId = "org-xyz";
    const keys = getMoneyViewVisibilityQueryKeys(orgId);
    expect(keys).toContainEqual([CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, orgId]);
    expect(keys).toContainEqual(["customer-party-balances", orgId]);
    expect(keys).toContainEqual(["pos-dashboard-sales", orgId]);
    expect(keys).toContainEqual([ORGANIZATION_RECEIVABLES_QUERY_KEY]);
  });
});
