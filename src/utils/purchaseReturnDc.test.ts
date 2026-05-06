import { describe, expect, it } from "vitest";
import { buildPurchaseReturnItemPayload, calculatePurchaseReturnTotals } from "./purchaseReturnDc";

describe("purchaseReturnDc", () => {
  it("forces zero gst for dc totals", () => {
    const totals = calculatePurchaseReturnTotals(
      [
        { line_total: 1000, gst_per: 5 },
        { line_total: 500, gst_per: 12 },
      ],
      "dc",
      100
    );

    expect(totals.grossAmount).toBe(1500);
    expect(totals.gstAmount).toBe(0);
    expect(totals.netAmount).toBe(1400);
  });

  it("preserves gst_per for gst mode payload", () => {
    const payload = buildPurchaseReturnItemPayload(
      {
        product_id: "p1",
        sku_id: "s1",
        size: "L",
        qty: 2,
        pur_price: 100,
        gst_per: 12,
        line_total: 200,
      },
      false
    );

    expect(payload.gst_per).toBe(12);
    expect(payload.is_dc).toBe(false);
  });

  it("forces gst_per to zero for dc payload", () => {
    const payload = buildPurchaseReturnItemPayload(
      {
        product_id: "p1",
        sku_id: "s1",
        size: "L",
        qty: 2,
        pur_price: 100,
        gst_per: 18,
        line_total: 200,
      },
      true
    );

    expect(payload.gst_per).toBe(0);
    expect(payload.is_dc).toBe(true);
  });
});

