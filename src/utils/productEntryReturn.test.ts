import { describe, expect, it } from "vitest";
import { productEntryEditUrl, productEntryReturnPath } from "./productEntryReturn";

describe("Product Entry return page", () => {
  it("opens edit with the return page in the URL", () => {
    expect(productEntryEditUrl("p1", "bulk-product-update")).toBe("/product-entry?id=p1&from=bulk-product-update");
    expect(productEntryEditUrl("p1")).toBe("/product-entry?id=p1");
  });

  it("goes back to Bulk Product Update when it came from there", () => {
    expect(productEntryReturnPath("?id=p1&from=bulk-product-update")).toBe("/bulk-product-update");
  });

  it("goes to Products otherwise, and ignores unknown pages", () => {
    expect(productEntryReturnPath("?id=p1")).toBe("/products");
    expect(productEntryReturnPath("")).toBe("/products");
    expect(productEntryReturnPath("?id=p1&from=https://evil.example")).toBe("/products");
    expect(productEntryReturnPath("?from=accounts")).toBe("/products");
  });
});
