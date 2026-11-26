import { describe, expect, it } from "vitest";
import { isFieldSalesCatalogueOn } from "./fieldSalesCatalogue";

describe("Field Sales catalogue switch", () => {
  it("is on unless the shop turned it off", () => {
    expect(isFieldSalesCatalogueOn(undefined)).toBe(true);
    expect(isFieldSalesCatalogueOn({})).toBe(true);
    expect(isFieldSalesCatalogueOn({ field_sales_catalogue: true })).toBe(true);
    expect(isFieldSalesCatalogueOn({ field_sales_catalogue: false })).toBe(false);
  });
});
