import { describe, expect, it } from "vitest";
import { toMrpTierSelectionChoices } from "@/components/MrpTierSelectionDialog";

describe("toMrpTierSelectionChoices", () => {
  it("maps brand, style, and MRP tiers for Jockey-style shared EANs", () => {
    const choices = toMrpTierSelectionChoices([
      {
        product: {
          product_name: "Jockey Brief Saver Pack",
          brand: "JOCKEY",
          style: "COM06",
        },
        variant: {
          id: "v1",
          size: "L",
          color: null,
          mrp: 578,
          sale_price: 549,
          stock_qty: 3,
        },
      },
      {
        product: {
          product_name: "Jockey Brief Saver Pack",
          brand: "JOCKEY",
          style: "COM11",
        },
        variant: {
          id: "v2",
          size: "L",
          color: null,
          mrp: 598,
          sale_price: 569,
          stock_qty: 1,
        },
      },
    ]);

    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({
      id: "v1",
      brand: "JOCKEY",
      style: "COM06",
      mrp: 578,
      salePrice: 549,
      stockQty: 3,
    });
    expect(choices[1]).toMatchObject({
      id: "v2",
      style: "COM11",
      mrp: 598,
      salePrice: 569,
    });
  });
});
