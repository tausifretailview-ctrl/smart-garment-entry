import * as XLSX from 'xlsx';

/**
 * Parse localized number format - handles both US (1,234.56) and European (1.234,56) formats
 * Auto-detects format based on separator positions
 */
/** Round to 2 decimal places (INR line amounts). */
export const roundMoney = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

/** Snap near-integer prices from Excel (e.g. 2589.0000001 → 2589). */
export const normalizePurchaseUnitPrice = (value: number): number => {
  const rounded = roundMoney(value);
  if (Math.abs(rounded - Math.round(rounded)) < 0.01) {
    return Math.round(rounded);
  }
  return rounded;
};

/**
 * Preserve Excel barcode as-is: digits, letters, leading zeros.
 * Never treat barcode as a number field — Excel often stores 000000191 as text or formatted display.
 */
export const normalizeImportBarcode = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  let s = String(value).trim();
  if (!s) return '';
  if (/^[\d.]+e[+\-]?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.trunc(n));
  }
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  return s;
};

function isBarcodeLikeHeader(header: string): boolean {
  const n = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    n.includes('barcode') ||
    n.includes('bcodeno') ||
    n === 'bcode' ||
    n.startsWith('bcode') ||
    n === 'ean' ||
    n === 'upc' ||
    (n.includes('code') && (n.includes('bar') || n.startsWith('b')))
  );
}

function getWorksheetCellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.w != null && String(cell.w).trim() !== '') {
    return normalizeImportBarcode(cell.w);
  }
  return normalizeImportBarcode(cell.v);
}

export const getPurchaseLineMultiplier = (item: {
  uom?: string;
  size?: string;
  qty: number;
}): number => {
  if ((item.uom || "").toUpperCase() === "MTR") {
    const meters = parseFloat(item.size || "");
    if (!isNaN(meters) && meters > 0) return meters;
  }
  return item.qty;
};

export const computePurchaseLineSubTotal = (item: {
  uom?: string;
  size?: string;
  qty: number;
  pur_price: number;
}): number => {
  return roundMoney(getPurchaseLineMultiplier(item) * (Number(item.pur_price) || 0));
};

/** GST on line totals after bill-level discount is allocated proportionally (matches supplier invoices). */
export const computePurchaseBillGst = (
  lineItems: Array<{ line_total: number; gst_per: number }>,
  billDiscountAmount: number,
  isDcPurchase: boolean
): number => {
  if (isDcPurchase) return 0;
  const grossAfterItemDiscount = lineItems.reduce((sum, r) => sum + r.line_total, 0);
  if (grossAfterItemDiscount <= 0) return 0;
  return lineItems.reduce((sum, r) => {
    const proportionalBillDiscount = roundMoney(
      (r.line_total / grossAfterItemDiscount) * billDiscountAmount
    );
    const taxableLine = roundMoney(r.line_total - proportionalBillDiscount);
    return sum + roundMoney(taxableLine * r.gst_per / 100);
  }, 0);
};

export type PurchaseBillLineForTotals = {
  line_total: number;
  gst_per: number;
  qty: number;
  pur_price: number;
  uom?: string;
  size?: string;
  discount_percent: number;
};

/** Single source of truth for purchase bill footer totals (import + manual entry). */
export function computePurchaseBillTotals(
  lineItems: PurchaseBillLineForTotals[],
  billDiscountAmount: number,
  otherCharges: number,
  isDcPurchase: boolean,
) {
  const grossBeforeDiscount = lineItems.reduce(
    (sum, r) => sum + computePurchaseLineSubTotal(r),
    0,
  );
  const itemDiscount = lineItems.reduce((sum, r) => {
    const sub = computePurchaseLineSubTotal(r);
    return sum + roundMoney(sub * r.discount_percent / 100);
  }, 0);
  // Taxable base must match computePurchaseBillGst — use line_total (Excel / after line disc).
  const grossAfterItemDiscount = lineItems.reduce(
    (sum, r) => sum + roundMoney(r.line_total),
    0,
  );
  const taxableAmount = roundMoney(grossAfterItemDiscount - billDiscountAmount);
  const gstAmount = computePurchaseBillGst(lineItems, billDiscountAmount, isDcPurchase);
  const netBeforeRoundOff = taxableAmount + gstAmount + otherCharges;
  const netAmount = Math.round(netBeforeRoundOff);
  const roundOff = roundMoney(netAmount - netBeforeRoundOff);
  return {
    grossBeforeDiscount,
    itemDiscount,
    grossAfterItemDiscount,
    taxableAmount,
    gstAmount,
    netBeforeRoundOff,
    netAmount,
    roundOff,
  };
}

