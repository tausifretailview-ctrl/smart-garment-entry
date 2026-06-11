import type { LabelDesignConfig, LabelFieldConfig } from "@/types/labelTypes";

/** Canonical 50×40mm 1-Up Kids Zone label — same layout on every PC/login. */
export const KIDSZONE_PRESET_NAMES = ["kidszone", "kids zone", "kids-zone"] as const;

export const KIDSZONE_50X40_DIMENSIONS = { width: 50, height: 40 } as const;

export const KIDSZONE_50X40_LABEL_CONFIG: LabelDesignConfig = {
  businessName: {
    show: true,
    fontSize: 8,
    bold: true,
    x: 0.5,
    y: 3,
    width: 49,
    textAlign: "center",
  },
  brand: {
    show: true,
    fontSize: 8,
    bold: true,
    x: 0,
    y: 7.5,
    width: 50,
    textAlign: "center",
  },
  productName: {
    show: true,
    fontSize: 9,
    bold: true,
    x: 1.5,
    y: 12.5,
    width: 47,
    textAlign: "center",
  },
  category: { show: false, fontSize: 7, bold: false, x: 1, y: 16, width: 20 },
  color: { show: false, fontSize: 7, bold: false, x: 1, y: 16, width: 20 },
  style: {
    show: true,
    fontSize: 7,
    bold: false,
    x: 2,
    y: 20.5,
    width: 22,
    textAlign: "left",
  },
  size: {
    show: true,
    fontSize: 8,
    bold: true,
    x: 2,
    y: 17,
    width: 15,
    textAlign: "left",
  },
  mrp: {
    show: true,
    fontSize: 8,
    bold: true,
    x: 28,
    y: 17,
    width: 20,
    textAlign: "right",
  },
  price: {
    show: true,
    fontSize: 9,
    bold: true,
    x: 28,
    y: 20.5,
    width: 20,
    textAlign: "right",
  },
  qty: { show: false, fontSize: 7, bold: false, x: 1, y: 23, width: 20 },
  customText: { show: false, fontSize: 7, bold: false, x: 1, y: 36, width: 48, textAlign: "center" },
  barcode: {
    show: true,
    fontSize: 9,
    bold: false,
    x: 3,
    y: 24,
    width: 44,
    height: 7,
  },
  barcodeText: {
    show: true,
    fontSize: 7,
    bold: false,
    x: 1,
    y: 31.5,
    width: 48,
    textAlign: "center",
  },
  billNumber: { show: false, fontSize: 6, bold: false, x: 1, y: 34, width: 20 },
  supplierCode: { show: false, fontSize: 6, bold: false, x: 25, y: 34, width: 24 },
  purchaseCode: { show: false, fontSize: 6, bold: false, x: 1, y: 35, width: 20 },
  supplierInvoiceNo: { show: false, fontSize: 6, bold: false, x: 25, y: 35, width: 24 },
  fieldOrder: [
    "businessName",
    "brand",
    "productName",
    "size",
    "style",
    "mrp",
    "price",
    "barcode",
    "barcodeText",
    "category",
    "color",
    "qty",
    "customText",
    "billNumber",
    "supplierCode",
    "purchaseCode",
    "supplierInvoiceNo",
  ],
  barcodeHeight: 28,
  barcodeWidth: 2.2,
  customTextValue: "",
  lines: [],
};

export function normalizePresetName(name: string): string {
  return name.replace(/^preset:/i, "").trim().toLowerCase();
}

export function isKidszonePresetName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = normalizePresetName(name);
  return KIDSZONE_PRESET_NAMES.some((alias) => n === alias || n.startsWith("kidszone"));
}

/** Canonical Kids Zone layout — identical on every PC (ignores stale/partial DB configs). */
export function resolveKidszoneLabelConfig(): LabelDesignConfig {
  return JSON.parse(JSON.stringify(KIDSZONE_50X40_LABEL_CONFIG)) as LabelDesignConfig;
}
