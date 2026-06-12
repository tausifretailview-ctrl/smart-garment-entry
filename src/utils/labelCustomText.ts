import type { CustomTextSlot, LabelDesignConfig } from "@/types/labelTypes";

export function createCustomTextId(): string {
  return `ct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function legacyCustomTextSlot(config: Partial<LabelDesignConfig>): CustomTextSlot | null {
  const value = config.customTextValue?.trim() ?? "";
  const show = config.customText?.show ?? false;
  if (!show && !value) return null;

  return {
    id: "legacy-custom-text",
    value: config.customTextValue ?? "",
    show,
    fontSize: config.customText?.fontSize ?? 7,
    bold: config.customText?.bold ?? false,
    strikethrough: config.customText?.strikethrough,
    strikethroughWidth: config.customText?.strikethroughWidth,
    strikethroughThickness: config.customText?.strikethroughThickness,
    strikethroughOffsetY: config.customText?.strikethroughOffsetY,
    textAlign: config.customText?.textAlign ?? "center",
    x: config.customText?.x ?? 1,
    y: config.customText?.y ?? 22,
    width: config.customText?.width ?? 48,
  };
}

/** Read custom text slots, migrating legacy single customText when needed. */
export function getCustomTextFields(config: LabelDesignConfig): CustomTextSlot[] {
  if (config.customTextFields !== undefined) {
    return config.customTextFields;
  }
  const legacy = legacyCustomTextSlot(config);
  return legacy ? [legacy] : [];
}

/** True when label uses customTextFields array (or legacy custom text to migrate). */
export function usesCustomTextFields(config: LabelDesignConfig): boolean {
  if (config.customTextFields !== undefined) return true;
  return !!legacyCustomTextSlot(config);
}

export function migrateCustomTextFields(config: Partial<LabelDesignConfig>): CustomTextSlot[] {
  if (config.customTextFields !== undefined) {
    return config.customTextFields;
  }
  const legacy = legacyCustomTextSlot(config);
  return legacy ? [legacy] : [];
}

export function createCustomTextSlot(
  existing: CustomTextSlot[],
  labelWidth: number,
  labelHeight: number,
): CustomTextSlot {
  const index = existing.length;
  const yStep = 3;
  const baseY = Math.min(labelHeight - 4, 8 + index * yStep);

  return {
    id: createCustomTextId(),
    value: "",
    show: true,
    fontSize: 7,
    bold: false,
    textAlign: "center",
    x: 1,
    y: baseY,
    width: Math.max(10, labelWidth - 2),
  };
}
