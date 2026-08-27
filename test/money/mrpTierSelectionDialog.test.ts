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

  it("maps sale-only tiers for Jockey-style shared EANs (549 vs 569)", () => {
    const choices = toMrpTierSelectionChoices([
      {
        product: { product_name: "BOXER BRIEF", brand: "JOCKEY", style: "8008" },
        variant: { id: "v1", size: "L", mrp: 0, sale_price: 549, stock_qty: 14 },
      },
      {
        product: { product_name: "BOXER BRIEF", brand: "JOCKEY", style: "8008" },
        variant: { id: "v2", size: "L", mrp: 0, sale_price: 569, stock_qty: 0 },
      },
    ]);

    expect(choices.map((c) => c.mrp)).toEqual([549, 569]);
    expect(choices.map((c) => c.salePrice)).toEqual([549, 569]);
  });
});
