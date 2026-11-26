import { describe, expect, it } from "vitest";
import { isOptionalMenuPathShown, resolveOptionalMenus } from "./optionalMenus";

describe("optional menus", () => {
  it("an existing shop (no key) keeps every menu", () => {
    expect(resolveOptionalMenus({})).toEqual({
      masters: true, stock_tools: true, data_checks: true, customer_reports: true, website: true,
    });
    expect(resolveOptionalMenus(null).website).toBe(true);
  });

  it("a new shop (all false) hides them; a group turned on shows", () => {
    const m = resolveOptionalMenus({
      optional_menus: { masters: false, stock_tools: false, data_checks: false, customer_reports: true, website: false },
    });
    expect(m).toEqual({ masters: false, stock_tools: false, data_checks: false, customer_reports: true, website: false });
    expect(isOptionalMenuPathShown("/transporters", m)).toBe(false);
    expect(isOptionalMenuPathShown("/salesman-locations", m)).toBe(false);
    expect(isOptionalMenuPathShown("/customer-reviews", m)).toBe(true);
    expect(isOptionalMenuPathShown("/website", m)).toBe(false);
    // Pages outside every group always show; query strings are ignored.
    expect(isOptionalMenuPathShown("/stock-report?tab=sizewise", m)).toBe(true);
    expect(isOptionalMenuPathShown("customer-audit-report?period=today", m)).toBe(true);
  });
});
