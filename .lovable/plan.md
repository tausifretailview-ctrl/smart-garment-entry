

## Problem Analysis

Invoice **INV/25-26/411** (SANOBER KHANOM) has inconsistent data:
- `net_amount`: ₹8,700
- `paid_amount`: ₹8,200 (advance adjusted)
- `payment_status`: `completed` (should be `partial`)
- Balance shown: ₹500

The "Paid" badge in the dashboard reads directly from the `payment_status` column (`SalesInvoiceERPTable.tsx` line 246), which was never updated when the advance was applied.

## Root Cause

When the advance payment of ₹8,200 was applied against the ₹8,700 invoice, the `paid_amount` was correctly set to 8,200, but the `payment_status` was not recalculated to `partial`.

## Plan

### 1. Fix display logic to use actual amounts (defensive)

**File: `src/components/SalesInvoiceERPTable.tsx`**

Change the payment status badge to compute status from actual `paid_amount` vs `net_amount` instead of trusting the `payment_status` column blindly:

```tsx
// Derive actual status from amounts
const effectiveStatus = (invoice.paid_amount || 0) >= invoice.net_amount 
  ? 'completed' 
  : (invoice.paid_amount || 0) > 0 ? 'partial' : 'pending';
```

Use `effectiveStatus` for the badge label and styling. This prevents any future data inconsistency from showing wrong tags.

### 2. Fix existing corrupted data via migration

Run a SQL migration to reconcile all invoices where `payment_status` doesn't match the actual `paid_amount` vs `net_amount`:

```sql
UPDATE sales
SET payment_status = CASE
  WHEN paid_amount >= net_amount THEN 'completed'
  WHEN paid_amount > 0 THEN 'partial'
  ELSE 'pending'
END
WHERE deleted_at IS NULL
  AND payment_status != 'hold'
  AND payment_status != CASE
    WHEN paid_amount >= net_amount THEN 'completed'
    WHEN paid_amount > 0 THEN 'partial'
    ELSE 'pending'
  END;
```

### 3. Apply same defensive logic to POS Dashboard

**File: `src/pages/POSDashboard.tsx`** -- update the badge rendering (~line 1600) to also derive status from amounts rather than the stored field, except for `hold` status which is a special workflow state.

This ensures both dashboards are always accurate regardless of any data sync issues.

