import { describe, expect, it } from "vitest";
import {
  FOOTWEAR_FIELD_LABELS,
  resolveFootwearFormDesign,
} from "./precisionProFootwearDesign";

describe("footwear designer price field", () => {
  it("labels the price slot Sale Price (old Payal sticker)", () => {
    expect(FOOTWEAR_FIELD_LABELS.mrp).toBe("Sale Price");
  });

  it("restores a legacy salePrice field onto mrp when mrp was omitted", () => {
    const resolved = resolveFootwearFormDesign({
      pair: {
        fields: {
          salePrice: { show: true, x: 150, y: 120, caption: "Rs.", suffix: "/-" },
        },
      } as any,
    });
    expect(resolved.pair.fields.mrp.show).toBe(true);
    expect(resolved.pair.fields.mrp.caption).toBe("Rs.");
    expect(resolved.pair.fields.mrp.suffix).toBe("/-");
    expect(resolved.pair.fields.mrp.x).toBe(150);
  });

  it("does not overwrite a saved mrp layout with leftover salePrice", () => {
    const resolved = resolveFootwearFormDesign({
      pair: {
        fields: {
          mrp: { show: true, x: 10, y: 10, caption: "Rs." },
          salePrice: { show: true, x: 99, y: 99, suffix: "/-" },
        },
      } as any,
    });
    expect(resolved.pair.fields.mrp.x).toBe(10);
    expect(resolved.pair.fields.mrp.y).toBe(10);
    expect(resolved.pair.fields.mrp.suffix).toBeUndefined();
  });
});
