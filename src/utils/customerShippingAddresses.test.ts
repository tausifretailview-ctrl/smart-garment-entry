import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  cleanCustomerShippingAddresses,
  formatCustomerShippingAddress,
  isMissingShippingAddressesColumnError,
  parseCustomerShippingAddresses,
} from "./customerShippingAddresses";

describe("customer shipping addresses", () => {
  it("parses only usable rows", () => {
    expect(parseCustomerShippingAddresses(null)).toEqual([]);
    expect(
      parseCustomerShippingAddresses([
        { label: " Andheri ", address: " Shop 4, Andheri West " },
        { label: "", address: "" },
        "junk",
        { address: "Thane" },
      ]),
    ).toEqual([
      { label: "Andheri", address: "Shop 4, Andheri West" },
      { label: "", address: "Thane" },
    ]);
  });

  it("drops empty rows before save", () => {
    expect(cleanCustomerShippingAddresses([{ label: " ", address: "" }])).toEqual([]);
  });

  it("formats the printed address with the branch name first", () => {
    expect(formatCustomerShippingAddress({ label: "Andheri", address: "Shop 4" })).toBe("Andheri, Shop 4");
    expect(formatCustomerShippingAddress({ label: "", address: "Shop 4" })).toBe("Shop 4");
    expect(formatCustomerShippingAddress({ label: "Andheri", address: "" })).toBe("Andheri");
  });

  it("detects the missing column before the SQL is run", () => {
    expect(isMissingShippingAddressesColumnError({ code: "42703", message: "column does not exist" })).toBe(true);
    expect(isMissingShippingAddressesColumnError({ message: "Could not find the 'shipping_addresses' column" })).toBe(true);
    expect(isMissingShippingAddressesColumnError({ message: "permission denied" })).toBe(false);
    expect(isMissingShippingAddressesColumnError(null)).toBe(false);
  });
});
