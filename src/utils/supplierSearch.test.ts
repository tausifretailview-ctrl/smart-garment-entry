import { describe, expect, it } from "vitest";
import { fetchSuppliersByIds, searchSuppliers } from "./supplierSearch";

describe("supplierSearch exports", () => {
  it("exposes search + by-ids helpers for payment hot paths", () => {
    expect(typeof searchSuppliers).toBe("function");
    expect(typeof fetchSuppliersByIds).toBe("function");
  });
});
