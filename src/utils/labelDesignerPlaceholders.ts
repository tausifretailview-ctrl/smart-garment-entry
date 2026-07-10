import { getUOMLabel } from "@/constants/uom";
import type { FieldKey, LabelDesignConfig, LabelItem } from "@/types/labelTypes";

export const DEFAULT_LABEL_FIELD_LABELS: Record<FieldKey, string> = {
  businessName: "Business Name",
  brand: "Brand",
  productName: "Product Name",
  category: "Category",
  color: "Color",
  style: "Style",
  size: "Size",
  price: "Sale Price",
  mrp: "MRP",
  qty: "Qty",
  customText: "Custom Text",
  barcode: "Barcode",
  barcodeText: "Barcode Text",
  billNumber: "Bill Number",
  supplierCode: "Supplier Code",
  purchaseCode: "Purchase Code",
  supplierInvoiceNo: "Supplier Invoice No",
};

const CONFIG_META_KEYS = new Set([
  "fieldOrder",
  "barcodeHeight",
  "barcodeWidth",
  "customTextValue",
  "customTextFields",
  "lines",
]);

export function isDesignerFieldKey(key: string): key is FieldKey {
  return !CONFIG_META_KEYS.has(key);
}

export function getLabelFieldRawContent(
  key: FieldKey,
  item: LabelItem,
  options?: { customTextValue?: string; businessName?: string },
): string {
  const businessName = options?.businessName ?? item.businessName ?? "";
  switch (key) {
    case "productName":
      return (item.product_name || "").toUpperCase();
    case "brand":
      return item.brand || "";
    case "category":
      return item.category || "";
    case "color":
      return item.color || "";
    case "style":
      return item.style || "";
    case "size":
      return item.size || "";
    case "price":
      return item.sale_price != null && !Number.isNaN(Number(item.sale_price))
        ? `Rs.${item.sale_price}`
        : "";
    case "qty":
      return item.qty ? `${item.qty} ${getUOMLabel(item.uom)}` : "";
    case "mrp":
      return item.mrp != null && !Number.isNaN(Number(item.mrp)) ? `MRP: ${item.mrp}` : "";
    case "barcodeText":
      return item.barcode || "";
    case "billNumber":
      return item.bill_number || "";
    case "supplierCode":
      return item.supplier_code || "";
    case "purchaseCode":
      return item.purchase_code || "";
    case "customText":
      return options?.customTextValue || "";
    case "businessName":
      return businessName;
    case "supplierInvoiceNo":
      return item.supplier_invoice_no ? `Inv: ${item.supplier_invoice_no}` : "";
    default:
      return "";
  }
}

export function isLabelFieldDataEmpty(
  key: FieldKey,
  item: LabelItem,
  options?: { customTextValue?: string; businessName?: string },
): boolean {
  const businessName = options?.businessName ?? item.businessName ?? "";
  switch (key) {
    case "productName":
      return !item.product_name?.trim();
    case "brand":
      return !item.brand?.trim();
    case "category":
      return !item.category?.trim();
    case "color":
      return !item.color?.trim();
    case "style":
      return !item.style?.trim();
    case "size":
      return !item.size?.trim();
    case "price":
      return item.sale_price == null || Number.isNaN(Number(item.sale_price));
    case "qty":
      return !item.qty;
    case "mrp":
      return item.mrp == null || Number.isNaN(Number(item.mrp));
    case "barcodeText":
      return !item.barcode?.trim();
    case "billNumber":
      return !item.bill_number?.trim();
    case "supplierCode":
      return !item.supplier_code?.trim();
    case "purchaseCode":
      return !item.purchase_code?.trim();
    case "customText":
      return !options?.customTextValue?.trim();
    case "businessName":
      return !businessName.trim();
    case "supplierInvoiceNo":
      return !item.supplier_invoice_no?.trim();
    default:
      return true;
  }
}

export function resolveLabelDesignerFieldLabel(
  key: FieldKey,
  fieldLabels?: Partial<Record<FieldKey, string>>,
  defaultUom?: string,
): string {
  if (key === "qty" && defaultUom) {
    return fieldLabels?.qty ?? `Qty (${getUOMLabel(defaultUom)})`;
  }
  return fieldLabels?.[key] ?? DEFAULT_LABEL_FIELD_LABELS[key] ?? key;
}

export function getLabelDesignerFieldDisplay(
  key: FieldKey,
  item: LabelItem,
  options?: {
    customTextValue?: string;
    businessName?: string;
    fieldLabels?: Partial<Record<FieldKey, string>>;
    defaultUom?: string;
  },
): { text: string; isPlaceholder: boolean } {
  const isPlaceholder = isLabelFieldDataEmpty(key, item, options);
  const text = isPlaceholder
    ? resolveLabelDesignerFieldLabel(key, options?.fieldLabels, options?.defaultUom)
    : getLabelFieldRawContent(key, item, options);
  return { text, isPlaceholder };
}

/** Enabled designer fields in fieldOrder, plus any show:true fields missing from order. */
export function collectEnabledDesignerFieldKeys(
  config: LabelDesignConfig,
  options?: { excludeBarcode?: boolean; skipLegacyCustomText?: boolean },
): FieldKey[] {
  const fallbackOrder = (Object.keys(config).filter(isDesignerFieldKey) as FieldKey[]);
  const order = config.fieldOrder?.length ? config.fieldOrder : fallbackOrder;

  const isEnabled = (key: FieldKey) => {
    if (options?.excludeBarcode && key === "barcode") return false;
    if (options?.skipLegacyCustomText && key === "customText") return false;
    return config[key]?.show === true;
  };

  const fromOrder = order.filter((key) => isEnabled(key));
  const extra = fallbackOrder.filter((key) => !order.includes(key) && isEnabled(key));
  return [...fromOrder, ...extra];
}
