

## Fix: Double Entry in Customer Ledger After Advance Balance Adjustment

### Problem
When a balance adjustment reduces a customer's advance (e.g., cash refund of ₹2,000 advance), the ledger shows:
- ADVANCE row: ₹2,000 credit (full original amount)
- ADJ row: ₹0 (advance_difference is excluded from calculation)
- Result: Balance shows ₹2,000 credit, but actual balance is ₹0

### Root Cause
In `CustomerLedger.tsx`, the adjustment entry processing (around line 643-662) intentionally excludes `advance_difference` with a comment saying "advance adjustments already create/modify separate customer_advances records that appear as their own ADVANCE rows." However, when an advance is **reduced** (negative advance_difference), no new advance row is created -- the existing record is modified (used_amount increased). The original advance row still displays at full credit value, so the "consumption" of the advance is never reflected.

### Fix (1 file)

**`src/components/CustomerLedger.tsx`** -- Adjustment entry calculation (lines 643-662):

Update the ledger's adjustment entry to include **negative** advance_difference as a debit (representing advance consumption/refund). Positive advance_difference is still excluded since it creates a new advance record that appears as its own row.

Current logic:
```
const outDiff = adj.outstanding_difference || 0;
// Advance difference is NOT included...
const netDebit = outDiff > 0 ? outDiff : 0;
const netCredit = outDiff < 0 ? Math.abs(outDiff) : 0;
```

New logic:
```
const outDiff = adj.outstanding_difference || 0;
const advDiff = adj.advance_difference || 0;
// When advance is reduced (advDiff < 0), show as debit (advance credit reversed)
// When advance is increased (advDiff > 0), skip here (new advance record handles it)
const advanceConsumed = advDiff < 0 ? Math.abs(advDiff) : 0;
const netDebit = (outDiff > 0 ? outDiff : 0) + advanceConsumed;
const netCredit = outDiff < 0 ? Math.abs(outDiff) : 0;
```

Also update the description to mention the advance refund when applicable:
```
let adjDescription = `Balance Adjustment: ${adj.reason}`;
if (advanceConsumed > 0) {
  adjDescription += ` (Advance Refund: ₹${advanceConsumed.toLocaleString('en-IN')})`;
}
```

### Expected Result for Zeba Rokadia
- ADVANCE row: ₹2,000 credit, balance ₹2,000
- ADJ row: ₹2,000 debit (advance consumed), balance ₹0
- TOTAL: Debit ₹2,000, Credit ₹2,000, Balance ₹0 (matches actual)

