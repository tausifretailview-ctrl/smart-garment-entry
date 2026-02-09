

# Fix Plan: Purchase Bill Excel Import - Column Name Matching

## Problem Identified
The import is failing silently because the Excel file has non-standard column names that don't match the expected field aliases:

**Your Excel columns:**
| Column Name | Expected to Map to | Current Status |
|------------|-------------------|----------------|
| Purchasr Price | `pur_price` (Purchase Price) | Not matching (typo - missing "e") |
| Purchase PKR | (unmapped) | Could be original cost |
| Quantity | `qty` | Should match |
| Sale Price | `sale_price` | Should match |
| Product Name | `product_name` | Should match |
| Size | `size` | Should match |

The **"Purchasr Price"** typo breaks automatic field detection, and since `pur_price` is a required field, the validation fails with 0 valid rows.

---

## Solution

### 1. Expand Field Aliases for Purchase Price

Add more forgiving aliases to handle common typos and variations:

```typescript
// In src/utils/excelImportUtils.ts - fieldAliases
pur_price: [
  'purprice', 'purchaseprice', 'cost', 'costprice', 'buyingprice', 
  'pp', 'cp', 'landingcost', 'basicrate', 'rate', 'purchaserate',
  // NEW: Handle typos and currency-based names
  'purchasrprice',  // Typo without 'e'
  'purchasepkr',    // Currency-based (PKR)
  'purchasingprice',
  'buyprice',
  'purchasprice',   // Another common typo
],
```

### 2. Improve Fuzzy Matching Logic

Enhance the fuzzy matching to handle partial word matches better:

```typescript
// Enhanced fuzzy matching in fuzzyMatchField function
const fuzzyMatchField = (header: string, aliases: string[]): boolean => {
  const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '');
  
  // Direct match
  if (aliases.includes(normalizedHeader)) return true;
  
  // Partial containment check
  for (const alias of aliases) {
    if (normalizedHeader.includes(alias) || alias.includes(normalizedHeader)) {
      return true;
    }
  }
  
  // Word-based matching with partial prefix matching (NEW)
  const words = header.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    for (const alias of aliases) {
      // Existing: full word containment
      if (alias.includes(word) || word.includes(alias)) {
        return true;
      }
      // NEW: Prefix matching (first 5 chars) for typo tolerance
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
```

### 3. Add Better Error Messaging

When no valid rows are found, show clearer guidance:

```typescript
// In handleExcelImport - after filtering valid rows
if (validRows.length === 0) {
  toast.error("No valid rows found. Please check that required columns (Product Name, Size, Quantity, Purchase Price) are mapped correctly.");
  return;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils/excelImportUtils.ts` | Expand `pur_price` aliases; improve fuzzy matching with prefix comparison |
| `src/pages/PurchaseEntry.tsx` | Add clear error message when 0 valid rows found |

---

## Testing After Fix

1. Re-try importing the **Maliha_CRTN51.xlsx** file
2. The system should now:
   - Auto-detect "Purchasr Price" → Purchase Price
   - Auto-detect "Quantity" → Quantity
   - Auto-detect "Sale Price" → Sale Price
   - Show proper success/error counts

---

## Impact
- **Low risk** - only affects field alias matching
- **Backwards compatible** - existing imports continue to work
- **Fixes forward** - handles common typos in Excel column names

