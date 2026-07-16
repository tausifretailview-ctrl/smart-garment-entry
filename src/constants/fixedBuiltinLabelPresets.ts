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

export function isFixedBuiltinLabelPreset(name: string | null | undefined): boolean {
  return isKidszonePresetName(name) || isJewelleryPresetName(name);
}

export function resolveFixedBuiltinLabelConfig(
  name: string | null | undefined,
): LabelDesignConfig | null {
  if (isKidszonePresetName(name)) return resolveKidszoneLabelConfig();
  if (isJewelleryPresetName(name)) return resolveJewelleryLabelConfig();
  return null;
}

export function getFixedBuiltinLabelDimensions(
  name: string | null | undefined,
): { width: number; height: number } | null {
  if (isKidszonePresetName(name)) return { ...KIDSZONE_50X40_DIMENSIONS };
  if (isJewelleryPresetName(name)) return { ...JEWELLERY_100X15_DIMENSIONS };
  // BLING JEWELLERY LABEL: layout defaults to 100×15 but dimensions are user-editable per org.
  return null;
}

export function fixedBuiltinPresetLabel(name: string | null | undefined): string | null {
  if (isKidszonePresetName(name)) return "kidszone (50×40mm) — fixed layout";
  if (isJewelleryPresetName(name)) return "Jewellery Tag (100×15mm 1UP) — fixed layout";
  if (isRanawatBlingPresetName(name)) return "BLING JEWELLERY LABEL (100×15mm default, editable)";
  return null;
}
