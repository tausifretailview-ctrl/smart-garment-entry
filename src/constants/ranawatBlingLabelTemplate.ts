import type { LabelDesignConfig } from "@/types/labelTypes";

/** Canonical 100×15mm 1-Up Ranawat BLING jewellery/cosmetics tag. */
export const RANAWAT_BLING_TEMPLATE_NAME = "BLING JEWELLERY LABEL";

export const RANAWAT_BLING_PRESET_NAMES = [
  "bling jewellery label",
  "bling_jewellery_label",
  "ranawat bling",
  "ranawats bling",
] as const;

export const RANAWAT_BLING_100X15_DIMENSIONS = { width: 100, height: 15 } as const;

/** 5mm barcode height on a 15mm label ≈ slider 33. */
export const RANAWAT_BLING_BARCODE_HEIGHT_SLIDER = 33;

const hiddenField = { show: false, fontSize: 7, bold: false, x: 0, y: 0, width: 20 };

export const RANAWAT_BLING_LABEL_CONFIG: LabelDesignConfig = {
  businessName: {
    show: true,
    fontSize: 8,
    bold: true,
    x: 4,
    y: 1,
    width: 42,
    textAlign: "center",
  },
  barcode: {
    show: true,
    fontSize: 9,
    bold: false,
    x: 6,
    y: 4.5,
    width: 38,
    height: 5,
  },
  price: {
    show: true,
    fontSize: 10,
    bold: true,
    x: 4,
    y: 10.5,
    width: 42,
    textAlign: "center",
  },
  barcodeText: {
    show: true,
    fontSize: 7,
    bold: true,
    x: 50,
    y: 1,
    width: 48,
    textAlign: "right",
  },
  productName: {
    show: true,
    fontSize: 7,
    bold: false,
    x: 50,
    y: 4,
    width: 36,
    textAlign: "right",
    lineHeight: 1.1,
  },
  brand: {
    show: true,
    fontSize: 7,
    bold: true,
    x: 86,
    y: 7,
    width: 12,
    textAlign: "right",
  },
  purchaseCode: {
    show: true,
    fontSize: 7,
    bold: false,
    x: 50,
    y: 10.5,
    width: 24,
    textAlign: "left",
  },
  size: {
    show: true,
    fontSize: 7,
    bold: true,
    x: 86,
    y: 10.5,
    width: 12,
    textAlign: "right",
  },
  category: { ...hiddenField },
  color: { ...hiddenField },
  style: { ...hiddenField },
  mrp: { ...hiddenField },
  qty: { ...hiddenField },
  customText: { show: false, fontSize: 7, bold: false, x: 0, y: 0, width: 48, textAlign: "center" },
  billNumber: { show: false, fontSize: 6, bold: false, x: 0, y: 0, width: 20 },
  supplierCode: { show: false, fontSize: 6, bold: false, x: 0, y: 0, width: 24 },
  supplierInvoiceNo: { show: false, fontSize: 6, bold: false, x: 0, y: 0, width: 24 },
  fieldOrder: [
    "businessName",
    "barcode",
    "price",
    "barcodeText",
    "productName",
    "brand",
    "purchaseCode",
    "size",
  ],
  barcodeHeight: RANAWAT_BLING_BARCODE_HEIGHT_SLIDER,
  barcodeWidth: 1.5,
  customTextValue: "",
  customTextFields: [],
  lines: [],
};

export function normalizeRanawatBlingPresetName(name: string): string {
  return name.replace(/^preset:/i, "").trim().toLowerCase();
}

export function isRanawatBlingPresetName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = normalizeRanawatBlingPresetName(name);
  return (
    n === normalizeRanawatBlingPresetName(RANAWAT_BLING_TEMPLATE_NAME) ||
    RANAWAT_BLING_PRESET_NAMES.some((alias) => n === alias)
  );
}

export function isRanawatOrganization(
  slug: string | null | undefined,
  name?: string | null,
): boolean {
  const s = (slug || "").toLowerCase();
  const n = (name || "").toLowerCase();
  return s.includes("ranawat") || n.includes("ranawat");
}

export function resolveRanawatBlingLabelConfig(): LabelDesignConfig {
  return JSON.parse(JSON.stringify(RANAWAT_BLING_LABEL_CONFIG)) as LabelDesignConfig;
}
