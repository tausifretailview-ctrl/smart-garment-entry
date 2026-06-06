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
    customDimensions?: { width?: number; cols?: number; gap?: number };
    defaultTemplate?: string | null;
  } | null;
  /** printer_presets rows for org */
  presets?: Array<{ isDefault?: boolean }> | null;
};

function isA4SheetType(st: unknown, defaultFormat: ResolveBarcodePrintTabInput["defaultFormat"]): boolean {
  if (typeof st !== "string") return false;
  if (st.startsWith("a4_")) return true;
  if (st === "custom") {
    const dim = defaultFormat?.customDimensions;
    if (dim && Number(dim.width) > 0 && Number(dim.cols) > 0) {
      const totalWidth =
        Number(dim.width) * Number(dim.cols) + Number(dim.gap || 0) * (Number(dim.cols) - 1);
      if (totalWidth >= 180 && totalWidth <= 230) return true;
    }
  }
  return false;
}

/**
 * Match Settings → Barcode tab "Auto" rules:
 * - A4 sheet default → Standard Printing (laser)
 * - Precision Pro enabled or default thermal preset → Precision Pro (1-up / 2-up)
 * - Manual override in settings when valid
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

  const hasA4Default = !!defaultFormat && isA4SheetType(defaultFormat.sheetType, defaultFormat);
  const hasDefaultPreset = Array.isArray(presets) && presets.some((p) => p?.isDefault);
  const manualOverride: BarcodePrintTab | null =
    settingsDefaultBarTab === "standard" || settingsDefaultBarTab === "precision"
      ? settingsDefaultBarTab
      : null;

  if (manualOverride === "precision" && (precisionProEnabled || hasDefaultPreset)) {
    return "precision";
  }
  if (manualOverride === "standard") {
    return "standard";
  }
  if (hasA4Default) {
    return "standard";
  }
  if (hasDefaultPreset || precisionProEnabled) {
    return "precision";
  }
  return "standard";
}
