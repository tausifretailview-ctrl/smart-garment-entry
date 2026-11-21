import { describe, expect, it } from "vitest";
import { isFieldSalesLoggedOutPath } from "./fieldSalesPaths";
import { orgCodeFromInput } from "./orgSlug";

describe("orgCodeFromInput (Change organisation)", () => {
  it("accepts the code however it is typed", () => {
    expect(orgCodeFromInput("demo")).toBe("demo");
    expect(orgCodeFromInput("  Demo ")).toBe("demo");
    expect(orgCodeFromInput("KS Footwear")).toBe("ks-footwear");
    expect(orgCodeFromInput("ks_footwear")).toBe("ks-footwear");
    expect(orgCodeFromInput("ella-noor")).toBe("ella-noor");
  });

  it("takes the code out of a pasted shop link", () => {
    expect(orgCodeFromInput("https://app.inventoryshop.in/demo")).toBe("demo");
    expect(orgCodeFromInput("app.inventoryshop.in/ks-footwear/field-sales")).toBe("ks-footwear");
    expect(orgCodeFromInput("/demo/salesman")).toBe("demo");
  });

  it("refuses what cannot be a code", () => {
    expect(orgCodeFromInput("")).toBeNull();
    expect(orgCodeFromInput("   ")).toBeNull();
    expect(orgCodeFromInput("!!!")).toBeNull();
    // App pages are not organisations.
    expect(orgCodeFromInput("auth")).toBeNull();
    expect(orgCodeFromInput("organization-setup")).toBeNull();
  });
});

describe("isFieldSalesLoggedOutPath", () => {
  it("is true for the salesman app and its start link only", () => {
    expect(isFieldSalesLoggedOutPath("/demo/salesman", "")).toBe(true);
    expect(isFieldSalesLoggedOutPath("/demo/salesman/order/new", "")).toBe(true);
    expect(isFieldSalesLoggedOutPath("/demo", "?app=fieldsales")).toBe(true);
    // Owner pages, including the one whose name starts the same way.
    expect(isFieldSalesLoggedOutPath("/demo/salesman-commission", "")).toBe(false);
    expect(isFieldSalesLoggedOutPath("/demo/pos-sales", "")).toBe(false);
    expect(isFieldSalesLoggedOutPath("/demo", "")).toBe(false);
  });
});
