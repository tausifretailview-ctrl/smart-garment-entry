import { describe, expect, it } from "vitest";
import {
  formatLabelSaleDiscPercent,
  getLabelFieldRawContent,
  isLabelFieldDataEmpty,
  DEFAULT_LABEL_FIELD_LABELS,
} from "./labelDesignerPlaceholders";
import type { LabelItem } from "@/types/labelTypes";
import { DEFAULT_PRECISION_CONFIG } from "@/components/precision-barcode/PrecisionLabelDesigner";
import { normalizePricingSaleDiscPercent } from "./productPricingCalc";

const baseItem: LabelItem = {
  product_name: "TOP",
  brand: "ADEEBA",
  category: "",
  color: "",
  style: "",
  size: "XL",
  sale_price: 1331,
  mrp: 1775,
  barcode: "V10651",
  bill_number: "",
};

describe("formatLabelSaleDiscPercent", () => {
  it("matches the reference tag DIS: 25%", () => {
    expect(formatLabelSaleDiscPercent(25)).toBe("DIS: 25%");
  });

  it("is blank for null, 0, and invalid — never DIS: 0%", () => {
    expect(formatLabelSaleDiscPercent(null)).toBe("");
    expect(formatLabelSaleDiscPercent(undefined)).toBe("");
    expect(formatLabelSaleDiscPercent(0)).toBe("");
    expect(formatLabelSaleDiscPercent(Number.NaN)).toBe("");
    expect(formatLabelSaleDiscPercent(-5)).toBe("");
  });
});

describe("label designer Dis % field", () => {
  it("is in the picker registry next to MRP", () => {
    expect(DEFAULT_LABEL_FIELD_LABELS.saleDiscPercent).toBe("Dis %");
    expect(DEFAULT_PRECISION_CONFIG.saleDiscPercent?.show).toBe(false);
    expect(DEFAULT_PRECISION_CONFIG.fieldOrder).toContain("saleDiscPercent");
    expect(DEFAULT_PRECISION_CONFIG.fieldOrder.indexOf("saleDiscPercent")).toBeGreaterThan(
      DEFAULT_PRECISION_CONFIG.fieldOrder.indexOf("mrp"),
    );
  });

  it("prints stored Sale Disc % and stays empty when unset", () => {
    expect(getLabelFieldRawContent("saleDiscPercent", { ...baseItem, sale_disc_percent: 25 })).toBe(
      "DIS: 25%",
    );
    expect(isLabelFieldDataEmpty("saleDiscPercent", { ...baseItem, sale_disc_percent: 25 })).toBe(
      false,
    );
    expect(getLabelFieldRawContent("saleDiscPercent", baseItem)).toBe("");
    expect(isLabelFieldDataEmpty("saleDiscPercent", baseItem)).toBe(true);
    expect(getLabelFieldRawContent("saleDiscPercent", { ...baseItem, sale_disc_percent: 0 })).toBe(
      "",
    );
  });

  it("does not recompute from MRP / sale price", () => {
    const implied = Math.round(((1775 - 1331) / 1775) * 100);
    expect(implied).toBe(25);
    expect(getLabelFieldRawContent("saleDiscPercent", baseItem)).toBe("");
  });

  it("leaves existing MRP / sale formats unchanged", () => {
    expect(getLabelFieldRawContent("mrp", baseItem)).toBe("MRP: 1775");
    expect(getLabelFieldRawContent("price", baseItem)).toBe("Rs.1331");
  });
});

describe("normalizePricingSaleDiscPercent", () => {
  it("stores typed percent and drops blank/zero", () => {
    expect(normalizePricingSaleDiscPercent("25")).toBe(25);
    expect(normalizePricingSaleDiscPercent(25)).toBe(25);
    expect(normalizePricingSaleDiscPercent("")).toBeNull();
    expect(normalizePricingSaleDiscPercent(0)).toBeNull();
    expect(normalizePricingSaleDiscPercent("0")).toBeNull();
  });
});
