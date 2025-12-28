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
