import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { coalesceRefresh, REFRESH_COALESCE_MS } from "./coalesceRefresh";
import { invalidatePosDashboardQueries } from "./posDashboardSales";
import { invalidateMoneyViewFreshness } from "./moneyViewFreshnessInvalidation";
import { invalidateStockReportQueries } from "./invalidateDashboardQueries";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/** Review items L1, L2, L5: one bill no longer reloads the same screens five times. */
describe("coalesceRefresh", () => {
  it("runs the first request at once and merges the rest into one run at the end of the window", () => {
    const owner = {};
    const run = vi.fn();
    coalesceRefresh(owner, "k", run);
    expect(run).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(300);
      coalesceRefresh(owner, "k", run);
    }
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(REFRESH_COALESCE_MS);
    expect(run).toHaveBeenCalledTimes(2);
    // Nothing left over.
    vi.advanceTimersByTime(REFRESH_COALESCE_MS * 4);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("the last change is always picked up: the merged run is the latest request", () => {
    const owner = {};
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    coalesceRefresh(owner, "k", first);
    coalesceRefresh(owner, "k", second);
    coalesceRefresh(owner, "k", third);
    vi.advanceTimersByTime(REFRESH_COALESCE_MS);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(third).toHaveBeenCalledTimes(1);
  });

  it("a request after a quiet window runs at once again", () => {
    const owner = {};
    const run = vi.fn();
    coalesceRefresh(owner, "k", run);
    vi.advanceTimersByTime(REFRESH_COALESCE_MS + 1);
    coalesceRefresh(owner, "k", run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keys and owners do not share a window", () => {
    const a = {};
    const b = {};
    const run = vi.fn();
    coalesceRefresh(a, "k", run);
    coalesceRefresh(a, "other", run);
    coalesceRefresh(b, "k", run);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("trailing: false drops repeats inside the window", () => {
    const owner = {};
    const run = vi.fn();
    coalesceRefresh(owner, "k", run, { gapMs: 1000, trailing: false });
    coalesceRefresh(owner, "k", run, { gapMs: 1000, trailing: false });
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

function fakeClient() {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  const refetchQueries = vi.fn().mockResolvedValue(undefined);
  return { client: { invalidateQueries, refetchQueries, getQueryCache: () => ({ findAll: () => [] }) } as unknown as QueryClient, invalidateQueries, refetchQueries };
}

describe("after one POS bill", () => {
  it("the POS Dashboard reloads once at once and once more, not once per request", async () => {
    const { client, invalidateQueries, refetchQueries } = fakeClient();
    // The save, the POS page, the window event and two live listeners, inside two seconds.
    invalidatePosDashboardQueries(client, "org1");
    invalidatePosDashboardQueries(client, "org1");
    vi.advanceTimersByTime(200);
    invalidatePosDashboardQueries(client, "org1", { refetchType: "active" });
    vi.advanceTimersByTime(1500);
    invalidatePosDashboardQueries(client, "org1");
    invalidatePosDashboardQueries(client, "org1", { refetchType: "active" });
    await vi.advanceTimersByTimeAsync(0);
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(refetchQueries.mock.calls[0][0]).toMatchObject({ queryKey: ["pos-dashboard-sales", "org1"], type: "all" });

    await vi.advanceTimersByTimeAsync(REFRESH_COALESCE_MS);
    expect(refetchQueries).toHaveBeenCalledTimes(2);
    // "all" was asked inside the window, so the merged run also covers cached screens.
    expect(refetchQueries.mock.calls[1][0]).toMatchObject({ type: "all" });

    // Every request still marked the data stale at once.
    const staleMarks = invalidateQueries.mock.calls.filter((c) => (c[0] as { refetchType?: string }).refetchType === "none");
    expect(staleMarks.length).toBeGreaterThanOrEqual(5);
  });

  it("refetchType none only marks stale", () => {
    const { client, invalidateQueries, refetchQueries } = fakeClient();
    invalidatePosDashboardQueries(client, "org1", { refetchType: "none" });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["pos-dashboard-sales", "org1"], refetchType: "none" });
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it("money views and stock screens are refreshed twice at most, however many requests arrive", () => {
    const { client, invalidateQueries } = fakeClient();
    invalidateMoneyViewFreshness(client, "org1");
    const afterFirst = invalidateQueries.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(5);
    for (let i = 0; i < 4; i++) invalidateMoneyViewFreshness(client, "org1");
    expect(invalidateQueries.mock.calls.length).toBe(afterFirst);
    vi.advanceTimersByTime(REFRESH_COALESCE_MS);
    expect(invalidateQueries.mock.calls.length).toBeGreaterThan(afterFirst);
    const afterSecond = invalidateQueries.mock.calls.length;
    vi.advanceTimersByTime(REFRESH_COALESCE_MS * 3);
    expect(invalidateQueries.mock.calls.length).toBe(afterSecond);

    const stock = fakeClient();
    for (let i = 0; i < 6; i++) invalidateStockReportQueries(stock.client, "org1");
    const first = stock.invalidateQueries.mock.calls.length;
    vi.advanceTimersByTime(REFRESH_COALESCE_MS);
    // One more run of the same size, not five more.
    expect(stock.invalidateQueries.mock.calls.length).toBe(first * 2);
  });

  it("another shop's refresh is not held back", () => {
    const { client, refetchQueries } = fakeClient();
    invalidatePosDashboardQueries(client, "org1");
    invalidatePosDashboardQueries(client, "org2");
    return vi.advanceTimersByTimeAsync(0).then(() => expect(refetchQueries).toHaveBeenCalledTimes(2));
  });
});
