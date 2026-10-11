import { QueryCache, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  clearMissingQueryFnError,
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

  it('with type "active" leaves closed (inactive) dashboards stale instead of refetching', async () => {
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

    invalidateAndRefetchWithQueryFn(queryClient, ["invoice-dashboard-unified"], "active");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toBe(1);
    const query = queryClient
      .getQueryCache()
      .find({ queryKey: ["invoice-dashboard-unified", "org"] });
    expect(query?.state.isInvalidated).toBe(true);
  });
});

describe("clearMissingQueryFnError (global QueryCache guard)", () => {
  const catalogKey = [
    "product-catalog",
    "4bc73037-e877-4000-8000-000000000000",
    1,
    50,
    { debouncedSearch: "", maxPrice: "", minPrice: "", selectedCategory: "all" },
    5,
  ] as const;

  it("undoes a Missing queryFn error on a restored catalog page", async () => {
    const queryClient = new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => {
          clearMissingQueryFnError(query, error);
        },
      }),
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(catalogKey, { rows: [{ product_id: "p1" }], totalCount: 1 });

    await queryClient.invalidateQueries({ queryKey: ["product-catalog"], refetchType: "all" });

    const query = queryClient.getQueryCache().find({ queryKey: catalogKey });
    expect(query?.state.error).toBeNull();
    expect(query?.state.status).toBe("success");
    expect(query?.state.isInvalidated).toBe(true);
    expect(query?.state.data).toEqual({ rows: [{ product_id: "p1" }], totalCount: 1 });
  });

  it("leaves real errors alone", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["product-catalog", "org"], { rows: [], totalCount: 0 });
    const query = queryClient.getQueryCache().find({ queryKey: ["product-catalog", "org"] })!;
    expect(clearMissingQueryFnError(query, new Error("permission denied"))).toBe(false);
  });
});
