import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  invalidateAndRefetchWithQueryFn,
  isMissingQueryFnError,
} from "./refetchQueriesWithFn";

const dashboardKey = [
  "invoice-dashboard-unified",
  "3fdca631-1e0c-4417-9704-421f5129ff67",
  "",
  "",
  "all",
  [],
  "all",
  "all",
  null,
  null,
  1,
  100,
] as const;

describe("invalidateAndRefetchWithQueryFn", () => {
  it("recognizes the Sales dashboard missing-queryFn failure", () => {
    expect(
      isMissingQueryFnError(
        new Error(`Missing queryFn: '${JSON.stringify(dashboardKey)}'`),
      ),
    ).toBe(true);
    expect(isMissingQueryFnError(new Error("Failed to load sales invoices"))).toBe(false);
  });

  it("does not turn a restored dashboard cache into a load error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(dashboardKey, { invoices: [{ id: "sale-1" }], totalCount: 1 });

    await queryClient.refetchQueries({
      queryKey: ["invoice-dashboard-unified"],
      type: "all",
    });
    const broken = queryClient.getQueryCache().find({ queryKey: dashboardKey });
    expect(isMissingQueryFnError(broken?.state.error)).toBe(true);

    const restored = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    restored.setQueryData(dashboardKey, { invoices: [{ id: "sale-1" }], totalCount: 1 });
    invalidateAndRefetchWithQueryFn(restored, ["invoice-dashboard-unified"]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const query = restored.getQueryCache().find({ queryKey: dashboardKey });
    expect(query?.state.isInvalidated).toBe(true);
    expect(query?.state.status).toBe("success");
    expect(query?.state.error).toBeNull();
    expect(query?.state.data).toEqual({ invoices: [{ id: "sale-1" }], totalCount: 1 });
  });

  it("still refetches a dashboard query that has a queryFn", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let calls = 0;
    await queryClient.prefetchQuery({
      queryKey: ["invoice-dashboard-unified", "org"],
      queryFn: async () => {
        calls += 1;
        return { invoices: [], totalCount: calls };
      },
    });

    invalidateAndRefetchWithQueryFn(queryClient, ["invoice-dashboard-unified"]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toBe(2);
  });
});
