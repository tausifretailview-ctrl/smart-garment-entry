import { describe, expect, it } from "vitest";
import {
  buildCustomerBillUrl,
  cleanCustomerPageDomain,
  isBillPagePath,
} from "../supabase/functions/_shared/customerBillLink";

describe("customer bill link in pushes", () => {
  it("builds the shop's bill page URL", () => {
    expect(buildCustomerBillUrl("Adtech", "https://inventoryshop.in/", "abc_DEF-123")).toBe(
      "https://adtech.inventoryshop.in/t/abc_DEF-123",
    );
  });
  it("refuses bad parts", () => {
    expect(buildCustomerBillUrl("", "inventoryshop.in", "t1")).toBeNull();
    expect(buildCustomerBillUrl("shop", "evil.com/x?y", "t1")).toBeNull();
    expect(buildCustomerBillUrl("shop", "inventoryshop.in", "a/b")).toBeNull();
    expect(cleanCustomerPageDomain("localhost")).toBeNull();
  });
  it("recognises bill page paths on the same site", () => {
    expect(isBillPagePath("https://shop.inventoryshop.in/t/tok1", "https://shop.inventoryshop.in")).toBe(true);
    expect(isBillPagePath("https://other.example/t/tok1", "https://shop.inventoryshop.in")).toBe(false);
    expect(isBillPagePath("https://shop.inventoryshop.in/m/1", "https://shop.inventoryshop.in")).toBe(false);
  });
});