const CHARGE_ROW_PATTERN =
  /courier|freight|convenience|conveince|transport\s*charge|shipping|carriage|delivery\s*charge|other\s*charge/i;

/** Excel summary rows for courier / freight — not product lines. */
export const isPurchaseFreightOrChargeRow = (row: Record<string, any>): boolean => {
  const labelText = Object.values(row)
    .filter((v) => v !== undefined && v !== null && v !== "")
    .map((v) => String(v).toLowerCase())
    .join(" ");
  return CHARGE_ROW_PATTERN.test(labelText);
};

/** Largest numeric value on a charge row (e.g. courier amount in PKR column). */
export const extractChargeAmountFromRow = (row: Record<string, any>): number => {
  let max = 0;
  for (const v of Object.values(row)) {
    const n = parseLocalizedNumber(v);
    if (n > max) max = n;
  }
  return normalizePurchaseUnitPrice(max);
};

export const parseLocalizedNumber = (
  value: string | number | null | undefined,
  useCommaDecimal?: boolean
): number => {
  if (value === null || value === undefined || value === '') return 0;
  
  // If it's already a number, return it
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  let str = String(value).trim();

  // Remove currency symbols (dollar, euro, pound, rupee, etc.) and whitespace
  str = str.replace(/[¤$\u20AC£¥₹\s]/g, '');
  
  // If empty after cleanup, return 0
  if (!str) return 0;

  // Auto-detect format if not specified
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  
  // Determine if comma is decimal separator
  // If comma comes after dot, comma is likely the decimal separator (European format)
  // If dot comes after comma, dot is likely the decimal separator (US format)
  const isCommaDecimal = useCommaDecimal ?? (lastComma > lastDot);

  if (isCommaDecimal) {
    // Comma as decimal: 1.234,56 -> 1234.56
    str = str.replace(/\./g, ''); // Remove thousand separators (dots)
    str = str.replace(',', '.'); // Convert decimal separator to dot
  } else {
    // Dot as decimal: 1,234.56 -> 1234.56
    str = str.replace(/,/g, ''); // Remove thousand separators (commas)
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};

// Normalize phone number: strip non-digits, remove Indian country code prefixes, return last 10 digits
export const normalizePhoneNumber = (phone: string | number | null | undefined): string => {
  if (!phone) return '';
  // Remove trailing .0 that Excel adds to numbers before stripping non-digits
  let raw = String(phone).replace(/\.0$/, '');
  let normalized = raw.replace(/\D/g, ''); // Remove all non-digits
  
  // Handle Indian number formats - extract last 10 digits
  if (normalized.length >= 10) {
    // Remove country code (91) or leading 0 if present
    if (normalized.startsWith('91') && normalized.length > 10) {
      normalized = normalized.slice(-10);
    } else if (normalized.startsWith('0') && normalized.length > 10) {
      normalized = normalized.slice(-10);
    } else if (normalized.length > 10) {
      normalized = normalized.slice(-10);
    }
  }
  
  return normalized;
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
  detectedHeaderRow?: number;
}

export const purchaseBillFields: TargetField[] = [
  // Bill-level fields (extracted from first row)
  { key: 'bill_supplier_name', label: 'Supplier Name (Bill)', type: 'text' },
  { key: 'bill_supplier_invoice_no', label: 'Bill Number / Inv No', type: 'text' },
  { key: 'bill_date', label: 'Bill Date', type: 'text' },
  { key: 'bill_other_charges', label: 'Other Charges', type: 'number' },
  // Line item fields
  { key: 'product_name', label: 'Product Name', type: 'text', required: true },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'style', label: 'Style', type: 'text' },
  { key: 'color', label: 'Color', type: 'text' },
  { key: 'hsn_code', label: 'HSN Code', type: 'text' },
  { key: 'gst_per', label: 'GST %', type: 'number' }, // Not required - defaults to 0%
  { key: 'uom', label: 'Unit (UOM)', type: 'text' },
  // Optional — empty cells are filled with EMPTY_IMPORT_SIZE ("None") before validate/import.
  { key: 'size', label: 'Size', type: 'text', required: false },
  { key: 'barcode', label: 'Barcode', type: 'text' },
  { key: 'pur_price', label: 'Purchase Price', type: 'number', required: true },
  { key: 'sale_price', label: 'Sale Price', type: 'number', required: true },
  { key: 'qty', label: 'Quantity', type: 'number', required: true },
  { key: 'line_total', label: 'Line Total / Amount', type: 'number' },
  { key: 'mrp', label: 'MRP', type: 'number' },
];

