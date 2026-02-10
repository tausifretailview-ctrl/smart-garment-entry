export interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
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
  customText: LabelFieldConfig;
  barcode: LabelFieldConfig;
  barcodeText: LabelFieldConfig;
  billNumber: LabelFieldConfig;
  supplierCode: LabelFieldConfig;
  purchaseCode: LabelFieldConfig;
  fieldOrder: Array<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>>;
  barcodeHeight?: number;
  barcodeWidth?: number;
  customTextValue?: string;
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
  purchase_code?: string;
  bill_date?: string;
  barcode: string;
  bill_number: string;
  qty?: number;
  supplier_code?: string;
}

export interface LabelTemplate {
  name: string;
  config: LabelDesignConfig;
  labelWidth?: number;  // Label dimensions the template was designed for
  labelHeight?: number; // Used for auto-scaling when loading on different sizes
}

export type FieldKey = keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth' | 'customTextValue'>;
