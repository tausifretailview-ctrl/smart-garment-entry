

## Plan: Replace Full Customer Fetches with Paginated Server-Side Search

### Problem
Two major pages (`SaleOrderEntry.tsx`, `QuotationEntry.tsx`) fetch **all customers** in a loop (1000 rows at a time) on mount, which is expensive for orgs with 2000+ customers. They then filter client-side in the dropdown.

Other pages (`SaleReturnEntry.tsx`, `SalesmanOrderEntry.tsx`, `PriceHistoryReport.tsx`, `AddAdvanceBookingDialog.tsx`) already use server-side search with `.limit(50)` or similar — these are fine.

### Scope of Changes

**File 1: `src/pages/SaleOrderEntry.tsx`**
- Remove the `useQuery` that fetches all customers in a while-loop (lines ~302-331)
- Replace with `useCustomerSearch(customerSearchInput)` hook import
- Update the customer dropdown `CommandList` to use `filteredCustomers` from the hook instead of `customersData?.filter(...).slice(0, 50)`
- Set `shouldFilter={false}` on the `Command` component (search is server-side)
- When loading an existing order for edit, fetch the single customer by ID separately (already done for quotation conversion flow)

**File 2: `src/pages/QuotationEntry.tsx`**
- Same pattern: remove the all-customers `useQuery` (lines ~290-319)
- Replace with `useCustomerSearch(customerSearchInput)` hook
- Update dropdown rendering to use `filteredCustomers`
- Set `shouldFilter={false}` on `Command`
- When loading an existing quotation for edit, fetch single customer by ID (already handled)

### Technical Details

Both pages already have `customerSearchInput` state and a `Command` + `CommandInput` dropdown. The change is straightforward:

```typescript
// BEFORE (fetches ALL customers on mount)
const { data: customersData } = useQuery({
  queryKey: ['customers', currentOrganization?.id],
  queryFn: async () => {
    // while-loop fetching 1000 at a time...
  },
});
// Then: customersData?.filter(c => ...).slice(0, 50)

// AFTER (server-side search, 200 max, debounced)
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
const { filteredCustomers, isLoading: isCustomersLoading } = useCustomerSearch(customerSearchInput);
// Then: filteredCustomers.map(customer => ...)
```

The existing `useCustomerSearch` hook already handles:
- 300ms debounce
- Server-side `.or()` filter on name/phone/email
- Limit of 200 results
- PostgREST character escaping
- Fallback on filter failure

### What stays unchanged
- `SaleReturnEntry.tsx` — already does server-side search with limit(50)
- `SalesmanOrderEntry.tsx` — already does server-side search with limit(20)
- `CustomerMaster.tsx` — already paginated with server-side search
- `PriceHistoryReport.tsx` — fetches `id, customer_name` only for filter dropdown (lightweight, acceptable)
- `AddAdvanceBookingDialog.tsx` — already does server-side search with limit(50)

### Files Changed
1. `src/pages/SaleOrderEntry.tsx` — replace all-customer fetch with `useCustomerSearch` hook
2. `src/pages/QuotationEntry.tsx` — replace all-customer fetch with `useCustomerSearch` hook

