// @vitest-environment jsdom
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateMoneyViewFreshness, isLiveMoneyQuery } from "./moneyViewFreshnessInvalidation";

/**
 * Live payment status (Nov 2026): a payment saved anywhere also reloads the payment screens the
 * money refresh did not list (cashier report, daily tally, outstanding, receipts, advances, …).
 */
const ORG = "org-1";
const tick = async () => {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
});

function screen(key: unknown[], fn: () => Promise<unknown>, extra: Record<string, unknown> = {}) {
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fn, ...extra });
  let off = observer.subscribe(() => undefined);
  return {
    close: () => off(),
    open: () => {
      off = observer.subscribe(() => undefined);
    },
  };
}

describe("payment screens follow a payment", () => {
  it("knows the payment screens, every Daily Cashier Report part included", () => {
    for (const head of ["cashier-report-sales-v2", "cashier-report-receipts", "daily-tally-vouchers", "outstanding-dashboard", "customer-receipt-vouchers"]) {
      expect(isLiveMoneyQuery({ queryKey: [head, ORG] })).toBe(true);
    }
    expect(isLiveMoneyQuery({ queryKey: ["product-catalog", ORG] })).toBe(false);
  });

  it("reloads the cashier report on show; a closed outstanding screen reloads once when opened", async () => {
    const cashier = vi.fn(async () => "cashier");
    const outstanding = vi.fn(async () => "outstanding");
    const unrelated = vi.fn(async () => "products");
    screen(["cashier-report-receipts", ORG, "2026-11-28"], cashier);
    const closed = screen(["outstanding-dashboard", ORG], outstanding, { refetchOnMount: false });
    screen(["product-catalog", ORG], unrelated);
    await tick();
    closed.close();

    invalidateMoneyViewFreshness(client, ORG);
    await tick();
    expect(cashier).toHaveBeenCalledTimes(2);
    expect(outstanding).toHaveBeenCalledTimes(1);
    expect(unrelated).toHaveBeenCalledTimes(1);

    closed.open();
    await tick();
    expect(outstanding).toHaveBeenCalledTimes(2);
  });
});
