import type { LabelDesignConfig } from "@/types/labelTypes";
import {
  isKidszonePresetName,
  KIDSZONE_50X40_DIMENSIONS,
  resolveKidszoneLabelConfig,
} from "@/constants/kidszoneLabelTemplate";
import {
  isJewelleryPresetName,
  JEWELLERY_100X15_DIMENSIONS,
  resolveJewelleryLabelConfig,
} from "@/constants/jewelleryLabelTemplate";
import {
  isRanawatBlingPresetName,
} from "@/constants/ranawatBlingLabelTemplate";
import {
  isBoutiqueGridPresetName,
  BOUTIQUE_GRID_DIMENSIONS,
  resolveBoutiqueGridLabelConfig,
} from "@/constants/boutiqueGridLabelTemplate";

/**
 * Truly locked layouts (kidszone / jewellery): designer edits are discarded
 * and the hard-coded config is always used.
 *
 * Boutique Grid is NOT in this set — it is an opt-in labelStyle. Field
 * show/hide + font size must persist to printer_presets for Chirag testing.
 */
export function isFixedBuiltinLabelPreset(name: string | null | undefined): boolean {
  return isKidszonePresetName(name) || isJewelleryPresetName(name);
}

/** Hard-coded config for locked builtins only. Boutique uses resolveBoutiqueGridLabelConfig via resolvePresetLabelConfig. */
export function resolveFixedBuiltinLabelConfig(
  name: string | null | undefined,
): LabelDesignConfig | null {
  if (isKidszonePresetName(name)) return resolveKidszoneLabelConfig();
  if (isJewelleryPresetName(name)) return resolveJewelleryLabelConfig();
  return null;
}

/** Soft default dimensions for built-ins (including Boutique Grid 50×38). */
export function getFixedBuiltinLabelDimensions(
  name: string | null | undefined,
): { width: number; height: number } | null {
  if (isKidszonePresetName(name)) return { ...KIDSZONE_50X40_DIMENSIONS };
  if (isJewelleryPresetName(name)) return { ...JEWELLERY_100X15_DIMENSIONS };
  if (isBoutiqueGridPresetName(name)) return { ...BOUTIQUE_GRID_DIMENSIONS };
  // BLING JEWELLERY LABEL: layout defaults to 100×15 but dimensions are user-editable per org.
  return null;
}

export function fixedBuiltinPresetLabel(name: string | null | undefined): string | null {
  if (isKidszonePresetName(name)) return "kidszone (50×40mm) — fixed layout";
  if (isJewelleryPresetName(name)) return "Jewellery Tag (100×15mm 1UP) — fixed layout";
  if (isBoutiqueGridPresetName(name)) {
    return "Boutique Grid (50×38mm) — STYLE BOUTIQUE / KEY:VALUE";
  }
  if (isRanawatBlingPresetName(name)) return "BLING JEWELLERY LABEL (100×15mm default, editable)";
  return null;
}

/** Initial / Reset config for Boutique Grid built-in picker (editable after load). */
export function resolveBoutiqueBuiltinLabelConfig(
  name: string | null | undefined,
): LabelDesignConfig | null {
  if (isBoutiqueGridPresetName(name)) return resolveBoutiqueGridLabelConfig();
  return null;
}
