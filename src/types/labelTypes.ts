export interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
  strikethrough?: boolean;
  strikethroughWidth?: number;  // percentage of field width (default 100)
  strikethroughThickness?: number;  // in px (default 1)
  strikethroughOffsetY?: number;  // vertical offset in % from center (default 0)
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  lineHeight?: number;
  row?: number;
}

export interface LabelLineConfig {
  show: boolean;
  x: number;
  y: number;
  length: number;
  thickness: number;
  orientation: 'horizontal' | 'vertical';
}

/** Independent custom text slot — multiple allowed per precision label. */
export interface CustomTextSlot {
  id: string;
  value: string;
  show: boolean;
  fontSize: number;
  bold: boolean;
  strikethrough?: boolean;
  strikethroughWidth?: number;
  strikethroughThickness?: number;
  strikethroughOffsetY?: number;
  textAlign?: 'left' | 'center' | 'right';
  x: number;
  y: number;
  width: number;
}

/** Opt-in layout engines. Missing / "default" = legacy absolute-field renderer (unchanged). */
export type LabelLayoutStyle = "default" | "boutique-grid";

export const LABEL_STYLE_DEFAULT = "default" as const;
export const LABEL_STYLE_BOUTIQUE_GRID = "boutique-grid" as const;

/** True only when the design explicitly opted into Boutique Grid. */
export function isBoutiqueGridLabelStyle(
  config: { labelStyle?: LabelLayoutStyle | string | null } | null | undefined,
): boolean {
  return config?.labelStyle === LABEL_STYLE_BOUTIQUE_GRID;
}

export interface LabelDesignConfig {
  brand: LabelFieldConfig;
  businessName: LabelFieldConfig;
  productName: LabelFieldConfig;
  category: LabelFieldConfig;
  color: LabelFieldConfig;
  style: LabelFieldConfig;
  size: LabelFieldConfig;
  price: LabelFieldConfig;
  mrp: LabelFieldConfig;
  qty: LabelFieldConfig;
  customText: LabelFieldConfig;
  barcode: LabelFieldConfig;
  barcodeText: LabelFieldConfig;
  billNumber: LabelFieldConfig;
  supplierCode: LabelFieldConfig;
  purchaseCode: LabelFieldConfig;
  supplierInvoiceNo?: LabelFieldConfig;
  fieldOrder: Array<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue' | 'customTextFields' | 'lines' | 'labelStyle'>>;
  barcodeHeight?: number;
  barcodeWidth?: number;
  /** @deprecated Use customTextFields — kept for legacy templates */
  customTextValue?: string;
  customTextFields?: CustomTextSlot[];
  lines?: LabelLineConfig[];
  /**
   * Layout engine. Omit or "default" keeps the existing absolute-position renderer
   * so every saved org preset stays byte-identical. Only "boutique-grid" opts in.
   */
  labelStyle?: LabelLayoutStyle;
}

export interface LabelItem {
  sku_id?: string;
  product_name: string;
  brand: string;
  category: string;
  color: string;
  style: string;
  size: string;
  sale_price: number;
  mrp?: number;
  pur_price?: number;
  gst_per?: number;
  purchase_code?: string;
  bill_date?: string;
  barcode: string;
  businessName?: string;
  bill_number: string;
  qty?: number;
  uom?: string;
  supplier_code?: string;
  supplier_invoice_no?: string;
}

export interface LabelTemplate {
  name: string;
  config: LabelDesignConfig;
  labelWidth?: number;  // Label dimensions the template was designed for
  labelHeight?: number; // Used for auto-scaling when loading on different sizes
}

export type FieldKey = keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue' | 'customTextFields' | 'lines' | 'labelStyle'>;