export const productEntryFields: TargetField[] = [
  { key: 'product_name', label: 'Product Name', type: 'text', required: true },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'brand', label: 'Brand', type: 'text' },
  { key: 'style', label: 'Style', type: 'text' },
  { key: 'color', label: 'Color', type: 'text' },
  { key: 'hsn_code', label: 'HSN Code', type: 'text' },
  { key: 'gst_per', label: 'GST %', type: 'number' },
  { key: 'uom', label: 'Unit (UOM)', type: 'text' },
  { key: 'size', label: 'Size', type: 'text', required: false },
  { key: 'barcode', label: 'Barcode', type: 'text' },
  { key: 'default_pur_price', label: 'Purchase Price', type: 'number' },
  { key: 'default_sale_price', label: 'Sale Price', type: 'number' },
  { key: 'opening_qty', label: 'Opening Qty', type: 'number' },
];

// Find the actual header row by checking first 15 rows for the one with most non-empty unique text values
const findHeaderRow = (worksheet: XLSX.WorkSheet): number => {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  let bestRowIdx = 0;
  let maxScore = 0;
  
  for (let rowIdx = 0; rowIdx <= Math.min(range.e.r, 15); rowIdx++) {
    let nonEmptyCount = 0;
    const values = new Set<string>();
    let hasNumbers = false;
    
    for (let colIdx = range.s.c; colIdx <= range.e.c; colIdx++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
      const cell = worksheet[cellRef];
      if (cell && cell.v !== undefined && cell.v !== '' && cell.v !== null) {
        const val = String(cell.v).trim();
        // Skip pure numeric values - headers are usually text
        if (!val.match(/^[\d.,]+$/)) {
          nonEmptyCount++;
          values.add(val.toLowerCase());
        } else {
          hasNumbers = true;
        }
      }
    }
    
    // Score: unique non-empty text values, prefer rows without numbers
    const score = values.size * (hasNumbers ? 0.7 : 1);
    if (score > maxScore) {
      maxScore = score;
      bestRowIdx = rowIdx;
    }
  }
  
  return bestRowIdx;
};

