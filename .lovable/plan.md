

# Plan: Fix False Advance Balance on Sales Dashboard

## Root Cause

The dashboard's advance/credit balance calculation on line 718 fetches **all receipt vouchers** — including Credit Note (CN) adjustment vouchers. These CN adjustment vouchers (with descriptions like "Credit note adjusted against invoice INV/...") are added to the `invoiceVoucherMap`, which inflates the `totalPaid` figure. Since `creditNoteTotal` (from `sale_returns`) also subtracts the same CN amounts, they get **double-counted**, producing a false negative balance (credit of ₹3,200).

The Customer Ledger already handles this correctly by filtering out CN adjustment vouchers. The dashboard code does not.

### Proof (Arezah Nathani)

- Total sales: ₹15,850
- Actual cash received: ₹12,650 (3300+3100+6250)
- CN adjustments: ₹6,500 (3300+3200)
- Correct balance: 0 + 15850 - 12650 - 6500 + 3300(refund offset) = **₹0** ✓
- Dashboard currently computes: **-₹3,200** due to CN vouchers being counted as payments AND as credit notes

## Fix

**File: `src/pages/SalesInvoiceDashboard.tsx`** — one change in the `fetchCombinedBalance` effect (~line 718):

1. Add `description` to the voucher select query
2. When building `invoiceVoucherMap`, skip vouchers where description contains "credit note adjusted" or "cn adjusted" — matching the Customer Ledger's existing filter logic

```typescript
// Line 718: Add description to select
supabase.from('voucher_entries')
  .select('reference_id, total_amount, reference_type, voucher_type, description')
  .eq('organization_id', orgId).eq('voucher_type', 'receipt').is('deleted_at', null),

// Line 731-737: Filter out CN adjustment vouchers
(customerVouchers || []).forEach((v: any) => {
  const desc = (v.description || '').toLowerCase();
  if (desc.includes('credit note adjusted') || desc.includes('cn adjusted')) return; // skip
  if (v.reference_id && saleIds.has(v.reference_id)) {
    invoiceVoucherMap.set(v.reference_id, ...);
  } else if (...) {
    openingBalancePaymentTotal += ...;
  }
});
```

## What will NOT change
- Customer Ledger (already correct)
- Accounts payment tabs
- Any database tables or functions
- Per-invoice balance column in dashboard rows (already correct)

