

## Fix Purchase Dashboard Loading Performance

### Problem
When opening the Purchase Dashboard, users see a full-screen loading spinner for an extended time. This happens because the page fetches ALL purchase bills AND ALL their items (in 1000-row paginated loops) before rendering anything.

### Root Cause
1. The `fetchBills` function (line 276) loops through ALL bills, then loops through ALL purchase items for every bill before setting `loading = false`
2. Line 1057 returns a full-page spinner (`Loader2`) that blocks the entire UI until loading completes
3. For organizations with many bills (hundreds/thousands), this causes a noticeable delay

### Solution: Progressive Loading Pattern

Instead of blocking the entire page, show the page structure immediately and load data in the background.

**Changes (single file: `src/pages/PurchaseBillDashboard.tsx`):**

1. **Remove the full-page loading blocker** (lines 1057-1063)
   - Delete the early return that shows only a spinner
   - Instead, pass `isLoading={loading}` to the ERPTable component, which already supports skeleton rows

2. **Show the page layout immediately**
   - The header, summary cards, and search filters render right away
   - Summary cards show "0" or skeleton placeholders while data loads
   - The ERPTable shows skeleton rows during loading (it already supports this via the `isLoading` prop)

3. **Defer item fetching**
   - Split the fetch: load bills first (set loading=false after bills arrive), then fetch items in the background
   - This means the table shows bill rows quickly; item counts and qty badges populate a moment later

### Technical Details

- Remove lines 1057-1063 (the early `if (loading) return ...` block)
- Split `fetchBills` into two phases:
  - Phase 1: Fetch bills, call `setBills()` and `setLoading(false)`
  - Phase 2: Fetch items in background, update `setBillItems()` without blocking
- Add a separate `itemsLoading` state for the items fetch phase
- The ERPTable already renders skeletons when `isLoading={true}`, so no table changes needed
- Summary cards will show real bill counts from Phase 1; qty totals update after Phase 2