export const parseExcelFile = (file: File): Promise<ParsedExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Find the actual header row
        const headerRowIdx = findHeaderRow(worksheet);
        const sheetRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

        // Map normalized header label -> worksheet column index (for formatted barcode cells)
        const normHeaderToColIdx = new Map<string, number>();
        for (let colIdx = sheetRange.s.c; colIdx <= sheetRange.e.c; colIdx++) {
          const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: colIdx });
          const cell = worksheet[cellRef];
          if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue;
          const trimmed = String(cell.w ?? cell.v).trim().replace(/\s+/g, ' ');
          if (trimmed && !trimmed.startsWith('__EMPTY') && !trimmed.match(/^_+$/)) {
            normHeaderToColIdx.set(trimmed, colIdx);
          }
        }
        
        // Parse with raw:false to get string values, defval for blank cells
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { 
          defval: '',
          raw: false,
          range: headerRowIdx // Start from detected header row
        });
        
        if (jsonData.length === 0) {
          reject(new Error('Excel file is empty'));
          return;
        }

        // Normalize headers: trim whitespace, collapse spaces
        // and filter out empty/invalid headers
        const allHeaders = Object.keys(jsonData[0]);
        const headerNormMap = new Map<string, string>(); // original -> normalized
        const validHeaders: string[] = [];
        
        allHeaders.forEach(h => {
          const trimmed = h.trim().replace(/\s+/g, ' ');
          if (
            trimmed !== '' &&
            !trimmed.startsWith('__EMPTY') &&
            !trimmed.match(/^_+$/)
          ) {
            headerNormMap.set(h, trimmed);
            validHeaders.push(trimmed);
          }
        });
        
        const sampleValues: Record<string, string> = {};
        
        validHeaders.forEach(header => {
          // Find original key for this normalized header
          const originalKey = [...headerNormMap.entries()].find(([, v]) => v === header)?.[0] || header;
          const firstNonEmpty = jsonData.find(row => {
            const val = row[originalKey];
            return val !== '' && val !== null && val !== undefined;
          });
          sampleValues[header] = firstNonEmpty ? String(firstNonEmpty[originalKey]).trim() : '';
        });

        const barcodeColumnHeaders = validHeaders.filter(isBarcodeLikeHeader);

        // Clean up rows: normalize headers, trim string values, skip blank/empty rows
        const cleanedRows = jsonData
          .map((row, dataRowIdx) => {
            const cleanRow: Record<string, any> = {};
            for (const [originalKey, normalizedKey] of headerNormMap.entries()) {
              let val = row[originalKey];
              if (typeof val === 'string') {
                val = val.trim();
              }
              cleanRow[normalizedKey] = val;
            }
            // Numeric cells: prefer raw underlying value over formatted display text.
            // Excel formats like "0" round 4202.31 → "4202" in display, which truncates
            // precision when XLSX is parsed with raw:false. Dates (also type 'n') keep
            // their formatted string so existing date parsers continue to work.
            for (const [header, colIdx] of normHeaderToColIdx.entries()) {
              if (barcodeColumnHeaders.includes(header)) continue;
              const cellRef = XLSX.utils.encode_cell({
                r: headerRowIdx + 1 + dataRowIdx,
                c: colIdx,
              });
              const cell = worksheet[cellRef];
              if (!cell || cell.t !== 'n' || typeof cell.v !== 'number') continue;
              const fmt = String(cell.z || '');
              const isDateFormat = /[ymdh]/i.test(fmt);
              if (isDateFormat) continue;
              cleanRow[header] = cell.v;
            }
            // Barcode columns: read formatted cell text (preserves 000000191, alphanumeric codes)
            for (const header of barcodeColumnHeaders) {
              const colIdx = normHeaderToColIdx.get(header);
              if (colIdx === undefined) continue;
              const cellRef = XLSX.utils.encode_cell({
                r: headerRowIdx + 1 + dataRowIdx,
                c: colIdx,
              });
              const cellText = getWorksheetCellText(worksheet[cellRef]);
              if (cellText) cleanRow[header] = cellText;
            }
            return cleanRow;
          })
          .filter(row => {
            // Filter out completely empty rows
            const vals = Object.values(row);
            return vals.some(v => v !== '' && v !== null && v !== undefined);
          });

        resolve({
          headers: validHeaders,
          rows: cleanedRows,
          sampleValues,
          detectedHeaderRow: headerRowIdx,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
};

// Normalize Excel header for alias matching (case/space/dot insensitive).
const normalizeImportHeader = (header: string): string =>
  header.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Bare fragments that cause PRate/SRate/MRP cross-mapping in fuzzy pass — exact aliases only. */
const FUZZY_EXCLUDED_ALIASES = new Set(['rate', 'price']);

// Extended field aliases for better matching
const fieldAliases: Record<string, string[]> = {
  // Bill-level field aliases for purchase bill import
  bill_supplier_name: ['suppliername', 'supplier', 'vendor', 'vendorname', 'partyname', 'firmname', 'firm', 'company', 'companyname', 'party'],
  bill_supplier_invoice_no: ['supplierinvno', 'invoiceno', 'invno', 'billno', 'billnumber', 'voucherno', 'invoicenumber', 'suppinvno', 'suppbillno'],
  bill_date: ['billdate', 'invoicedate', 'invdate', 'date', 'voucherdate', 'purchasedate', 'docdate', 'entrydate'],
  bill_other_charges: ['othercharges', 'charges', 'freight', 'transport', 'transportcharges', 'freightcharges', 'extracharges'],
  // Line item fields
  product_name: ['product', 'productname', 'name', 'item', 'itemname', 'itemd', 'description', 'itemdescription', 'productdesc', 'article', 'articlename'],
  category: ['category', 'cat', 'type', 'producttype', 'group', 'itemgroup', 'productgroup'],
  brand: ['brand', 'brandname', 'brandd', 'make', 'manufacturer', 'company', 'partyname'],
  style: ['style', 'stylename', 'model', 'design', 'designno', 'styleno', 'modelno', 'article', 'articled'],
  color: ['color', 'colour', 'clr', 'shade', 'colord'],
  hsn_code: ['hsn', 'hsncode', 'hsnno', 'saccode', 'sac', 'hsnorsac'],
  gst_per: ['gst', 'gstper', 'gstpercent', 'gstrate', 'tax', 'taxrate', 'taxper', 'taxpercentage', 'igst', 'cgst', 'sgst'],
  uom: ['uom', 'unit', 'unitofmeasure', 'unitofmeasurement', 'measure', 'measurement', 'units'],
  size: ['size', 'sz', 'sized', 'productsize', 'itemsize', 'dimension'],
  barcode: ['barcode', 'bcodeno', 'bcode', 'bcodeo', 'barcodeno', 'barcodenumber', 'eancode', 'bar', 'sku', 'ean', 'upc', 'productcode', 'itemcode', 'skucode'],
  pur_price: ['prate', 'purprice', 'purchaseprice', 'cost', 'costprice', 'buyingprice', 'pp', 'cp', 'landingcost', 'basicrate', 'purchaserate', 'purchasrprice', 'purchasepkr', 'purchasingprice', 'buyprice', 'purchasprice'],
  sale_price: ['srate', 'saleprice', 'sellingprice', 'sp', 'retailprice', 'salerate', 'sellingrate'],
  mrp: ['mrp', 'maximumretailprice', 'maxprice', 'listprice'],
  qty: ['qty', 'quantity', 'stock', 'units', 'pcs', 'pieces', 'nos', 'qnty', 'stockqty', 'bqty'],
  line_total: ['linetotal', 'lineamount', 'amount', 'linenet', 'netamount', 'value', 'linevalue', 'itemamount', 'totalamount', 'linewiseamount', 'grossamount', 'basicamount', 'taxableamount'],
  default_pur_price: ['purprice', 'purchaseprice', 'cost', 'costprice', 'buyingprice', 'pp', 'cp', 'landingcost'],
  default_sale_price: ['saleprice', 'sellingprice', 'mrp', 'sp', 'price', 'retailprice'],
  opening_qty: ['openingqty', 'openingstock', 'opening', 'initialqty', 'initialstock', 'qty', 'quantity', 'opstock', 'opqty'],
  // Customer fields
  customer_name: ['customername', 'customer', 'name', 'partyname', 'buyername', 'clientname', 'client', 'party'],
  // Supplier fields with expanded aliases
  supplier_name: ['suppliername', 'supplier', 'vendor', 'vendorname', 'partyname', 'firmname', 'firm', 'company', 'companyname', 'name', 'party'],
  contact_person: ['contactperson', 'contact', 'person', 'contactname', 'client', 'customer', 'personname', 'owner', 'proprietor'],
  phone: ['phone', 'mobile', 'mobileno', 'phoneno', 'contact', 'tel', 'telephone', 'cell', 'mob', 'phno', 'contactno', 'mobilenumber', 'phonenumber'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'emailadd', 'emailaddr'],
  address: ['address', 'addr', 'fulladdress', 'location', 'city', 'area', 'place', 'add', 'officeaddress', 'shopaddress'],
  gst_number: ['gstnumber', 'gst', 'gstno', 'gstin', 'taxno', 'gstnum', 'gstnoin', 'tin', 'tinno', 'vatno', 'vat'],
  supplier_code: ['suppliercode', 'code', 'vendorcode', 'partycode', 'invno', 'invoiceno', 'supplierinvno', 'suppcode', 'vendcode', 'refno', 'reference', 'refcode', 'invoicenumber', 'billno', 'billnumber'],
  opening_balance: ['openingbalance', 'opening', 'balance', 'ob', 'openingbal', 'outstandingbal', 'outstanding', 'opbal', 'openbal', 'balancedue'],
  discount_percent: ['discountpercent', 'discount', 'disc', 'discper', 'discountper', 'discountrate'],
};

const aliasesForFuzzyMatch = (fieldKey: string, aliases: string[]): string[] => {
  const isPriceField = fieldKey === 'pur_price' || fieldKey === 'sale_price' || fieldKey === 'mrp';
  if (!isPriceField) return aliases;
  return aliases.filter((alias) => !FUZZY_EXCLUDED_ALIASES.has(alias));
};

const exactAliasMatch = (normalizedHeader: string, aliases: string[]): boolean =>
  aliases.includes(normalizedHeader);

// Fuzzy matching: check if header words match any aliases (never beats exact pass)
const fuzzyMatchField = (header: string, aliases: string[]): boolean => {
  const normalizedHeader = normalizeImportHeader(header).replace(/\s+/g, '');

  if (exactAliasMatch(normalizedHeader, aliases)) return false;

  // Check if header contains any alias or alias contains header
  for (const alias of aliases) {
    if (normalizedHeader.includes(alias) || alias.includes(normalizedHeader)) {
      return true;
    }
  }

  // Word-based matching: split header into words and check each
  const words = header.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    for (const alias of aliases) {
      if (alias.includes(word) || word.includes(alias)) {
        return true;
      }
      // Prefix matching (first 5 chars) for typo tolerance
      if (word.length >= 5 && alias.length >= 5) {
        const wordPrefix = word.substring(0, 5);
        const aliasPrefix = alias.substring(0, 5);
        if (wordPrefix === aliasPrefix) {
          return true;
        }
      }
    }
  }

  return false;
};

