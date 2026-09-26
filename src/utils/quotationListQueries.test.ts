import { describe, expect, it } from "vitest";
import {
  applyQuotationListFilters,
  quotationLocalDayEndIso,
  quotationLocalDayStartIso,
  type QuotationListFilters,
} from "./quotationListQueries";

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
    is(column: string, value: null) {
      calls.push({ method: "is", column, value });
      return query;
    },
  };
  return { query, calls };
}

function baseFilters(overrides: Partial<QuotationListFilters> = {}): QuotationListFilters {
  return {
    statusFilter: "all",
    customerFilter: "all",
    searchQuery: "",
    ...overrides,
  };
}

describe("applyQuotationListFilters", () => {
  it("does not constrain quotation_date when no dates are set", () => {
    const { query, calls } = createFilterRecorder();
    applyQuotationListFilters(query, baseFilters());
    expect(calls.filter((c) => c.column === "quotation_date")).toEqual([]);
  });

  it("bounds quotation_date to the local calendar day", () => {
    const fromDate = new Date(2026, 7, 1, 15, 30, 0);
    const toDate = new Date(2026, 7, 31, 8, 0, 0);
    const { query, calls } = createFilterRecorder();
    applyQuotationListFilters(query, baseFilters({ fromDate, toDate }));

    expect(calls).toContainEqual({
      method: "gte",
      column: "quotation_date",
      value: quotationLocalDayStartIso(fromDate),
    });
    expect(calls).toContainEqual({
      method: "lte",
      column: "quotation_date",
      value: quotationLocalDayEndIso(toDate),
    });
  });

  it("filters status on the server", () => {
    const { query, calls } = createFilterRecorder();
    applyQuotationListFilters(query, baseFilters({ statusFilter: "draft" }));
    expect(calls).toContainEqual({ method: "eq", column: "status", value: "draft" });
  });

  it("matches a customer id without also matching the name", () => {
    const { query, calls } = createFilterRecorder();
    applyQuotationListFilters(
      query,
      baseFilters({ customerFilter: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(calls).toEqual([
      { method: "eq", column: "customer_id", value: "11111111-1111-4111-8111-111111111111" },
    ]);
  });

  it("matches a nameless-id walk-in by name only", () => {
    const { query, calls } = createFilterRecorder();
    applyQuotationListFilters(query, baseFilters({ customerFilter: "WALK IN" }));
    expect(calls).toEqual([
      { method: "eq", column: "customer_name", value: "WALK IN" },
      { method: "is", column: "customer_id", value: null },
    ]);
  });

  it("strips ilike wildcards and commas from search", () => {
    const { query, calls } = createFilterRecorder();
    applyQuotationListFilters(query, baseFilters({ searchQuery: "a,b%_" }));
    expect(calls).toEqual([
      {
        method: "or",
        value:
          "quotation_number.ilike.%a b%,customer_name.ilike.%a b%,customer_phone.ilike.%a b%",
      },
    ]);
  });
});
