import { describe, expect, it } from "vitest";
import { planWebsiteSend } from "./websiteSendProducts";

describe("sending products from the Product Dashboard to the website", () => {
  const existing = [
    { product_id: "p1", variant_id: null, display_order: 4 },
    { product_id: "p2", variant_id: null, display_order: 9 },
  ];

  it("adds new products switched off, after the last listing, with the ERP sale price", () => {
    const { rows, already } = planWebsiteSend("org1", existing, [
      { product_id: "p3", default_sale_price: 1850 },
      { product_id: "p4", default_sale_price: 0 },
    ]);
    expect(already).toBe(0);
    expect(rows).toEqual([
      { organization_id: "org1", product_id: "p3", variant_id: null, display_price: 1850, display_order: 10, is_active: false },
      { organization_id: "org1", product_id: "p4", variant_id: null, display_price: null, display_order: 11, is_active: false },
    ]);
  });

  it("leaves a product that is already on the website untouched", () => {
    const { rows, already } = planWebsiteSend("org1", existing, [
      { product_id: "p1", default_sale_price: 500 },
      { product_id: "p3", default_sale_price: 700 },
      { product_id: "p3", default_sale_price: 700 },
    ]);
    expect(already).toBe(1);
    expect(rows.map((r) => r.product_id)).toEqual(["p3"]);
  });

  it("starts at 1 on an empty website and does nothing for an empty selection", () => {
    expect(planWebsiteSend("org1", [], [{ product_id: "p9" }]).rows[0].display_order).toBe(1);
    expect(planWebsiteSend("org1", existing, [])).toEqual({ rows: [], already: 0 });
  });
});
