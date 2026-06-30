import type { LabelDesignConfig } from "@/types/labelTypes";

/** Canonical 100×15mm 1-Up jewellery tag — fixed layout on every PC/login. */
export const JEWELLERY_PRESET_NAMES = [
  "jewellery",
  "jewelry",
  "jewellery tag",
  "jewellery 100x15",
  "jewellery_100x15",
] as const;

export const JEWELLERY_100X15_DIMENSIONS = { width: 100, height: 15 } as const;

export const JEWELLERY_100X15_LABEL_CONFIG: LabelDesignConfig = {
  businessName: { show: false, fontSize: 6, bold: true, x: 1, y: 0, width: 48, textAlign: "left" },
  brand: { show: false, fontSize: 7, bold: true, x: 1, y: 0.3, width: 48, textAlign: "left" },
  productName: { show: false, fontSize: 7, bold: true, x: 1, y: 3.5, width: 48, textAlign: "left" },
  category: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 20 },
  color: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 20 },
  style: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 20 },
  size: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 15 },
  mrp: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 20 },
  price: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 20 },
  qty: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 20 },
  customText: { show: false, fontSize: 6, bold: false, x: 1, y: 6, width: 48, textAlign: "center" },
  barcode: {
    show: true,
    fontSize: 6,
    bold: false,
    x: 1,
    y: 7.5,
    width: 52,
    height: 6,
  },
  barcodeText: { show: false, fontSize: 5, bold: false, x: 1, y: 13, width: 52, textAlign: "left" },
  billNumber: { show: false, fontSize: 5, bold: false, x: 1, y: 13, width: 20 },
  supplierCode: { show: false, fontSize: 5, bold: false, x: 1, y: 13, width: 24 },
  purchaseCode: { show: false, fontSize: 5, bold: false, x: 1, y: 13, width: 20 },
  supplierInvoiceNo: { show: false, fontSize: 5, bold: false, x: 1, y: 13, width: 24 },
  fieldOrder: [
    "businessName",
    "brand",
    "productName",
    "barcode",
    "barcodeText",
    "category",
    "color",
    "style",
    "size",
    "mrp",
    "price",
    "qty",
    "customText",
    "billNumber",
    "supplierCode",
    "purchaseCode",
    "supplierInvoiceNo",
  ],
  barcodeHeight: 18,
  barcodeWidth: 1.1,
  customTextValue: "",
  customTextFields: [
    {
      id: "jewellery-header-1",
      value: "JEWELLERY",
      show: true,
      fontSize: 7,
      bold: true,
      textAlign: "left",
      x: 1,
      y: 0.3,
      width: 48,
    },
    {
      id: "jewellery-header-2",
      value: "TAGS",
      show: true,
      fontSize: 7,
      bold: true,
      textAlign: "left",
      x: 1,
      y: 3.5,
      width: 48,
    },
    {
      id: "jewellery-gwt",
      value: "G wt.: 0.0000",
      show: true,
      fontSize: 6,
      bold: false,
      textAlign: "right",
      x: 58,
      y: 0.5,
      width: 40,
    },
    {
      id: "jewellery-lwt",
      value: "L wt.: 0.0000",
      show: true,
      fontSize: 6,
      bold: false,
      textAlign: "right",
      x: 58,
      y: 5,
      width: 40,
    },
    {
      id: "jewellery-nwt",
      value: "N wt.: 0.0000",
      show: true,
      fontSize: 6,
      bold: false,
      textAlign: "right",
      x: 58,
      y: 9.5,
      width: 40,
    },
  ],
  lines: [],
};

export function normalizeJewelleryPresetName(name: string): string {
  return name.replace(/^preset:/i, "").trim().toLowerCase();
}

export function isJewelleryPresetName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = normalizeJewelleryPresetName(name);
  return JEWELLERY_PRESET_NAMES.some((alias) => n === alias || n.startsWith("jewellery"));
}

export function resolveJewelleryLabelConfig(): LabelDesignConfig {
  return JSON.parse(JSON.stringify(JEWELLERY_100X15_LABEL_CONFIG)) as LabelDesignConfig;
}
