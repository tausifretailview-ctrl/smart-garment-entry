import type { LabelDesignConfig } from "@/types/labelTypes";
import { LABEL_STYLE_BOUTIQUE_GRID } from "@/types/labelTypes";

/** Opt-in STYLE BOUTIQUE / BarTender-style grid — never auto-selected for existing orgs. */
export const BOUTIQUE_GRID_PRESET_NAMES = [
  "boutique grid",
  "boutique-grid",
  "style boutique",
  "grid condensed",
] as const;

export const BOUTIQUE_GRID_DIMENSIONS = { width: 50, height: 38 } as const;

/**
 * Config for Boutique Grid. Field x/y are unused by the boutique renderer
 * (fixed KEY:VALUE layout); show flags control which rows appear.
 * labelStyle MUST be boutique-grid — that is the only opt-in switch.
 */
export const BOUTIQUE_GRID_LABEL_CONFIG: LabelDesignConfig = {
  labelStyle: LABEL_STYLE_BOUTIQUE_GRID,
  businessName: {
    show: true,
    fontSize: 11,
    bold: true,
    x: 1,
    y: 0.5,
    width: 42,
    textAlign: "center",
  },
  brand: { show: true, fontSize: 8, bold: true, x: 1, y: 8, width: 40 },
  productName: { show: true, fontSize: 8, bold: true, x: 1, y: 4, width: 40 },
  category: { show: false, fontSize: 8, bold: true, x: 1, y: 10, width: 40 },
  color: { show: true, fontSize: 8, bold: true, x: 1, y: 12, width: 40 },
  style: { show: true, fontSize: 8, bold: true, x: 1, y: 6, width: 40 },
  size: { show: true, fontSize: 8, bold: true, x: 1, y: 14, width: 40 },
  price: { show: false, fontSize: 8, bold: true, x: 1, y: 16, width: 40 },
  mrp: { show: true, fontSize: 12, bold: true, x: 1, y: 16, width: 40 },
  qty: { show: false, fontSize: 7, bold: false, x: 1, y: 18, width: 20 },
  customText: { show: false, fontSize: 7, bold: false, x: 1, y: 34, width: 40, textAlign: "center" },
  barcode: { show: true, fontSize: 9, bold: false, x: 2, y: 20, width: 40, height: 10 },
  barcodeText: { show: true, fontSize: 8, bold: true, x: 1, y: 31, width: 40, textAlign: "center" },
  billNumber: { show: false, fontSize: 6, bold: false, x: 1, y: 34, width: 20 },
  supplierCode: { show: false, fontSize: 6, bold: false, x: 25, y: 34, width: 20 },
  purchaseCode: { show: true, fontSize: 7, bold: true, x: 44, y: 8, width: 5 },
  supplierInvoiceNo: { show: false, fontSize: 6, bold: false, x: 25, y: 35, width: 20 },
  fieldOrder: [
    "businessName",
    "productName",
    "style",
    "brand",
    "color",
    "size",
    "mrp",
    "barcode",
    "barcodeText",
    "purchaseCode",
    "category",
    "price",
    "qty",
    "customText",
    "billNumber",
    "supplierCode",
    "supplierInvoiceNo",
  ],
  barcodeHeight: 28,
  barcodeWidth: 2,
  customTextValue: "",
  customTextFields: [],
  lines: [],
};

export function normalizeBoutiquePresetName(name: string): string {
  return name.replace(/^preset:/i, "").trim().toLowerCase();
}

export function isBoutiqueGridPresetName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = normalizeBoutiquePresetName(name);
  // Exact aliases only — never prefix-match, so an org preset named e.g.
  // "Boutique Sale" is NOT forced onto the boutique-grid renderer.
  return BOUTIQUE_GRID_PRESET_NAMES.some((alias) => n === alias);
}

export function resolveBoutiqueGridLabelConfig(): LabelDesignConfig {
  return JSON.parse(JSON.stringify(BOUTIQUE_GRID_LABEL_CONFIG)) as LabelDesignConfig;
}
