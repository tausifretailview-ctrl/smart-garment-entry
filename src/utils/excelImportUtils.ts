import * as XLSX from 'xlsx';

export interface TargetField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'optional';
  required?: boolean;
}

export interface FieldMapping {
  excelColumn: string;
  systemField: string | null;
  sampleValue: string;
}

export interface ParsedExcelData {
  headers: string[];
  rows: Record<string, any>[];
  sampleValues: Record<string, string>;
}

export const purchaseBillFields: TargetField[] = [
  { key: 'product_name', label: 'Product Name', type: 'text', required: true },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'style', label: 'Style', type: 'text' },
  { key: 'color', label: 'Color', type: 'text' },
  { key: 'hsn_code', label: 'HSN Code', type: 'text' },
  { key: 'gst_per', label: 'GST %', type: 'number', required: true },
  { key: 'size', label: 'Size', type: 'text', required: true },
  { key: 'barcode', label: 'Barcode', type: 'text' },
  { key: 'pur_price', label: 'Purchase Price', type: 'number', required: true },
  { key: 'sale_price', label: 'Sale Price', type: 'number', required: true },
  { key: 'qty', label: 'Quantity', type: 'number', required: true },
];

export const productEntryFields: TargetField[] = [
  { key: 'product_name', label: 'Product Name', type: 'text', required: true },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'style', label: 'Style', type: 'text' },
  { key: 'color', label: 'Color', type: 'text' },
  { key: 'hsn_code', label: 'HSN Code', type: 'text' },
  { key: 'gst_per', label: 'GST %', type: 'number' },
  { key: 'size', label: 'Size', type: 'text', required: true },
  { key: 'barcode', label: 'Barcode', type: 'text' },
  { key: 'default_pur_price', label: 'Purchase Price', type: 'number' },
  { key: 'default_sale_price', label: 'Sale Price', type: 'number' },
  { key: 'opening_qty', label: 'Opening Qty', type: 'number' },
];

export const parseExcelFile = (file: File): Promise<ParsedExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        
        if (jsonData.length === 0) {
          reject(new Error('Excel file is empty'));
          return;
        }

        const headers = Object.keys(jsonData[0]);
        const sampleValues: Record<string, string> = {};
        
        headers.forEach(header => {
          const firstNonEmpty = jsonData.find(row => row[header] !== '' && row[header] !== null && row[header] !== undefined);
          sampleValues[header] = firstNonEmpty ? String(firstNonEmpty[header]) : '';
        });

        resolve({
          headers,
          rows: jsonData,
          sampleValues,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
};

export const autoMapFields = (
  excelHeaders: string[],
  targetFields: TargetField[]
): Record<string, string | null> => {
  const mappings: Record<string, string | null> = {};
  
  const normalizeString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  const fieldAliases: Record<string, string[]> = {
    product_name: ['product', 'productname', 'name', 'item', 'itemname', 'description'],
    category: ['category', 'cat', 'type', 'producttype'],
    brand: ['brand', 'brandname', 'make', 'manufacturer'],
    style: ['style', 'stylename', 'model'],
    color: ['color', 'colour', 'clr'],
    hsn_code: ['hsn', 'hsncode', 'hsnno', 'saccode'],
    gst_per: ['gst', 'gstper', 'gstpercent', 'gstrate', 'tax', 'taxrate'],
    size: ['size', 'sz', 'productsize'],
    barcode: ['barcode', 'bar', 'sku', 'ean', 'upc', 'productcode', 'itemcode'],
    pur_price: ['purprice', 'purchaseprice', 'cost', 'costprice', 'buyingprice', 'pp', 'cp'],
    sale_price: ['saleprice', 'sellingprice', 'mrp', 'sp', 'price', 'retailprice'],
    qty: ['qty', 'quantity', 'stock', 'units', 'pcs', 'pieces'],
    default_pur_price: ['purprice', 'purchaseprice', 'cost', 'costprice', 'buyingprice', 'pp', 'cp'],
    default_sale_price: ['saleprice', 'sellingprice', 'mrp', 'sp', 'price', 'retailprice'],
    opening_qty: ['openingqty', 'openingstock', 'opening', 'initialqty', 'initialstock', 'qty', 'quantity'],
  };

  excelHeaders.forEach(header => {
    const normalizedHeader = normalizeString(header);
    let matched = false;

    for (const field of targetFields) {
      const aliases = fieldAliases[field.key] || [normalizeString(field.key)];
      if (aliases.includes(normalizedHeader) || normalizedHeader.includes(normalizeString(field.key))) {
        mappings[header] = field.key;
        matched = true;
        break;
      }
    }

    if (!matched) {
      mappings[header] = null;
    }
  });

  return mappings;
};

export const applyMappings = (
  rows: Record<string, any>[],
  mappings: Record<string, string | null>
): Record<string, any>[] => {
  return rows.map(row => {
    const mappedRow: Record<string, any> = {};
    
    Object.entries(mappings).forEach(([excelCol, systemField]) => {
      if (systemField) {
        mappedRow[systemField] = row[excelCol];
      }
    });
    
    return mappedRow;
  });
};

export const validateMappedData = (
  mappedData: Record<string, any>[],
  targetFields: TargetField[]
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const requiredFields = targetFields.filter(f => f.required);

  requiredFields.forEach(field => {
    const hasValue = mappedData.some(row => 
      row[field.key] !== undefined && row[field.key] !== '' && row[field.key] !== null
    );
    if (!hasValue) {
      errors.push(`Required field "${field.label}" is not mapped or has no values`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const generateSampleExcel = (fields: TargetField[], filename: string, sampleData: Record<string, any>[]) => {
  const headers = fields.map(f => f.label);
  const wsData = [headers];
  
  sampleData.forEach(row => {
    const rowData = fields.map(f => row[f.key] || '');
    wsData.push(rowData);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
};

export const purchaseBillSampleData = [
  { product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, size: 'M', barcode: '', pur_price: 495, sale_price: 899, qty: 25 },
  { product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, size: 'L', barcode: '10001084', pur_price: 495, sale_price: 899, qty: 30 },
  { product_name: 'Denim Jeans', category: 'Jeans', brand: 'XYZ', style: 'Slim', color: 'Black', hsn_code: '6203', gst_per: 12, size: '32', barcode: '', pur_price: 650, sale_price: 1299, qty: 20 },
];

export const productEntrySampleData = [
  { product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, size: 'M', barcode: '', default_pur_price: 495, default_sale_price: 899, opening_qty: 50 },
  { product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, size: 'L', barcode: '', default_pur_price: 495, default_sale_price: 899, opening_qty: 45 },
  { product_name: 'Polo T-Shirt', category: 'T-Shirts', brand: 'DEF', style: 'Polo', color: 'White', hsn_code: '6109', gst_per: 5, size: 'Free', barcode: '', default_pur_price: 350, default_sale_price: 699, opening_qty: 100 },
];
