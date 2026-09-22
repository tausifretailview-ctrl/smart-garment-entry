import { describe, expect, it } from "vitest";
import {
  getFixedBuiltinLabelDimensions,
  fixedBuiltinPresetLabel,
  isFixedBuiltinLabelPreset,
  resolveFixedBuiltinLabelConfig,
} from "@/constants/fixedBuiltinLabelPresets";
import { resolveKidszoneLabelConfig } from "@/constants/kidszoneLabelTemplate";
import { resolveBoutiqueGridLabelConfig } from "@/constants/boutiqueGridLabelTemplate";
import {
  RETAIL_NARROW_50X25_DIMENSIONS,
  RETAIL_NARROW_BARCODE_HEIGHT_SLIDER,
  RETAIL_NARROW_LABEL_CONFIG,
  isRetailNarrowPresetName,
  resolveRetailNarrowLabelConfig,
} from "@/constants/retailNarrowLabelTemplate";
import { LABEL_NARROW_FONT_FAMILY } from "@/utils/labelFontFace";
import { previewFontFamilyStyle } from "@/utils/labelFontFace";
import type { FieldKey } from "@/types/labelTypes";

const META_KEYS = new Set([
  "fieldOrder",
  "barcodeHeight",
  "barcodeWidth",
  "customTextValue",
  "customTextFields",
  "lines",
  "labelStyle",
]);

function textFieldKeys(): FieldKey[] {
  return (Object.keys(RETAIL_NARROW_LABEL_CONFIG) as FieldKey[]).filter(
    (k) => !META_KEYS.has(k),
  );
}

describe("existing built-ins unchanged", () => {
  it("keeps kidszone / jewellery locked and narrow unlocked", () => {
    expect(isFixedBuiltinLabelPreset("kidszone")).toBe(true);
    expect(isFixedBuiltinLabelPreset("retail narrow")).toBe(false);
    expect(isFixedBuiltinLabelPreset("preset:retail-narrow")).toBe(false);
    expect(resolveFixedBuiltinLabelConfig("retail narrow")).toBeNull();
    expect(resolveFixedBuiltinLabelConfig("kidszone")).not.toBeNull();
  });

  it("does not leak a fontFamily into existing built-in configs", () => {
    for (const cfg of [
      resolveKidszoneLabelConfig(),
      resolveBoutiqueGridLabelConfig(),
    ]) {
      for (const key of Object.keys(cfg) as FieldKey[]) {
        if (META_KEYS.has(key)) continue;
        expect(
          (cfg[key] as { fontFamily?: unknown }).fontFamily,
          `${key}.fontFamily`,
        ).toBeUndefined();
      }
    }
  });

  it("snapshots existing built-in configs", () => {
    expect(resolveKidszoneLabelConfig()).toMatchSnapshot();
    expect(resolveBoutiqueGridLabelConfig()).toMatchSnapshot();
  });
});

describe("Retail Narrow starting design", () => {
  it("matches by canonical name and aliases only (no prefix match)", () => {
    expect(isRetailNarrowPresetName("Retail Narrow")).toBe(true);
    expect(isRetailNarrowPresetName("preset:retail-narrow")).toBe(true);
    expect(isRetailNarrowPresetName("RETAIL NARROW")).toBe(true);
    expect(isRetailNarrowPresetName("Boutique Sale")).toBe(false);
    expect(isRetailNarrowPresetName("retail")).toBe(false);
    expect(isRetailNarrowPresetName("")).toBe(false);
    expect(isRetailNarrowPresetName(null)).toBe(false);
  });

  it("sets the narrow stack on every text field", () => {
    const keys = textFieldKeys();
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      expect(
        (RETAIL_NARROW_LABEL_CONFIG[key] as { fontFamily?: unknown })
          .fontFamily,
        `${key}.fontFamily`,
      ).toBe(LABEL_NARROW_FONT_FAMILY);
    }
  });

  it("uses the specified bold flags", () => {
    const cfg = RETAIL_NARROW_LABEL_CONFIG;
    expect(cfg.businessName.bold).toBe(true);
    expect(cfg.price.bold).toBe(true);
    expect(cfg.size.bold).toBe(true);
    expect(cfg.mrp.bold).toBe(false);
    expect(cfg.saleDiscPercent?.bold).toBe(false);
    expect(cfg.category.bold).toBe(false);
    expect(cfg.style.bold).toBe(false);
    expect(cfg.supplierCode.bold).toBe(false);
    expect(cfg.barcodeText.bold).toBe(false);
  });

  it("uses barcodeHeight ~20 and 50×25 dims", () => {
    expect(RETAIL_NARROW_BARCODE_HEIGHT_SLIDER).toBe(20);
    expect(RETAIL_NARROW_LABEL_CONFIG.barcodeHeight).toBe(20);
    expect(RETAIL_NARROW_50X25_DIMENSIONS).toEqual({ width: 50, height: 25 });
    expect(getFixedBuiltinLabelDimensions("retail narrow")).toEqual({
      width: 50,
      height: 25,
    });
    expect(fixedBuiltinPresetLabel("retail narrow")).toContain("Retail Narrow");
  });

  it("resolve returns a deep copy", () => {
    const a = resolveRetailNarrowLabelConfig();
    a.price.fontSize = 999;
    expect(resolveRetailNarrowLabelConfig().price.fontSize).not.toBe(999);
  });
});

describe("designer preview font fallback", () => {
  it("applies no override when fontFamily is unset (stays Arial)", () => {
    expect(previewFontFamilyStyle(undefined)).toEqual({});
    expect(previewFontFamilyStyle(null)).toEqual({});
    expect(previewFontFamilyStyle("")).toEqual({});
  });

  it("applies the field font when set", () => {
    expect(previewFontFamilyStyle(LABEL_NARROW_FONT_FAMILY)).toEqual({
      fontFamily: LABEL_NARROW_FONT_FAMILY,
    });
    expect(previewFontFamilyStyle("Georgia")).toEqual({
      fontFamily: "Georgia",
    });
  });
});