export const autoMapFields = (
  excelHeaders: string[],
  targetFields: TargetField[]
): Record<string, string | null> => {
  const mappings: Record<string, string | null> = {};
  const usedSystemFields = new Set<string>();

  const tryAssign = (header: string, fieldKey: string): boolean => {
    if (usedSystemFields.has(fieldKey)) return false;
    mappings[header] = fieldKey;
    usedSystemFields.add(fieldKey);
    return true;
  };

  const getAliases = (field: TargetField): string[] =>
    fieldAliases[field.key] || [normalizeImportHeader(field.key)];

  // Pass 1: exact normalized header match only (PRate→pur_price, SRate→sale_price, MRP→mrp, etc.)
  excelHeaders.forEach((header) => {
    const normalizedHeader = normalizeImportHeader(header);
    mappings[header] = null;

    for (const field of targetFields) {
      if (usedSystemFields.has(field.key)) continue;
      if (exactAliasMatch(normalizedHeader, getAliases(field))) {
        tryAssign(header, field.key);
        break;
      }
    }
  });

  // Pass 2: fuzzy matching for remaining headers — price fields skip bare rate/price fragments
  excelHeaders.forEach((header) => {
    if (mappings[header] !== null) return;

    for (const field of targetFields) {
      if (usedSystemFields.has(field.key)) continue;

      const fuzzyAliases = aliasesForFuzzyMatch(field.key, getAliases(field));
      if (fuzzyMatchField(header, fuzzyAliases)) {
        tryAssign(header, field.key);
        break;
      }
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
        mappedRow[systemField] =
          systemField === 'barcode'
            ? normalizeImportBarcode(row[excelCol])
            : row[excelCol];
      }
    });

    return mappedRow;
  });
};

