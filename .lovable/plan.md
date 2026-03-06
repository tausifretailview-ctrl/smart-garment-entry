

## Bug: Balance Adjustment Double-Counting

### Root Cause

The balance adjustment is being applied **twice**:

1. **`applyAdjustmentEffects`** (line 229-240) modifies the customer's `opening_balance` directly by the `outstanding_difference` amount
2. **Balance calculation formula** (in `useCustomerBalance`, `CustomerLedger`, `customerBalanceUtils`) adds `adjustmentTotal` (sum of all `outstanding_difference` from `customer_balance_adjustments` table) to the balance

So for Aisha Moin Adhikari: the user set new outstanding to 4,600 (prev was 24,300), creating a difference of -19,700. This -19,700 was:
- Subtracted from `opening_balance` (making it -3100 + (-19700) = changed)
- AND subtracted again via `adjustmentTotal` in the balance formula

### Fix

**Remove the `opening_balance` modification from `applyAdjustmentEffects`**. The `customer_balance_adjustments` table already tracks the difference, and the balance formula already includes it via `adjustmentTotal`. The `opening_balance` should remain untouched — it represents the original carried-forward balance.

### Files to Change

1. **`src/components/CustomerBalanceAdjustmentDialog.tsx`** — In `applyAdjustmentEffects`, remove the block (lines 228-240) that updates `opening_balance`. Keep the advance adjustment logic as-is (advances are separate entities, not double-counted).

2. **Fix existing corrupted data** — For Aisha Moin Adhikari and any other affected customers, the `opening_balance` has already been incorrectly modified. The user will need to manually correct the opening balance, or we can add a note about this.

### Also Fix: Reverse/Delete Operations

The `deleteAdjustment` and `reverseAdjustment` mutations also call `applyAdjustmentEffects` with negated diffs. After removing the `opening_balance` modification, these will correctly only affect the adjustment records (and advances), since the balance formula handles the rest automatically.

### Summary of the single change:

Remove these lines from `applyAdjustmentEffects`:
```typescript
// DELETE THIS BLOCK - causes double-counting
if (outDiff !== 0) {
  const { data: cust } = await supabase
    .from("customers")
    .select("opening_balance")
    .eq("id", customerId)
    .single();
  const currentOpening = cust?.opening_balance || 0;
  await supabase
    .from("customers")
    .update({ opening_balance: currentOpening + outDiff })
    .eq("id", customerId);
}
```

After this fix, the adjustment will only be tracked in the `customer_balance_adjustments` table and reflected once through the `adjustmentTotal` in the balance formula.

**Note:** The customer's `opening_balance` for Aisha may already be corrupted. You may need to manually correct it back to its original value (-3,100 based on the screenshot, but it may have been changed by -19,700).

