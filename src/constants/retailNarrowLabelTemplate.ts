import type { LabelDesignConfig } from "@/types/labelTypes";
import { LABEL_NARROW_FONT_FAMILY } from "@/utils/labelFontFace";

/**
 * "Retail Narrow" — editable starting design for 50×25mm thermal roll tags
 * in the condensed (Arial Narrow / bundled EzzyNarrow) face.
 *
 * Unlike kidszone/jewellery this is NOT a locked layout: it is a starting
 * point the shop can edit, save as their own template, and re-tune. Every
 * text field ships with the narrow stack; bold is ON for businessName,
 * price and size, OFF for mrp, saleDiscPercent, category, style,
 * supplierCode and barcodeText.
 */
export const RETAIL_NARROW_TEMPLATE_NAME = "Retail Narrow";

export const RETAIL_NARROW_PRESET_NAMES = [
  "retail narrow",
  "retail-narrow",
  "narrow retail",
] as const;

export const RETAIL_NARROW_50X25_DIMENSIONS = { width: 50, height: 25 } as const;

/** Barcode graphic height on a 25mm label ≈ slider 20. */
export const RETAIL_NARROW_BARCODE_HEIGHT_SLIDER = 20;

/** Narrow stack on a text field; bold varies per field below. */
const narrow = (
  field: Omit<
    LabelDesignConfig["price"],
    "fontFamily"
  >,
): LabelDesignConfig["price"] => ({
  ...field,
  fontFamily: LABEL_NARROW_FONT_FAMILY,
});

const hiddenNarrow = {
  show: false,
  fontSize: 7,
  bold: false,
  x: 0,
  y: 0,
  width: 20,
  fontFamily: LABEL_NARROW_FONT_FAMILY,
};

export const RETAIL_NARROW_LABEL_CONFIG: LabelDesignConfig = {
  businessName: narrow({
    show: true,
    fontSize: 8,
    bold: true,
    x: 1,
    y: 0.5,
    width: 48,
    textAlign: "center",
  }),
  brand: narrow({
    show: true,
    fontSize: 7,
    bold: true,
    x: 1,
    y: 3.5,
    width: 23,
    textAlign: "left",
  }),
  size: narrow({
    show: true,
    fontSize: 8,
    bold: true,
    x: 26,
    y: 3.5,
    width: 23,
    textAlign: "right",
  }),
  productName: narrow({
    show: true,
    fontSize: 8,
    bold: true,
    x: 1,
    y: 6.5,
    width: 48,
    textAlign: "center",
  }),
  category: narrow({
    show: true,
    fontSize: 7,
    bold: false,
    x: 1,
    y: 9.5,
    width: 23,
    textAlign: "left",
  }),
  style: narrow({
    show: true,
    fontSize: 7,
    bold: false,
    x: 26,
    y: 9.5,
    width: 23,
    textAlign: "right",
  }),
  color: narrow({
    // Hidden by default: shares the category/style row (y 9.5) on a 25mm tag.
    show: false,
    fontSize: 7,
    bold: true,
    x: 1,
    y: 9.5,
    width: 48,
    textAlign: "center",
  }),
  mrp: narrow({
    show: true,
    fontSize: 8,
    bold: false,
    x: 1,
    y: 12,
    width: 23,
    textAlign: "left",
  }),
  saleDiscPercent: narrow({
    show: true,
    fontSize: 8,
    bold: false,
    x: 26,
    y: 12,
    width: 23,
    textAlign: "right",
  }),
  price: narrow({
    show: true,
    fontSize: 11,
    bold: true,
    x: 1,
    y: 14.5,
    width: 48,
    textAlign: "center",
  }),
  barcode: {
    show: true,
    fontSize: 9,
    bold: false,
    x: 2,
    y: 17.5,
    width: 46,
    height: 5,
    fontFamily: LABEL_NARROW_FONT_FAMILY,
  },
  barcodeText: narrow({
    show: true,
    fontSize: 7,
    bold: false,
    x: 1,
    y: 22.5,
    width: 48,
    textAlign: "center",
  }),
  qty: narrow({
    show: false,
    fontSize: 7,
    bold: false,
    x: 1,
    y: 18,
    width: 20,
  }),
  customText: narrow({
    show: false,
    fontSize: 7,
    bold: false,
    x: 1,
    y: 34,
    width: 40,
    textAlign: "center",
  }),
  billNumber: narrow({
    show: false,
    fontSize: 6,
    bold: false,
    x: 1,
    y: 34,
    width: 20,
  }),
  supplierCode: narrow({
    show: false,
    fontSize: 6,
    bold: false,
    x: 25,
    y: 34,
    width: 20,
  }),
  purchaseCode: narrow({
    show: true,
    fontSize: 7,
    bold: true,
    x: 44,
    y: 8,
    width: 5,
  }),
  supplierInvoiceNo: narrow({
    show: false,
    fontSize: 6,
    bold: false,
    x: 25,
    y: 35,
    width: 20,
  }),
  fieldOrder: [
    "businessName",
    "brand",
    "size",
    "productName",
    "category",
    "style",
    "color",
    "mrp",
    "saleDiscPercent",
    "price",
    "barcode",
    "barcodeText",
    "purchaseCode",
    "qty",
    "customText",
    "billNumber",
    "supplierCode",
    "supplierInvoiceNo",
  ],
  barcodeHeight: RETAIL_NARROW_BARCODE_HEIGHT_SLIDER,
  barcodeWidth: 2,
  customTextValue: "",
  customTextFields: [],
  lines: [],
};

export function normalizeRetailNarrowPresetName(name: string): string {
  return name.replace(/^preset:/i, "").trim().toLowerCase();
}

export function isRetailNarrowPresetName(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  const n = normalizeRetailNarrowPresetName(name);
  return (
    n === normalizeRetailNarrowPresetName(RETAIL_NARROW_TEMPLATE_NAME) ||
    (RETAIL_NARROW_PRESET_NAMES as readonly string[]).some(
      (alias) => n === alias,
    )
  );
}

export function resolveRetailNarrowLabelConfig(): LabelDesignConfig {
  return JSON.parse(JSON.stringify(RETAIL_NARROW_LABEL_CONFIG)) as LabelDesignConfig;
}
