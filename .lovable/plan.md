

## Plan: Support Merging 3+ Suppliers

The current merge feature only works with exactly 2 selected suppliers. The user has 3 duplicate "SONAKSHI CREATION" entries and needs to merge all 3 into one.

### Changes Required

**1. `src/pages/SupplierMaster.tsx`** (2 changes)
- Line 513: Change condition from `selectedSuppliers.size === 2` to `selectedSuppliers.size >= 2` to show the Merge button when 2 or more suppliers are selected
- Line 633: Change condition from `mergeSuppliers.length === 2` to `mergeSuppliers.length >= 2` to open the dialog for 3+ suppliers

**2. `src/components/MergeSuppliersDialog.tsx`** (major rework)
- Update `getDefaultTarget` to work with any number of suppliers (score all, pick highest)
- Change `source` from a single supplier to an array of all non-target suppliers
- Update `handleMerge` to loop through all source suppliers, calling `merge_suppliers` RPC sequentially for each source into the target
- Update the UI layout: show a vertical list of supplier cards instead of a 2-column grid; each card is clickable to select as the "Keep" target; all others show "Will merge" badge
- Update the summary section to show consolidated opening balance across all suppliers and list all sources being merged
- Remove the `if (suppliers.length !== 2) return null` guard -- allow 2+

### Technical Details

The existing `merge_suppliers` database function accepts one source and one target. Rather than creating a new DB function, the dialog will call it multiple times in sequence (e.g., for 3 suppliers: merge source1 into target, then merge source2 into target). This is safe because each call is atomic and the target accumulates all transactions.

