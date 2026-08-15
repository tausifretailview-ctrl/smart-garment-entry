import { describe, expect, it } from "vitest";
import {
  commissionOnNet,
  enrichCommissionsWithSaleItems,
  resolveLineGrossAndDiscount,
} from "./salesmanCommissionDisplay";

describe("resolveLineGrossAndDiscount", () => {
  it("uses net_after_discount and discount_share", () => {
    expect(
      resolveLineGrossAndDiscount(
        { sale_id: "s1", product_id: "p1", line_total: 1000, discount_share: 100, net_after_discount: 900 },
        1000,
      ),
    ).toEqual({ grossSale: 1000, discountAmount: 100, netSale: 900 });
  });

  it("falls back to sale_amount when no sale item", () => {
    expect(resolveLineGrossAndDiscount(null, 500)).toEqual({
      grossSale: 500,
      discountAmount: 0,
      netSale: 500,
    });
  });
});

describe("commissionOnNet", () => {
  it("applies percent to net after discount", () => {
    expect(commissionOnNet(900, 1)).toBe(9);
    expect(commissionOnNet(234945, 1)).toBe(2349.45);
  });
});

describe("enrichCommissionsWithSaleItems", () => {
  it("enriches matching rows and recomputes commission on net", () => {
    const enriched = enrichCommissionsWithSaleItems(
      [
        {
          id: "c1",
          sale_id: "s1",
          product_id: "p1",
          product_name: "Shirt",
          sale_amount: 1000,
          commission_percent: 1,
          commission_amount: 10,
        },
      ],
      [
        {
          sale_id: "s1",
          product_id: "p1",
          product_name: "Shirt",
          line_total: 1000,
          discount_share: 200,
          net_after_discount: 800,
        },
      ],
    );
    expect(enriched[0].discountAmount).toBe(200);
    expect(enriched[0].netSale).toBe(800);
    expect(enriched[0].displayCommission).toBe(8);
  });
});
