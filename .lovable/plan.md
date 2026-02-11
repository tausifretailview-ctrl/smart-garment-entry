
# Fix: Hide Deleted Customers from Customer Master

## Problem
The Customer Master page fetches **all** customers including soft-deleted ones (those with a `deleted_at` timestamp). This causes deleted customers to appear in the list, confusing users who expect them to only be in the Recycle Bin.

## Fix
A single line addition to `src/pages/CustomerMaster.tsx` at line 209:

Add `.is("deleted_at", null)` to the main fetch query so only active customers are loaded.

```
// Line ~209: Add deleted_at filter
.select("*")
.eq("organization_id", currentOrganization.id)
.is("deleted_at", null)              // <-- new line
.order("created_at", { ascending: false })
```

Also add the same filter to the Excel import duplicate-check query (line ~516) to prevent matching against deleted customer phone numbers.

This is a minimal, two-line fix. No database changes needed.
