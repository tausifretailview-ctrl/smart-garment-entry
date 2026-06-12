import { describe, expect, it } from "vitest";
import { isPurchaseBillStatsRpcNotFoundError } from "@/utils/purchaseDashboardSummary";

describe("isPurchaseBillStatsRpcNotFoundError", () => {
  it("detects HTTP 404", () => {
    expect(isPurchaseBillStatsRpcNotFoundError({ status: 404 })).toBe(true);
  });

  it("detects PostgREST missing function codes", () => {
    expect(isPurchaseBillStatsRpcNotFoundError({ code: "PGRST202" })).toBe(true);
    expect(isPurchaseBillStatsRpcNotFoundError({ code: "42883" })).toBe(true);
  });

  it("detects function name in message", () => {
    expect(
      isPurchaseBillStatsRpcNotFoundError({
        message: "Could not find the function public.get_purchase_bill_dashboard_stats",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isPurchaseBillStatsRpcNotFoundError({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
    expect(isPurchaseBillStatsRpcNotFoundError(null)).toBe(false);
  });
});
