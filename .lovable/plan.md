
# Fix POS Customer Search Limit for Large Organizations

## Problem

The SM Hair Replacement organization has **2,072 customers**, but the POS customer search only returns **50 results maximum**. When users search by name or number, customers outside the first 50 alphabetically-sorted matches don't appear in the dropdown.

## Solution

Increase the search result limit and add a visual indicator when results are truncated so users know more customers exist beyond what's shown.

## Technical Changes

### 1. Increase Search Limit (src/hooks/useCustomerSearch.tsx)

| Current | Updated |
|---------|---------|
| `.limit(50)` | `.limit(100)` |

Increase from 50 to 100 results to match the pattern used in other search components.

### 2. Add Truncation Indicator

Return a `hasMore` flag when 100 results are reached to indicate more customers match the search criteria.

### 3. Add "Showing X results" Message in POS Customer Dropdown

When 100 results are returned, display a message like:
```
Showing 100 of many matches - refine your search
```

This helps users understand they should type more characters to narrow down results.

## Files to Modify

1. **src/hooks/useCustomerSearch.tsx**
   - Increase limit from 50 to 100
   - Add `hasMore` indicator in return value

2. **src/pages/POSSales.tsx**
   - Show truncation warning in customer search dropdown when hasMore is true

3. **src/pages/SalesInvoice.tsx**
   - Same truncation warning for consistency

## User Experience

**Before:**
- User searches for "Raj" → only 50 customers shown
- Customer "Rajan Kumar" (alphabetically after 50th match) is missing
- User thinks customer doesn't exist

**After:**
- User searches for "Raj" → 100 customers shown
- Message appears: "Showing 100 results - type more to narrow down"
- User adds more text: "Rajan K" → correct customer appears
