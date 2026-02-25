

# Fix: Customer Ledger ADJ Entry Double-Counting Advance

## Problem
When a balance adjustment is made (e.g., for Saba Latif), the ledger shows an **ADJ** row worth Rs 2,84,300 which combines:
- Outstanding reduction: Rs 2,02,500
- Advance increase: Rs 81,800

However, the advance increase **also** creates a separate record in `customer_advances`, which appears as its own **ADVANCE** row in the ledger. This means the Rs 81,800 advance portion is counted twice -- once in the ADJ row and once in the ADVANCE row -- inflating the balance incorrectly.

## Solution
Modify the ADJ row logic in `CustomerLedger.tsx` to **only reflect the outstanding difference**, since the advance difference is already handled by a separate ADVANCE ledger entry.

## Technical Changes

### File: `src/components/CustomerLedger.tsx` (lines 439-458)

**Current logic (buggy):**
```typescript
const outDiff = adj.outstanding_difference || 0;
const advDiff = adj.advance_difference || 0;
const netDebit = (outDiff > 0 ? outDiff : 0) + (advDiff < 0 ? Math.abs(advDiff) : 0);
const netCredit = (outDiff < 0 ? Math.abs(outDiff) : 0) + (advDiff > 0 ? advDiff : 0);
```

**New logic (fix):**
```typescript
const outDiff = adj.outstanding_difference || 0;
// Advance difference is NOT included here because advance adjustments
// already create/modify separate customer_advances records that appear
// as their own ADVANCE rows in the ledger.
const netDebit = outDiff > 0 ? outDiff : 0;
const netCredit = outDiff < 0 ? Math.abs(outDiff) : 0;
```

This ensures:
- The ADJ row only shows the outstanding balance change (Rs 2,02,500 for Saba Latif)
- The ADVANCE row independently shows the advance change (Rs 81,800)
- No double-counting occurs
- The running balance and final balance will be correct

