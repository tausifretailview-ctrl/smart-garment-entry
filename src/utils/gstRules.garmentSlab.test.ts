import { describe, expect, it } from "vitest";
import {
  getEffectiveUnitSalePrice,
  getGarmentSlabPrice,
  resolveGarmentGstForLine,
} from "./gstRules";

const ON = { garment_gst_rule_enabled: true, garment_gst_threshold: 2625, garment_gst_below_rate: 5 };

/** Mirrors Sales Invoice calculateLineTotal: slab from the post-discount piece price. */
function saleLineGst(p: {
  price: number;
  qty?: number;
  discPct?: number;
  discRs?: number;
  currentGst: number;
  billRatio?: number;
  inclusive?: boolean;
}) {
  const net = getEffectiveUnitSalePrice({
    unitPrice: p.price,
    quantity: p.qty ?? 1,
    discountPercent: p.discPct,
    discountAmount: p.discRs,
  });
  const slab = getGarmentSlabPrice(
    net,
    { billDiscountRatio: p.billRatio, priceIncludesGst: p.inclusive ?? true },
    ON,
  );
  return resolveGarmentGstForLine(slab, p.currentGst, p.currentGst, ON);
}

describe("garment GST slab after discount", () => {
  it("drops 18% → 5% when a line discount brings the piece to/below ₹2625", () => {
    expect(saleLineGst({ price: 2999, currentGst: 5 })).toBe(18);
    expect(saleLineGst({ price: 2999, discPct: 15, currentGst: 18 })).toBe(5);
    expect(saleLineGst({ price: 2999, discRs: 374, currentGst: 18 })).toBe(5); // 2625 exactly
  });

  it("goes back to 18% when the discount is removed or the price rises", () => {
    expect(saleLineGst({ price: 2999, discPct: 0, currentGst: 5 })).toBe(18);
    expect(saleLineGst({ price: 2999, discPct: 5, currentGst: 5 })).toBe(18); // 2849
  });

  it("judges ₹ discount per piece when qty > 1", () => {
    // 2 × 2999 − ₹800 = ₹2599 a piece → 5%
    expect(saleLineGst({ price: 2999, qty: 2, discRs: 800, currentGst: 18 })).toBe(5);
    // 2 × 2999 − ₹300 = ₹2849 a piece → 18%
    expect(saleLineGst({ price: 2999, qty: 2, discRs: 300, currentGst: 5 })).toBe(18);
  });

  it("counts the bill (flat / customer master) discount share", () => {
    // ₹2999 with a 15% bill discount = ₹2549 a piece → 5%
    expect(saleLineGst({ price: 2999, billRatio: 0.15, currentGst: 18 })).toBe(5);
    // removing it brings 18% back
    expect(saleLineGst({ price: 2999, billRatio: 0, currentGst: 5 })).toBe(18);
  });

  it("grosses exclusive prices up so ₹2500 taxable is the limit", () => {
    expect(getGarmentSlabPrice(2500, { priceIncludesGst: false }, ON)).toBe(2625);
    expect(saleLineGst({ price: 2500, inclusive: false, currentGst: 18 })).toBe(5);
    expect(saleLineGst({ price: 2600, inclusive: false, currentGst: 5 })).toBe(18);
    // 2700 − 5% = 2565 taxable > 2500 → still 18%
    expect(saleLineGst({ price: 2700, discPct: 5, inclusive: false, currentGst: 18 })).toBe(18);
  });

  it("leaves inclusive prices as they are with no bill discount", () => {
    expect(getGarmentSlabPrice(2625, {}, ON)).toBe(2625);
  });
});
