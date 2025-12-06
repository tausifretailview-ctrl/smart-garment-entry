import * as XLSX from 'xlsx';

// Normalize phone number by removing all non-numeric characters (spaces, dashes, parentheses, etc.)
export const normalizePhoneNumber = (phone: string | number | null | undefined): string => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
};

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
    // Customer/Supplier fields
    customer_name: ['customername', 'customer', 'name', 'partyname', 'buyername'],
    supplier_name: ['suppliername', 'supplier', 'vendor', 'vendorname', 'partyname'],
    contact_person: ['contactperson', 'contact', 'person', 'contactname'],
    phone: ['phone', 'mobile', 'mobileno', 'phoneno', 'contact', 'tel', 'telephone'],
    email: ['email', 'emailid', 'emailaddress', 'mail'],
    address: ['address', 'addr', 'fulladdress', 'location'],
    gst_number: ['gstnumber', 'gst', 'gstno', 'gstin', 'taxno'],
    supplier_code: ['suppliercode', 'code', 'vendorcode', 'partycode'],
    opening_balance: ['openingbalance', 'opening', 'balance', 'ob', 'openingbal'],
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

export interface RowValidationError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  rowErrors: RowValidationError[];
  validRowCount: number;
  invalidRowCount: number;
}

export const validateMappedData = (
  mappedData: Record<string, any>[],
  targetFields: TargetField[],
  mappings: Record<string, string | null>
): ValidationResult => {
  const errors: string[] = [];
  const rowErrors: RowValidationError[] = [];
  const requiredFields = targetFields.filter(f => f.required);
  const numberFields = targetFields.filter(f => f.type === 'number');
  
  // Check if required fields are mapped
  const mappedFieldKeys = Object.values(mappings).filter(Boolean);
  requiredFields.forEach(field => {
    if (!mappedFieldKeys.includes(field.key)) {
      errors.push(`Required field "${field.label}" is not mapped`);
    }
  });

  // Validate each row
  let invalidRowCount = 0;
  mappedData.forEach((row, index) => {
    const rowNumber = index + 2; // Excel row (1-indexed + header row)
    let rowHasError = false;

    // Check required fields have values
    requiredFields.forEach(field => {
      if (mappedFieldKeys.includes(field.key)) {
        const value = row[field.key];
        if (value === undefined || value === '' || value === null) {
          rowErrors.push({
            row: rowNumber,
            field: field.label,
            message: `Missing required value`,
            value: value
          });
          rowHasError = true;
        }
      }
    });

    // Validate number fields
    numberFields.forEach(field => {
      if (mappedFieldKeys.includes(field.key)) {
        const value = row[field.key];
        if (value !== undefined && value !== '' && value !== null) {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            rowErrors.push({
              row: rowNumber,
              field: field.label,
              message: `Invalid number`,
              value: value
            });
            rowHasError = true;
          } else if (numValue < 0 && ['qty', 'pur_price', 'sale_price', 'gst_per', 'opening_qty', 'default_pur_price', 'default_sale_price'].includes(field.key)) {
            rowErrors.push({
              row: rowNumber,
              field: field.label,
              message: `Cannot be negative`,
              value: value
            });
            rowHasError = true;
          }
        }
      }
    });

    if (rowHasError) {
      invalidRowCount++;
    }
  });

  return {
    valid: errors.length === 0 && rowErrors.length === 0,
    errors,
    rowErrors,
    validRowCount: mappedData.length - invalidRowCount,
    invalidRowCount,
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

// Customer Master Fields
export const customerMasterFields: TargetField[] = [
  { key: 'customer_name', label: 'Customer Name', type: 'text' },
  { key: 'phone', label: 'Mobile Number', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'gst_number', label: 'GST Number', type: 'text' },
  { key: 'opening_balance', label: 'Opening Balance', type: 'number' },
];

export const customerMasterSampleData = [
  { customer_name: 'John Doe', phone: '9876543210', email: 'john@example.com', address: '123 Main Street, City', gst_number: '27AABCU9603R1ZM', opening_balance: 5000 },
  { customer_name: 'ABC Traders', phone: '9123456789', email: 'abc@traders.com', address: '456 Market Road, Town', gst_number: '29AABCU9603R1ZN', opening_balance: 0 },
  { customer_name: '', phone: '9988776655', email: '', address: '', gst_number: '', opening_balance: 1500 },
];

// Supplier Master Fields
export const supplierMasterFields: TargetField[] = [
  { key: 'supplier_name', label: 'Supplier Name', type: 'text', required: true },
  { key: 'contact_person', label: 'Contact Person', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'gst_number', label: 'GST Number', type: 'text' },
  { key: 'supplier_code', label: 'Supplier Code', type: 'text' },
  { key: 'opening_balance', label: 'Opening Balance', type: 'number' },
];

export const supplierMasterSampleData = [
  { supplier_name: 'XYZ Textiles', contact_person: 'Raj Kumar', phone: '9876543210', email: 'xyz@textiles.com', address: 'Industrial Area, City', gst_number: '27AABCU9603R1ZM', supplier_code: 'SUP001', opening_balance: 25000 },
  { supplier_name: 'Fashion Hub', contact_person: 'Priya Shah', phone: '9123456789', email: 'fashion@hub.com', address: 'Garment Zone, Town', gst_number: '29AABCU9603R1ZN', supplier_code: 'SUP002', opening_balance: 0 },
  { supplier_name: 'Fabric World', contact_person: 'Amit Patel', phone: '9988776655', email: 'fabric@world.com', address: 'Textile Market, Metro', gst_number: '', supplier_code: 'SUP003', opening_balance: 15000 },
];
