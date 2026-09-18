import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Smart search result sorting - prioritizes exact matches, starts-with, then contains
export function sortSearchResults<T extends Record<string, any>>(
  results: T[],
  searchTerm: string,
  fields: { barcode?: string; style?: string; productName?: string }
): T[] {
  if (!searchTerm || results.length === 0) return results;
  
  const term = searchTerm.toLowerCase();
  
  return [...results].sort((a, b) => {
    // Get field values using provided field mapping
    const aBarcode = (a[fields.barcode || 'barcode'] || '').toLowerCase();
    const bBarcode = (b[fields.barcode || 'barcode'] || '').toLowerCase();
    const aStyle = (a[fields.style || 'style'] || '').toLowerCase();
    const bStyle = (b[fields.style || 'style'] || '').toLowerCase();
    const aName = (a[fields.productName || 'product_name'] || '').toLowerCase();
    const bName = (b[fields.productName || 'product_name'] || '').toLowerCase();
    
    // Priority 1: Exact barcode match
    const aExactBarcode = aBarcode === term;
    const bExactBarcode = bBarcode === term;
    if (aExactBarcode && !bExactBarcode) return -1;
    if (!aExactBarcode && bExactBarcode) return 1;
    
    // Priority 2: Barcode starts with search term
    const aBarcodeStarts = aBarcode.startsWith(term);
    const bBarcodeStarts = bBarcode.startsWith(term);
    if (aBarcodeStarts && !bBarcodeStarts) return -1;
    if (!aBarcodeStarts && bBarcodeStarts) return 1;
    
    // Priority 3: Style starts with search term
    const aStyleStarts = aStyle.startsWith(term);
    const bStyleStarts = bStyle.startsWith(term);
    if (aStyleStarts && !bStyleStarts) return -1;
    if (!aStyleStarts && bStyleStarts) return 1;
    
    // Priority 4: Product name starts with search term
    const aNameStarts = aName.startsWith(term);
    const bNameStarts = bName.startsWith(term);
    if (aNameStarts && !bNameStarts) return -1;
    if (!aNameStarts && bNameStarts) return 1;
    
    // Priority 5: Style contains search term
    const aStyleContains = aStyle.includes(term);
    const bStyleContains = bStyle.includes(term);
    if (aStyleContains && !bStyleContains) return -1;
    if (!aStyleContains && bStyleContains) return 1;
    
    return 0; // Keep original order for equal matches
  });
}

// Convert number to Indian number words
export function numberToWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only';
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const convertLessThanHundred = (n: number): string => {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
  };
  
  const convertLessThanThousand = (n: number): string => {
    if (n < 100) return convertLessThanHundred(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanHundred(n % 100) : '');
  };
  
  // Indian numbering: Crore (10^7), Lakh (10^5), Thousand (10^3), Hundred (10^2)
  const convert = (n: number): string => {
    if (n === 0) return '';
    
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    const hundred = n;
    
    let result = '';
    if (crore > 0) result += convertLessThanHundred(crore) + ' Crore ';
    if (lakh > 0) result += convertLessThanHundred(lakh) + ' Lakh ';
    if (thousand > 0) result += convertLessThanHundred(thousand) + ' Thousand ';
    if (hundred > 0) result += convertLessThanThousand(hundred);
    
    return result.trim();
  };
  
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  
  let result = 'Rs. ' + convert(rupees) + ' Rupees';
  if (paise > 0) {
    result += ' and ' + convert(paise) + ' Paise';
  }
  result += ' Only';
  
  return result;
}

/** Build a descriptive product display name like "SHIRT-FULL SLEEVE-NIKE-FORMAL" */
export function buildProductDisplayName(product: {
  product_name?: string;
  style?: string;
  brand?: string;
  category?: string;
}): string {
  const parts = [
    product.product_name,
    product.style,
    product.brand,
    product.category,
  ].filter(p => p && p.trim() && p.trim() !== '-');
  return parts.join('-') || product.product_name || '';
}

const ENTER_AS_TAB_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="file"]):not([disabled]):not([tabindex="-1"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="combobox"]:not([disabled])',
].join(", ");

function isVisibleEnterAsTabField(el: HTMLElement): boolean {
  if (el.closest("[data-skip-enter-as-tab]")) return false;
  if (el.closest(".hidden")) return false;
  if (el.hidden || el.closest("[hidden]")) return false;
  if (el.tabIndex === -1) return false;
  return true;
}

/**
 * Makes Enter key behave like Tab in form fields — ERP/Tally style.
 * Add onKeyDown={handleEnterAsTab} to any input or form wrapper marked
 * `form`, `[data-entry-form]`, or `[data-product-form]`.
 */
export const handleEnterAsTab = (e: React.KeyboardEvent) => {
  if (e.key !== "Enter" || e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return;
  const combobox =
    target.getAttribute("role") === "combobox"
      ? target
      : (target.closest('[role="combobox"]') as HTMLElement | null);
  if (tag === "BUTTON" && !combobox) return;
  if (target.closest("[data-skip-enter-as-tab]")) return;

  const form = target.closest("form, [data-entry-form], [data-product-form]");
  if (!form) return;

  e.preventDefault();
  const current = combobox || target;
  const fields = Array.from(form.querySelectorAll<HTMLElement>(ENTER_AS_TAB_FIELD_SELECTOR)).filter(
    isVisibleEnterAsTabField,
  );
  const unique: HTMLElement[] = [];
  for (const el of fields) {
    if (!unique.includes(el)) unique.push(el);
  }
  const idx = unique.indexOf(current);
  if (idx >= 0 && idx < unique.length - 1) {
    unique[idx + 1].focus();
  }
};

/**
 * Returns the barcode for display ONLY if it belongs to our internal series
 * (length <= 10 digits — generated by our barcode_sequence).
 * Universal barcodes (EAN-13 = 13 digits, UPC-A = 12 digits) are hidden
 * everywhere in the UI per user requirement: "do not show universal
 * barcode show only our barcode series". Storage in DB is unaffected.
 */
export function displayBarcode(barcode: string | null | undefined): string {
  if (!barcode) return '';
  const trimmed = String(barcode).trim();
  if (!trimmed) return '';
  // Our internal series is up to 10 chars; anything longer is treated as
  // a universal/EAN/UPC barcode and not shown.
  if (trimmed.length > 10) return '';
  return trimmed;
}
