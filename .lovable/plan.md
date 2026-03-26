

## Problem: Double Credit Note Entries in Supplier Ledger

### Root Cause

When a purchase return is created, the system creates an **SCN credit note voucher** (e.g., SCN-00008 for ₹5,925.15). Then when the user clicks "Adjust to Outstanding" in the Adjust Credit Note dialog, it creates a **second credit_note voucher** (e.g., VOH/25-26/8 for ₹5,925.15) — resulting in the same amount being deducted **twice** from the supplier balance.

The screenshot confirms this: both `VOH/25-26/8` and `SCN-00008` appear for ₹5,925.15, and both `VOH/25-26/12` and `SCN-00013` appear for ₹19,105.80.

### Fix Plan

**File: `src/components/AdjustCreditNoteDialog.tsx`** — In the `"outstanding"` adjustment case (~lines 189-200):

- **Remove** the code that creates a new `credit_note` voucher entry (the `supabase.from('voucher_entries').insert(...)` block)
- **Keep** only the update to the existing SCN voucher's description (lines 203-211), since the SCN voucher already exists and already reduces the supplier balance
- This eliminates the duplicate entry

**File: `src/components/SupplierLedger.tsx`** — No changes needed. The ledger correctly displays all `credit_note` voucher entries — once the duplicate creation is removed, it will show correctly.

**File: `src/components/accounts/SupplierPaymentTab.tsx`** — The supplier balance calculation here only uses `bill.net_amount - bill.paid_amount` (no credit notes factored in). This is a **separate issue** — the outstanding shown in the payment tab doesn't account for credit notes or voucher payments. This should also be fixed to show accurate outstanding by subtracting credit note amounts and voucher payments from the balance.

### Summary of Changes

| File | Change |
|------|--------|
| `AdjustCreditNoteDialog.tsx` | Remove duplicate voucher insert in "outstanding" case; keep only the existing voucher description update |
| `SupplierPaymentTab.tsx` | Update balance calculation to include credit notes and voucher payments for accurate outstanding |

### Impact
- Fixes double-counting of credit note adjustments in the supplier ledger
- Corrects supplier outstanding balance in the payment recording screen
- No existing data is affected — only prevents future duplicates

