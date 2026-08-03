import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { purchaseBillsDefaultQueryKey } from "./purchaseDashboardPrefetch";
import { resolvePurchaseDashboardQueryDates } from "./purchaseDashboardDates";

describe("purchaseBillsDefaultQueryKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches PurchaseBillDashboard first-paint key (monthly, pageSize 100)", () => {
    const { startDate, endDate } = resolvePurchaseDashboardQueryDates("monthly", "", "");
    expect(purchaseBillsDefaultQueryKey("org-1")).toEqual([
      "purchase-bills",
      "org-1",
      "",
      "monthly",
      startDate,
      endDate,
      "desc",
      1,
      100,
      "all",
      "all",
    ]);
  });
});
