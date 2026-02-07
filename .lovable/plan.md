

# Fix: KS Footwear GST Report Shows 0 CGST/SGST for Some Invoices

## Problem Identified

The January GST report for KS Footwear organization shows **0 CGST and 0 SGST** for numerous invoices that actually have valid sale items with 5% GST.

| Invoice Example | Expected GST | Shown in Report |
|-----------------|--------------|-----------------|
| INV/25-26/7 | CGST ~122, SGST ~122 | 0, 0 |
| INV/25-26/9 | CGST ~20, SGST ~20 | 0, 0 |
| INV/25-26/10 | CGST ~61, SGST ~61 | 0, 0 |

## Root Cause

The `fetchAllSaleItems()` function in `src/utils/fetchAllRows.ts` uses pagination with `.range()` but **does NOT include an ORDER BY clause**.

**Current code (line 292-297):**
```typescript
const { data } = await supabase
  .from("sale_items")
  .select("variant_id, quantity, line_total, gst_percent, ...")
  .in("sale_id", batchIds)
  .is("deleted_at", null)
  .range(offset, offset + pageSize - 1);  // NO ORDER BY!
```

**Why this causes the bug:**
- PostgreSQL returns rows in **undefined order** without ORDER BY
- When paginating with `.range()`, subsequent pages may return **different row orderings**
- This causes some rows to be **duplicated** while others are **completely missed**
- With 5,374 sale items across 6 pages of 1000 items each, many items are skipped

## Solution

Add `.order("id")` to ensure consistent, deterministic pagination across all paginated queries in `fetchAllRows.ts`.

### Files to Modify

| File | Change |
|------|--------|
| `src/utils/fetchAllRows.ts` | Add `.order("id")` to all paginated queries that use `.range()` |

### Affected Functions (8 total)

1. **fetchAllSaleItems** - Line 292
2. **fetchAllPurchaseItems** - Line 332 
3. **fetchSaleReturnItemsByIds** - Similar pattern
4. **fetchPurchaseReturnItemsByIds** - Similar pattern
5. **fetchPurchaseItemsByBillIds** - Similar pattern
6. **All other fetch functions using .in() with .range()**

### Code Fix Example

**Before:**
```typescript
.in("sale_id", batchIds)
.is("deleted_at", null)
.range(offset, offset + pageSize - 1);
```

**After:**
```typescript
.in("sale_id", batchIds)
.is("deleted_at", null)
.order("id")  // Ensures consistent pagination order
.range(offset, offset + pageSize - 1);
```

## Impact

- Fixes GST report accuracy for organizations with >1000 transaction items
- Ensures all items are fetched exactly once during pagination
- No performance impact (index on `id` column is already present)
- Affects all organizations using GST reports, not just KS Footwear

## Verification

After the fix, the user should:
1. Re-export the January GST report for KS Footwear
2. Verify all 315 invoices show correct CGST and SGST values
3. Confirm totals match: Expected ~₹35,018 each for CGST and SGST

