import { describe, expect, it } from "vitest";
import { applyCustomerPageToggle, CUSTOMER_PAGE_DEFAULTS } from "./customerPageSettings";

const allOn = { enabled: true, push_enabled: true, add_link_to_whatsapp: true, print_qr_on_bill: true };

describe("applyCustomerPageToggle", () => {
  it("changes only the toggled flag", () => {
    expect(applyCustomerPageToggle({ ...CUSTOMER_PAGE_DEFAULTS, enabled: true }, "push_enabled", true)).toEqual({
      ...CUSTOMER_PAGE_DEFAULTS,
      enabled: true,
      push_enabled: true,
    });
  });

  it("turning the customer page off turns everything off", () => {
    expect(applyCustomerPageToggle(allOn, "enabled", false)).toEqual(CUSTOMER_PAGE_DEFAULTS);
  });

  it("turning the page on keeps other flags as they were", () => {
    expect(applyCustomerPageToggle(CUSTOMER_PAGE_DEFAULTS, "enabled", true)).toEqual({
      ...CUSTOMER_PAGE_DEFAULTS,
      enabled: true,
    });
  });
});