/** Same sentinel as Product Entry "None (no sizes)" / service variants. */
export const EMPTY_IMPORT_SIZE = 'None';

/**
 * Forward-fill product_name (and brand/category/style if blank) from the previous
 * non-blank row when the current row is a continuation line — i.e. it has real
 * item data (barcode, qty, or price) but blank product_name. Common in Excel
 * exports where the product name is written once per group and left blank on
 * subsequent size/variant rows.
 *
 * Skips summary/footer rows (rows that also have no barcode/qty/price).
 */
export const forwardFillGroupedProductNames = (
  rows: Record<string, any>[],
): Record<string, any>[] => {
  const carryFields = ['product_name', 'brand', 'category', 'style'] as const;
  const anchorFields = ['barcode', 'qty', 'opening_qty', 'stock', 'pur_price', 'sale_price', 'mrp'];
  const carry: Record<string, any> = {};

  return rows.map((row) => {
    const hasName =
      row.product_name !== undefined &&
      row.product_name !== null &&
      String(row.product_name).trim() !== '';

    if (hasName) {
      // Update carry from this anchor row
      carryFields.forEach((f) => {
        const v = row[f];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          carry[f] = v;
        }
      });
      return row;
    }

    // Only forward-fill when the row looks like a real continuation line
    const isContinuation = anchorFields.some((f) => {
      const v = row[f];
      return v !== undefined && v !== null && String(v).trim() !== '';
    });
    if (!isContinuation || carry.product_name === undefined) return row;

    const filled: Record<string, any> = { ...row };
    carryFields.forEach((f) => {
      const v = row[f];
      if ((v === undefined || v === null || String(v).trim() === '') && carry[f] !== undefined) {
        filled[f] = carry[f];
      }
    });
    return filled;
  });
};

/**
 * For product rows with a name but blank/missing size, set size to "None"
 * so jewellery/cosmetics sheets import without a Size column.
 * Does not invent size on empty/summary rows (no product name).
 */
