import { describe, expect, it } from "vitest";
import { applySaleOrderListFilters, type SaleOrderListFilters } from "./saleOrderListQueries";
import { saleOrderDashboardThisMonthRange } from "./saleOrderDashboardDates";

type Call = { method: string; column?: string; value?: unknown };

function createFilterRecorder() {
  const calls: Call[] = [];
  const query = {
    eq(column: string, value: unknown) {
      calls.push({ method: "eq", column, value });
      return query;
    },
    or(filters: string) {
      calls.push({ method: "or", value: filters });
      return query;
    },
    gte(column: string, value: string) {
      calls.push({ method: "gte", column, value });
      return query;
    },
    lte(column: string, value: string) {
      calls.push({ method: "lte", column, value });
      return query;
    },
  };
  return { query, calls };
}

function baseFilters(overrides: Partial<SaleOrderListFilters> = {}): SaleOrderListFilters {
  return {
    statusFilter: "all",
    customerFilter: "all",
    searchQuery: "",
    ...overrides,
  };
}

describe("applySaleOrderListFilters", () => {
  it("does not constrain order_date when no dates are set (legacy all-time)", () => {
    const { query, calls } = createFilterRecorder();
    applySaleOrderListFilters(query, baseFilters());
    expect(calls.filter((c) => c.column === "order_date")).toEqual([]);
  });

  it("applies month bounds on order_date for the dashboard default range", () => {
    const { fromDate, toDate } = saleOrderDashboardThisMonthRange(new Date("2026-08-24T12:00:00"));
    const { query, calls } = createFilterRecorder();
    applySaleOrderListFilters(query, baseFilters({ fromDate, toDate }));

    expect(calls).toContainEqual({ method: "gte", column: "order_date", value: "2026-08-01" });
    expect(calls).toContainEqual({
      method: "lte",
      column: "order_date",
      value: "2026-08-31T23:59:59.999Z",
    });
  });
});
