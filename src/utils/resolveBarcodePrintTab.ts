import { isStandardA4SheetType } from "@/utils/standardA4SheetType";

export type BarcodePrintTab = "standard" | "precision";

export type ResolveBarcodePrintTabInput = {
  /** Explicit tab from route state — only set when caller intentionally overrides */
  routeRequestedTab?: BarcodePrintTab | null;
  /** Settings → Barcode → Default Barcode Printing Tab */
  settingsDefaultBarTab?: "standard" | "precision" | "auto";
  /** bill_barcode_settings.precision_pro_enabled */
  precisionProEnabled?: boolean;
  /** Saved standard default format from barcode_label_settings */
  defaultFormat?: {
    sheetType?: string;
    customDimensions?: { width?: number; height?: number; cols?: number; rows?: number; gap?: number };
    defaultTemplate?: string | null;
  } | null;
  /** printer_presets rows for org */
  presets?: Array<{ isDefault?: boolean }> | null;
};

function hasA4SheetDefault(defaultFormat: ResolveBarcodePrintTabInput["defaultFormat"]): boolean {
  if (!defaultFormat?.sheetType) return false;
  return isStandardA4SheetType(defaultFormat.sheetType, defaultFormat.customDimensions);
}

/**
 * Match Settings → Barcode tab "Auto" rules:
 * - A4 sheet default → Standard Printing (laser) — always, even if thermal preset exists
 * - Precision Pro enabled or default thermal preset → Precision Pro (1-up / 2-up)
 * - Manual override in settings when valid (except A4 default always wins)
 */
export function resolveBarcodePrintTab(input: ResolveBarcodePrintTabInput): BarcodePrintTab {
  const {
    routeRequestedTab = null,
    settingsDefaultBarTab = "auto",
    precisionProEnabled = false,
    defaultFormat = null,
    presets = null,
  } = input;

  if (routeRequestedTab === "standard" || routeRequestedTab === "precision") {
    return routeRequestedTab;
  }

  const hasA4Default = hasA4SheetDefault(defaultFormat);
  const hasDefaultPreset = Array.isArray(presets) && presets.some((p) => p?.isDefault);
  const manualOverride: BarcodePrintTab | null =
    settingsDefaultBarTab === "standard" || settingsDefaultBarTab === "precision"
      ? settingsDefaultBarTab
      : null;

  // A4 sheet labels always use Standard Printing (purchase bill, dashboard, etc.)
  if (hasA4Default) {
    return "standard";
  }

  if (manualOverride === "precision" && (precisionProEnabled || hasDefaultPreset)) {
    return "precision";
  }
  if (manualOverride === "standard") {
    return "standard";
  }
  if (hasDefaultPreset || precisionProEnabled) {
    return "precision";
  }
  return "standard";
}
