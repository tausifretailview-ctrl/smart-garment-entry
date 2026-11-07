import { describe, expect, it, vi } from "vitest";
import {
  invalidateQuotationViews,
  parseQuotationViewsChanged,
  QUOTATION_VIEW_QUERY_KEYS,
} from "@/utils/quotationViews";

describe("quotation views refresh", () => {
  it("refreshes every quotation list key for the org, hidden tabs included", () => {
    const invalidateQueries = vi.fn();
    invalidateQuotationViews({ invalidateQueries } as never, "org-1");
    expect(invalidateQueries).toHaveBeenCalledTimes(QUOTATION_VIEW_QUERY_KEYS.length);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["quotations-list", "org-1"],
      refetchType: "all",
    });
  });

  it("reads the org id from the cross-tab marker", () => {
    expect(parseQuotationViewsChanged(JSON.stringify({ organizationId: "org-1", at: 1 }))).toBe("org-1");
    expect(parseQuotationViewsChanged(null)).toBeNull();
    expect(parseQuotationViewsChanged("not json")).toBeNull();
    expect(parseQuotationViewsChanged(JSON.stringify({ at: 1 }))).toBeNull();
  });
});
