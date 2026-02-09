
# Fix Plan: Customer Balance Import - Fetch All Customers

## Problem Identified

The import dialog shows most customers as "Not found" (107 of 130 for Bal, 437 of 530 for Adv) because:

**Root Cause**: The customer query in `CustomerBalanceImportDialog.tsx` (lines 101-105) does NOT use pagination:

```typescript
const { data: customers, error } = await supabase
  .from("customers")
  .select("id, customer_name, phone")
  .eq("organization_id", currentOrganization.id)
  .is("deleted_at", null);
// Only returns ~1,000 rows due to Supabase default limit
```

The ELLA NOOR organization has **6,698 customers**, but only ~1,000 are being fetched. This means the majority of Excel phone numbers can't find a match.

---

## Solution

Use the existing `fetchAllCustomers` utility from `src/utils/fetchAllRows.ts` which properly paginates through all records.

### Code Change

In `src/components/CustomerBalanceImportDialog.tsx`:

**Before (line 100-107):**
```typescript
// Fetch all customers for matching
const { data: customers, error } = await supabase
  .from("customers")
  .select("id, customer_name, phone")
  .eq("organization_id", currentOrganization.id)
  .is("deleted_at", null);
```

**After:**
```typescript
import { fetchAllCustomers } from "@/utils/fetchAllRows";

// Fetch ALL customers for matching (bypasses 1000 row limit)
const customers = await fetchAllCustomers(currentOrganization.id);
```

### Additional Enhancement

Since `fetchAllCustomers` returns all fields, we only need `id`, `customer_name`, and `phone` for matching. The existing function already handles:
- Pagination in 1000-row batches
- Proper ordering for deterministic results
- Filtering deleted records

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/CustomerBalanceImportDialog.tsx` | Import and use `fetchAllCustomers` instead of direct query |

---

## Expected Results After Fix

- **Before**: Sheet Bal: 23 matched, 107 not found / Sheet Adv: 93 matched, 437 not found
- **After**: Significant improvement in match rates as all 6,698 customers will be searchable

---

## Technical Details

The `fetchAllCustomers` function uses range pagination:

```typescript
export async function fetchAllCustomers(organizationId: string) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .range(offset, offset + pageSize - 1);
    
    allRows.push(...(data || []));
    offset += pageSize;
    hasMore = (data?.length || 0) === pageSize;
  }

  return allRows;
}
```

This ensures all 6,698 customers are fetched before phone matching begins.
