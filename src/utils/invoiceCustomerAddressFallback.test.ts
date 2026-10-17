import { describe, expect, it } from "vitest";
import {
  needsInvoiceCustomerAddressLookup,
  pickInvoiceCustomerAddress,
} from "./invoiceCustomerAddressFallback";

const mahi = {
  customer_name: "MAHI SHOES (THANE)",
  phone: "9768859501",
  address: "SHIV SADAN GALA NO 3, MHATRE ESTATE, THANE 400607",
};

describe("invoice customer address fallback", () => {
  it("looks up only when the bill has no address and a real party", () => {
    expect(needsInvoiceCustomerAddressLookup("MAHI SHOES (THANE)", "")).toBe(true);
    expect(needsInvoiceCustomerAddressLookup("MAHI SHOES (THANE)", "  ")).toBe(true);
    expect(needsInvoiceCustomerAddressLookup("MAHI SHOES (THANE)", "Thane")).toBe(false);
    expect(needsInvoiceCustomerAddressLookup("Walk-in Customer", "")).toBe(false);
    expect(needsInvoiceCustomerAddressLookup("", "")).toBe(false);
  });

  it("uses the Customer Master address for the same mobile and name", () => {
    expect(pickInvoiceCustomerAddress([mahi], "Mahi Shoes (Thane)", "+91 97688 59501")).toBe(mahi.address);
  });

  it("uses the only same-mobile customer when the bill name was edited", () => {
    expect(pickInvoiceCustomerAddress([mahi], "MAHI SHOES", "9768859501")).toBe(mahi.address);
  });

  it("does not guess between two same-mobile customers with other names", () => {
    const other = { ...mahi, customer_name: "MAHI FOOTWEAR", address: "Bhiwandi" };
    expect(pickInvoiceCustomerAddress([mahi, other], "MAHI", "9768859501")).toBe("");
    expect(pickInvoiceCustomerAddress([mahi, other], "MAHI SHOES (THANE)", "9768859501")).toBe(mahi.address);
  });

  it("falls back to the name only when the bill has no mobile", () => {
    expect(pickInvoiceCustomerAddress([mahi], "MAHI SHOES (THANE)", "")).toBe(mahi.address);
    expect(pickInvoiceCustomerAddress([{ ...mahi, address: null }], "MAHI SHOES (THANE)", "")).toBe("");
  });
});
