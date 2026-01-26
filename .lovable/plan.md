
# Permanent Fix for 1000-Row Limit Across Entire Application

## Problem Summary

The database has a default limit of 1000 rows per query. This limit has been causing recurring data truncation issues in various reports, exports, and data loading operations throughout the app. Each time a new area is discovered, we've been fixing it individually - but this needs a systematic, permanent solution.

## Root Cause Analysis

The issue occurs in two patterns:

| Pattern | Example | Impact |
|---------|---------|--------|
| **Direct `.select("*")` queries** | Fetching all sales, customers, suppliers | Returns only first 1000 records |
| **`.in("id", largeArray)` queries** | Fetching variants by IDs from sale_items | Silently truncates the ID list |

## Files Requiring Updates

Based on the full codebase audit, here are all files that need the permanent fix:

### Category 1: Report Pages (High Priority)

| File | Issue | Current State |
|------|-------|---------------|
| `src/pages/SalesReportByCustomer.tsx` | Direct sales query, customers query | **Not fixed** - no pagination |
| `src/pages/DailyCashierReport.tsx` | Direct sales/vouchers query | **Not fixed** - no pagination |
| `src/pages/PurchaseReportBySupplier.tsx` | Suppliers query, purchase_bills query | **Not fixed** - no pagination |
| `src/pages/Index.tsx` | Variants `.in()` query for profit calc | **Partially fixed** - sale_items OK, variants NOT |
| `src/pages/AccountingReports.tsx` | Uses accountingReportUtils | **Needs check** |

### Category 2: Export/Integration Pages

| File | Issue | Current State |
|------|-------|---------------|
| `src/pages/TallyExport.tsx` | Customers, suppliers, products, sales queries | **Not fixed** - all direct queries |
| `src/pages/GSTReports.tsx` | Sales with nested items | **Fixed** - uses fetchAllSaleItems |
| `src/pages/GSTSalePurchaseRegister.tsx` | Sale return items `.in()` query | **Partially fixed** - sale_items OK, return_items NOT |

### Category 3: Utility Functions

| File | Issue | Current State |
|------|-------|---------------|
| `src/utils/accountingReportUtils.ts` | Variants `.in()` query in calculateNetProfitSummary | **Not fixed** - line 571 |
| `src/utils/fetchAllRows.ts` | Central pagination utility | **Already exists** |

### Category 4: Item-wise Reports

| File | Issue | Current State |
|------|-------|---------------|
| `src/pages/ItemWiseSalesReport.tsx` | Products `.in()` query | **Not fixed** - line 109-112 |
| `src/pages/NetProfitAnalysis.tsx` | Products `.in()` query | **Not fixed** - line 307-310 |

## Implementation Plan

### Step 1: Expand fetchAllRows.ts Utility

Add new helper functions for batched `.in()` queries:

```typescript
// New utility for batched variant fetching
export async function fetchVariantsByIds(variantIds: string[], selectFields: string = "id, pur_price") {
  const allRows: any[] = [];
  const batchSize = 500;
  
  for (let i = 0; i < variantIds.length; i += batchSize) {
    const batchIds = variantIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("product_variants")
      .select(selectFields)
      .in("id", batchIds);
    if (error) throw error;
    if (data) allRows.push(...data);
  }
  return allRows;
}

// New utility for batched product fetching
export async function fetchProductsByIds(productIds: string[], selectFields: string = "id, product_name, brand, category") {
  const allRows: any[] = [];
  const batchSize = 500;
  
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batchIds = productIds.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from("products")
      .select(selectFields)
      .in("id", batchIds);
    if (error) throw error;
    if (data) allRows.push(...data);
  }
  return allRows;
}

// New utility for fetching all sales with pagination
export async function fetchAllSales(organizationId: string, filters?: {
  startDate?: string;
  endDate?: string;
  customerId?: string;
}) {
  // Range-paginated fetch with optional filters
}

// New utility for batched purchase bill fetching
export async function fetchPurchaseBillsByIds(billIds: string[]) {
  // Batched .in() query
}
```

### Step 2: Update Report Pages

**SalesReportByCustomer.tsx:**
- Replace direct customers query with `fetchAllCustomers`
- Replace direct sales query with new `fetchAllSales` with filters

**DailyCashierReport.tsx:**
- Replace direct sales query with range-paginated fetch
- Replace direct voucher_entries query with range-paginated fetch

**PurchaseReportBySupplier.tsx:**
- Replace direct suppliers query with `fetchAllSuppliers`
- Replace direct purchase_bills query with range-paginated fetch

### Step 3: Fix `.in()` Queries

**accountingReportUtils.ts (line 571-574):**
- Replace variants `.in()` with `fetchVariantsByIds`

**ItemWiseSalesReport.tsx (line 109-112):**
- Replace products `.in()` with `fetchProductsByIds`

**NetProfitAnalysis.tsx (line 307-310):**
- Replace products `.in()` with `fetchProductsByIds`

**GSTSalePurchaseRegister.tsx (line 255-258):**
- Replace sale_return_items `.in()` with batched fetch

**Index.tsx (line 474-477):**
- Replace variants `.in()` with `fetchVariantsByIds`

### Step 4: Update TallyExport.tsx

This file has the most queries needing updates:

- Line 182-189: customers query - use `fetchAllCustomers`
- Line 193-200: suppliers query - use `fetchAllSuppliers`
- Line 204-211: products query - use `fetchAllProducts`
- Line 216-236: sales with nested items - use range pagination + progressive loading
- Line 308-325: voucher_entries - use `fetchAllVouchers`

### Step 5: Progressive Loading Pattern

For large datasets with progressive loading (as you requested):

```typescript
// Hook pattern for progressive loading
const useProgressiveLoad = <T>(
  fetchFn: () => Promise<T[]>,
  options: { batchSize?: number; onProgress?: (loaded: number) => void }
) => {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  
  // Stream data in batches, updating UI progressively
  // Show partial results immediately while loading continues
};
```

## Files to Modify (Summary)

| Priority | File | Changes |
|----------|------|---------|
| 1 | `src/utils/fetchAllRows.ts` | Add 5 new helper functions |
| 2 | `src/utils/accountingReportUtils.ts` | Fix variants `.in()` |
| 3 | `src/pages/Index.tsx` | Fix variants `.in()` |
| 4 | `src/pages/SalesReportByCustomer.tsx` | Full rewrite of queries |
| 5 | `src/pages/DailyCashierReport.tsx` | Add range pagination |
| 6 | `src/pages/PurchaseReportBySupplier.tsx` | Add range pagination |
| 7 | `src/pages/ItemWiseSalesReport.tsx` | Fix products `.in()` |
| 8 | `src/pages/NetProfitAnalysis.tsx` | Fix products `.in()` |
| 9 | `src/pages/GSTSalePurchaseRegister.tsx` | Fix return_items `.in()` |
| 10 | `src/pages/TallyExport.tsx` | Full rewrite of all queries |

## Technical Approach

1. **Centralized utilities**: All pagination logic stays in `fetchAllRows.ts`
2. **Consistent pattern**: Every query that could return 1000+ rows uses range pagination
3. **Batch size**: 500 for `.in()` queries, 1000 for range pagination
4. **Progressive loading**: First batch displays immediately, rest loads in background
5. **No breaking changes**: All existing APIs remain the same

## Expected Outcome

After this fix:
- All reports will show complete data regardless of size
- Exports will include all records (up to 20k as you mentioned)
- First results appear fast, rest loads progressively
- No more recurring "missing data" issues from 1000-row limit
