
# Fix Plan: Purchase Bill Excel Import - Localized Number Parsing

## Problem Summary
The purchase bill Excel import is failing to correctly save purchase prices to the database for the **ELLA NOOR** organization. While the imported line items display correct totals in the UI, the underlying **product variants** are created with `pur_price = 0`.

**Root Cause:** When creating new products and product variants during Excel import, the code uses JavaScript's `Number()` function instead of `parseLocalizedNumber()`. This means comma-formatted prices like `27,139` are parsed as `NaN` and default to `0`.

Currently, 493 out of 787 product variants in the organization have `pur_price = 0` due to this bug.

---

## Solution Overview

### 1. Fix the Excel Import Logic

Replace all `Number()` calls for price fields with `parseLocalizedNumber()` in `PurchaseEntry.tsx`:

**Product creation** (around line 2054-2056):
```typescript
// Before
gst_per: Number(row.gst_per) || 0,
default_pur_price: Number(row.pur_price) || 0,
default_sale_price: Number(row.sale_price) || 0,

// After
gst_per: parseLocalizedNumber(row.gst_per),
default_pur_price: parseLocalizedNumber(row.pur_price),
default_sale_price: parseLocalizedNumber(row.sale_price),
```

**Variant creation** (around line 2098-2099):
```typescript
// Before
pur_price: Number(row.pur_price) || 0,
sale_price: Number(row.sale_price) || 0,

// After
pur_price: parseLocalizedNumber(row.pur_price),
sale_price: parseLocalizedNumber(row.sale_price),
```

---

### 2. Data Correction for ELLA NOOR

After fixing the code, a SQL update is needed to correct the 493 variants with wrong prices:

**Option A: Re-import the Excel file** (Recommended)
- The fixed import logic will now correctly parse the prices
- Existing variants will be matched by product+size combination and used (not recreated)
- Line items will have correct prices, and the bill can be saved

**Option B: Direct SQL update** 
- Query the original Excel data source to update variant prices manually
- This requires knowing the correct prices for each variant

---

## Technical Details

### Files to Modify:
- `src/pages/PurchaseEntry.tsx` - Fix product and variant creation to use `parseLocalizedNumber()`

### Affected Lines in PurchaseEntry.tsx:

| Line | Current Code | Fix |
|------|-------------|-----|
| ~2054 | `gst_per: Number(row.gst_per) \|\| 0` | `parseLocalizedNumber(row.gst_per)` |
| ~2055 | `default_pur_price: Number(row.pur_price) \|\| 0` | `parseLocalizedNumber(row.pur_price)` |
| ~2056 | `default_sale_price: Number(row.sale_price) \|\| 0` | `parseLocalizedNumber(row.sale_price)` |
| ~2098 | `pur_price: Number(row.pur_price) \|\| 0` | `parseLocalizedNumber(row.pur_price)` |
| ~2099 | `sale_price: Number(row.sale_price) \|\| 0` | `parseLocalizedNumber(row.sale_price)` |

### Why `parseLocalizedNumber()` Works:
The utility function correctly handles:
- Comma-separated thousands (e.g., `27,139` → `27139`)
- European decimal format (e.g., `1.234,56` → `1234.56`)
- Currency symbols (e.g., `₹27,139` → `27139`)
- Already numeric values (passes through)

---

## Recommended Next Steps

1. **Approve this plan** to fix the code
2. **Re-import the Excel file** in ELLA NOOR organization
3. The new import will:
   - Match existing products/variants (won't create duplicates)
   - Create line items with correct prices
   - Allow saving the purchase bill with accurate totals

---

## Impact
- **Low risk** - only affects price parsing during import
- **No breaking changes** - existing functionality preserved
- **Fixes forward** - all future imports will work correctly
