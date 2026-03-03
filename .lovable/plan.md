

# Fix Customer Account Balance & Ledger Accuracy

## The Problem (SHEHNAZ HALAI example)

After investigating the actual database records, I found **three accounting bugs** causing confusion:

### Bug 1: Ledger double-counts Advance + Voucher
When an advance (₹46,950) is applied to an invoice, the system creates a voucher receipt (RCP). The ledger then shows **both** entries as credits:
- ADV/25-26/0568: -₹46,950 (advance received)
- RCP/25-26/304: -₹41,750 (advance applied to invoice)

This double-counts the money. The voucher receipt is just an internal allocation of already-received advance money.

### Bug 2: Summary cards ignore Balance Adjustments
The customer list and History dialog calculate balance as `Opening + Sales - Paid`. But they completely ignore `customer_balance_adjustments` entries. This customer has an adjustment of -₹8,550 ("1 bill cancel") that's invisible to the summary.

### Bug 3: Summary cards ignore Advance credits
The "Total Paid" in summary uses `Math.max(paid_amount, voucher)` per invoice. For unused advance amounts not yet applied to invoices, the credit is missing from the balance calculation.

**Correct balance for SHEHNAZ HALAI:**
```text
Opening:     +33,760
Sales:       +68,650  (8550 + 41750 + 4800 + 13550)
Advance:     -46,950
Adjustment:  -8,550
= Balance:    46,910  (currently shows 55,460 — off by 8,550)
```

---

## Fix Plan

### 1. Fix Ledger: Exclude advance-created voucher receipts
**File: `src/components/CustomerLedger.tsx`** (transaction query, ~line 658)

When building the chronological transaction list, filter out voucher entries whose description starts with "Adjusted from advance balance". These are internal transfers — the advance entry already accounts for the credit.

```text
// In the combined[] array, before adding vouchers:
// Filter out advance-application vouchers (they're internal transfers)
const nonAdvanceVouchers = allVouchers.filter(v => 
  !v.description?.startsWith('Adjusted from advance balance')
);
```

### 2. Fix Summary: Include balance adjustments in customer balance
**File: `src/components/CustomerLedger.tsx`** (customer list query, ~line 200)

Fetch `customer_balance_adjustments` and include net adjustment in balance:
```text
Balance = Opening + Sales - Paid + Σ(outstanding_difference) + Σ(advance_difference < 0 ? advance_difference : 0)
```

**File: `src/hooks/useCustomerBalance.tsx`**

Same fix for the hook used by CustomerHistoryDialog summary cards — fetch adjustments and include them.

**File: `src/utils/customerBalanceUtils.ts`**

Extend `calculateCustomerBalance` to accept an `adjustments` parameter.

### 3. Fix Summary: Include unused advance balance
**File: `src/hooks/useCustomerBalance.tsx`** and **`src/components/CustomerLedger.tsx`**

Fetch `customer_advances` where status IN ('active', 'partially_used') and subtract unused amount from balance.

### 4. Reconcile ledger final balance with summary
Ensure the running balance after all transactions equals the summary card "Current Bal" value. This is achieved by fixes 1-3 above making both paths use the same accounting logic:
- Advances = credit (money received)
- Advance-application vouchers = excluded (internal transfer)
- Adjustments = included in both summary and ledger

### Files to modify:
1. **`src/components/CustomerLedger.tsx`** — Fix both customer list balance calc AND transaction ledger view
2. **`src/hooks/useCustomerBalance.tsx`** — Include adjustments + unused advances in balance
3. **`src/utils/customerBalanceUtils.ts`** — Add adjustment parameter to shared utility

