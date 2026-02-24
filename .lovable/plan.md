

## Fix: Supplier Payment Bill Selection Crash

### Problem
Selecting a bill in the Supplier Payment tab crashes the app with React error #185 (infinite re-render loop). Customer Payment works fine because it uses a different checkbox pattern.

### Root Cause
The bill selection table row has TWO conflicting event handlers:
- `TableRow onClick` toggles the bill selection
- `Checkbox onCheckedChange` also toggles the bill selection

When clicking the checkbox, both fire due to event bubbling, causing rapid double state updates that crash React. The Customer Payment tab avoids this by using a read-only native checkbox with `pointer-events-none`.

There is also a secondary bug: the supplier balance query searches voucher entries by bill IDs, but payments are saved with the supplier ID as `reference_id`, so the balance is always wrong.

### Fix (1 file: `src/components/accounts/SupplierPaymentTab.tsx`)

**Change 1: Fix double event handler on checkbox**
- Add `e.stopPropagation()` in the `Checkbox` `onCheckedChange` handler to prevent the click from bubbling to the `TableRow onClick`
- This matches how the rest of the app handles checkbox-inside-clickable-row patterns

**Change 2: Fix supplier balance query**
- Update the `supplierBalance` query to look for voucher entries where `reference_id = supplierID` (not bill IDs), matching how payments are actually stored
- Use `paid_amount` from `purchase_bills` directly for a simpler, accurate balance calculation

**Change 3: Add null safety on recent payments table**
- Use `Number(voucher.total_amount || 0)` instead of `voucher.total_amount.toFixed(2)` to prevent crashes if a voucher has null `total_amount`

### Technical Details

```text
Before (buggy):
  TableRow onClick --> toggles selection
  Checkbox onCheckedChange --> also toggles selection
  Both fire on checkbox click --> double toggle --> React crash

After (fixed):
  TableRow onClick --> toggles selection
  Checkbox onCheckedChange --> toggles selection + stopPropagation()
  Only ONE handler fires per click --> works correctly
```