export const fillEmptyImportSizes = (
  rows: Record<string, any>[],
): Record<string, any>[] => {
  return rows.map((row) => {
    const productName = row.product_name?.toString().trim();
    if (!productName) return row;
    const size = row.size?.toString().trim();
    if (size) return row;
    return { ...row, size: EMPTY_IMPORT_SIZE };
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

// Check if a row appears to be a summary/total row or empty row that should be skipped
const isSummaryOrEmptyRow = (row: Record<string, any>): boolean => {
  if (isPurchaseFreightOrChargeRow(row)) return true;
  const summaryKeywords = ['total', 'subtotal', 'sub-total', 'grand total', 'sum', 'net', 'gross', 'amount', 'shipping', 'freight', 'transport', 'charges', 'discount', 'tax', 'gst'];
  
  // Count how many meaningful values this row has
  let meaningfulValueCount = 0;
  let hasTextValue = false;
  
  for (const value of Object.values(row)) {
    if (value !== undefined && value !== null && value !== '') {
      meaningfulValueCount++;
      
      // Check for summary keywords
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase().trim();
        // Check if it's a non-numeric text value
        if (!lowerValue.match(/^[\d.,\-\s]+$/)) {
          hasTextValue = true;
        }
        if (summaryKeywords.some(keyword => lowerValue === keyword || lowerValue.startsWith(keyword + ' ') || lowerValue.endsWith(' ' + keyword))) {
          return true;
        }
      }
    }
  }
  
  // Skip rows with very few values (likely empty/separator rows)
  if (meaningfulValueCount <= 3) {
    return true;
  }
  
  // Skip rows that only have numeric values and no text (likely totals/summary without keywords)
  if (!hasTextValue) {
    return true;
  }
  
  // No product name → not a product line (even if qty/price cells are filled).
  // Blank names are skipped silently — not reported as "Missing required value".
  const productName = row['product_name'];
  const hasProductName =
    productName !== undefined && productName !== null && String(productName).trim() !== '';
  if (!hasProductName) {
    return true;
  }

  return false;
};

export const validateMappedData = (
  mappedData: Record<string, any>[],
  targetFields: TargetField[],
  mappings: Record<string, string | null>,
  options?: {
    /**
     * 0-based worksheet row index where headers were detected.
     * Used only for displaying accurate Excel row numbers in errors.
     */
    headerRowIndex?: number;
  }
): ValidationResult => {
  const errors: string[] = [];
  const rowErrors: RowValidationError[] = [];
  const requiredFields = targetFields.filter(f => f.required);
  const numberFields = targetFields.filter(f => f.type === 'number');
  const headerRowIndex = options?.headerRowIndex ?? 0;
  
  // Check if required fields are mapped
  const mappedFieldKeys = Object.values(mappings).filter(Boolean);
  requiredFields.forEach(field => {
    if (!mappedFieldKeys.includes(field.key)) {
      errors.push(`Required field "${field.label}" is not mapped`);
    }
  });

  // Validate each row
  let invalidRowCount = 0;
  let skippedSummaryRows = 0;
  mappedData.forEach((row, index) => {
    // Excel row number:
    // - headerRowIndex is 0-based worksheet index of the header row
    // - +1 converts it to Excel's 1-based row numbering
    // - +1 moves to the first data row
    // - +index moves within the data rows
    const rowNumber = headerRowIndex + 2 + index;
    let rowHasError = false;

    // Skip summary/total/empty/blank-product-name rows — not validation errors
    if (isSummaryOrEmptyRow(row)) {
      skippedSummaryRows++;
      return;
    }

    // Check required fields have values (blank product_name already skipped above)
    requiredFields.forEach(field => {
      if (field.key === "product_name") return;
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

    // Validate number fields using parseLocalizedNumber for proper parsing of comma-formatted values
    numberFields.forEach(field => {
      if (mappedFieldKeys.includes(field.key)) {
        const value = row[field.key];
        if (value !== undefined && value !== '' && value !== null) {
          const numValue = parseLocalizedNumber(value);
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
    // Exclude skipped blank/summary rows from the importable count
    validRowCount: mappedData.length - invalidRowCount - skippedSummaryRows,
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
  { bill_supplier_name: 'XYZ Textiles', bill_supplier_invoice_no: 'INV-001', bill_date: '15/01/2026', bill_other_charges: 500, product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, uom: 'NOS', size: 'M', barcode: '', pur_price: 495, sale_price: 899, qty: 25 },
  { bill_supplier_name: '', bill_supplier_invoice_no: '', bill_date: '', bill_other_charges: '', product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, uom: 'NOS', size: 'L', barcode: '10001084', pur_price: 495, sale_price: 899, qty: 30 },
  { bill_supplier_name: '', bill_supplier_invoice_no: '', bill_date: '', bill_other_charges: '', product_name: 'Denim Jeans', category: 'Jeans', brand: 'XYZ', style: 'Slim', color: 'Black', hsn_code: '6203', gst_per: 12, uom: 'PCS', size: '32', barcode: '', pur_price: 650, sale_price: 1299, qty: 20 },
];

// Parse Excel date from various formats
export const parseExcelDate = (value: any): Date | null => {
  if (!value) return null;
  
  // Handle Excel serial date number
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Handle string formats
  const str = String(value).trim();
  if (!str) return null;
  
  // Try DD/MM/YYYY or DD-MM-YYYY format first (common in India)
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (ddmmyyyyMatch) {
    let day = parseInt(ddmmyyyyMatch[1]);
    let month = parseInt(ddmmyyyyMatch[2]) - 1; // JS months are 0-indexed
    let year = parseInt(ddmmyyyyMatch[3]);
    
    // Handle 2-digit year
    if (year < 100) {
      year += year > 50 ? 1900 : 2000;
    }
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try YYYY-MM-DD format
  const yyyymmddMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yyyymmddMatch) {
    let year = parseInt(yyyymmddMatch[1]);
    let month = parseInt(yyyymmddMatch[2]) - 1;
    let day = parseInt(yyyymmddMatch[3]);
    
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Fallback to Date.parse
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const productEntrySampleData = [
  { product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, uom: 'NOS', size: 'M', barcode: '', default_pur_price: 495, default_sale_price: 899, opening_qty: 50 },
  { product_name: 'Cotton Shirt', category: 'Shirts', brand: 'ABC', style: 'Casual', color: 'Blue', hsn_code: '6206', gst_per: 12, uom: 'NOS', size: 'L', barcode: '', default_pur_price: 495, default_sale_price: 899, opening_qty: 45 },
  { product_name: 'Polo T-Shirt', category: 'T-Shirts', brand: 'DEF', style: 'Polo', color: 'White', hsn_code: '6109', gst_per: 5, uom: 'PCS', size: 'Free', barcode: '', default_pur_price: 350, default_sale_price: 699, opening_qty: 100 },
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

// Student Master Fields
export const studentMasterFields: TargetField[] = [
  { key: 'admission_number', label: 'Admission Number', type: 'text', required: true },
  { key: 'student_name', label: 'Student Name', type: 'text', required: true },
  { key: 'class_name', label: 'Class Name', type: 'text' },
  { key: 'division', label: 'Division', type: 'text' },
  { key: 'roll_number', label: 'Roll Number', type: 'text' },
  { key: 'date_of_birth', label: 'Date of Birth', type: 'text' },
  { key: 'gender', label: 'Gender', type: 'text' },
  { key: 'parent_name', label: 'Parent Name', type: 'text' },
  { key: 'parent_phone', label: 'Parent Phone', type: 'text' },
  { key: 'parent_email', label: 'Parent Email', type: 'text' },
  { key: 'parent_relation', label: 'Relation', type: 'text' },
  { key: 'address', label: 'Address', type: 'text' },
  { key: 'emergency_contact', label: 'Emergency Contact', type: 'text' },
  { key: 'admission_date', label: 'Admission Date', type: 'text' },
  { key: 'status', label: 'Status', type: 'text' },
];

export const studentMasterSampleData = [
  { admission_number: 'ADM0001', student_name: 'Rahul Sharma', class_name: '10-A', division: 'A', roll_number: '1', date_of_birth: '2010-05-15', gender: 'male', parent_name: 'Suresh Sharma', parent_phone: '9876543210', parent_email: 'suresh@email.com', parent_relation: 'father', address: '123 Main Street, City', emergency_contact: '9876543211', admission_date: '2024-04-01', status: 'active' },
  { admission_number: 'ADM0002', student_name: 'Priya Patel', class_name: '9-B', division: 'B', roll_number: '2', date_of_birth: '2011-08-22', gender: 'female', parent_name: 'Meena Patel', parent_phone: '9123456789', parent_email: 'meena@email.com', parent_relation: 'mother', address: '456 Park Avenue, Town', emergency_contact: '9123456788', admission_date: '2024-04-01', status: 'active' },
  { admission_number: 'ADM0003', student_name: 'Amit Kumar', class_name: '8-A', division: 'A', roll_number: '3', date_of_birth: '2012-01-10', gender: 'male', parent_name: 'Raj Kumar', parent_phone: '9988776655', parent_email: '', parent_relation: 'father', address: '789 School Lane, Metro', emergency_contact: '', admission_date: '2024-06-15', status: 'active' },
];