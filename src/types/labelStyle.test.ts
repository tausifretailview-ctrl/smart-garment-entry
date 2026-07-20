import { describe, expect, it } from "vitest";
import {
  isBoutiqueGridLabelStyle,
  LABEL_STYLE_BOUTIQUE_GRID,
  LABEL_STYLE_DEFAULT,
} from "@/types/labelTypes";
import { DEFAULT_PRECISION_CONFIG } from "@/components/precision-barcode/PrecisionLabelDesigner";
import { KIDSZONE_50X40_LABEL_CONFIG } from "@/constants/kidszoneLabelTemplate";
import { BOUTIQUE_GRID_LABEL_CONFIG } from "@/constants/boutiqueGridLabelTemplate";
import {
  isFixedBuiltinLabelPreset,
  resolveFixedBuiltinLabelConfig,
  getFixedBuiltinLabelDimensions,
  resolveBoutiqueBuiltinLabelConfig,
} from "@/constants/fixedBuiltinLabelPresets";

describe("labelStyle opt-in safety", () => {
  it("treats missing labelStyle as NOT boutique (existing org presets)", () => {
    expect(isBoutiqueGridLabelStyle(undefined)).toBe(false);
    expect(isBoutiqueGridLabelStyle(null)).toBe(false);
    expect(isBoutiqueGridLabelStyle({})).toBe(false);
    expect(isBoutiqueGridLabelStyle({ labelStyle: LABEL_STYLE_DEFAULT })).toBe(false);
    expect(isBoutiqueGridLabelStyle({ labelStyle: "default" })).toBe(false);
  });

  it("only activates boutique when explicitly set", () => {
    expect(isBoutiqueGridLabelStyle({ labelStyle: LABEL_STYLE_BOUTIQUE_GRID })).toBe(true);
    expect(isBoutiqueGridLabelStyle(BOUTIQUE_GRID_LABEL_CONFIG)).toBe(true);
  });

  it("does not mark default designer or kidszone configs as boutique", () => {
    expect(DEFAULT_PRECISION_CONFIG.labelStyle).toBeUndefined();
    expect(isBoutiqueGridLabelStyle(DEFAULT_PRECISION_CONFIG)).toBe(false);
    expect(KIDSZONE_50X40_LABEL_CONFIG.labelStyle).toBeUndefined();
    expect(isBoutiqueGridLabelStyle(KIDSZONE_50X40_LABEL_CONFIG)).toBe(false);
  });

  it("does not lock Boutique Grid like kidszone (field toggles must persist)", () => {
    expect(isFixedBuiltinLabelPreset("boutique-grid")).toBe(false);
    expect(isFixedBuiltinLabelPreset("Boutique Grid")).toBe(false);
    expect(isFixedBuiltinLabelPreset("kidszone")).toBe(true);
    expect(resolveFixedBuiltinLabelConfig("boutique-grid")).toBeNull();
    expect(resolveFixedBuiltinLabelConfig("kidszone")?.labelStyle).toBeUndefined();
    expect(getFixedBuiltinLabelDimensions("Boutique Grid")).toEqual({ width: 50, height: 38 });
    expect(resolveBoutiqueBuiltinLabelConfig("boutique-grid")?.labelStyle).toBe(
      LABEL_STYLE_BOUTIQUE_GRID,
    );
  });
});
