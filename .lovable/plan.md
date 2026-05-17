## Problem

Two related symptoms in the screenshot/message you shared:

1. **WhatsApp Outstanding reminder** lists already-paid invoices (e.g. `INV/25-26/264`, `INV/25-26/127`, `INV/25-26/73` for VANDANA FOOT WEAR JOGESWARI — each has a matching `RCP/25-26/170x` receipt for the full amount).
2. **Customer Ledger PDF / page** Description column shows `Invoice - pending` for invoices that are actually fully paid (e.g. KS FOOTWEAR / Perfect Shoes Mira Road customer rows).

## Root Cause

Both the reminder and the ledger Description take a shortcut and trust `sales.payment_status` / `sales.paid_amount` directly:

- `src/pages/salesman/SalesmanCustomerAccount.tsx` — `pendingInvoices` is filtered by `sale.payment_status !== 'completed'` first, then voucher receipts are merged in to compute balance. If `payment_status` is stale (`pending`), but the sale was actually settled later through Customer Payment vouchers, balance compares OK only when voucher rows are loaded — but the voucher query has no `customer_id` filter and is capped at Supabase default 1000 rows per org; large orgs (this one already has 903 receipts) silently lose old receipts and the invoice falls through as "pending" with `balance = net_amount`.
- `src/pages/CustomerLedgerPage.tsx` line 168 prints `Invoice - ${sale.payment_status || "pending"}` — purely cosmetic but driven by the stale column, so paid invoices read as "pending" in the PDF.

Newer payments saved through `CustomerPaymentTab` DO update `sales.payment_status` and `paid_amount` (and the tab has a self-heal pass), but historical receipts created before that fix left rows out of sync.

## Fix

Compute the effective per-invoice paid status from data, not from the stale column. Three changes, all in frontend display code:

### 1. `src/pages/salesman/SalesmanCustomerAccount.tsx`
- Scope the `voucher_entries` receipt query to the current customer: `.in('reference_id', [...customerSaleIds, customerId])` so we never hit the 1000-row org cap.
- Build `pendingInvoices` from **all** non-cancelled sales (drop the `payment_status !== 'completed'` pre-filter); compute `effectivePaid = max(paid_amount, voucherPaid) + sale_return_adjust + credit_applied`; keep only invoices where `balance ≥ 1`. This way, paid-but-stale invoices are correctly excluded from `sendAllOutstandingReminder` even when the column is wrong.
- Pull `sale_return_adjust` and `credit_applied` into the sales select.

### 2. `src/pages/CustomerLedgerPage.tsx`
- For the `missingInvoiceRows.particulars`, derive the label from computed balance, not from `sale.payment_status`:
  - `balance ≤ 0.5` → `Invoice - paid`
  - `balance < net_amount` → `Invoice - partial`
  - else → `Invoice - pending`
- Add `paid_amount, sale_return_adjust, credit_applied` to the sales select used at line 142-150 so we can compute balance locally.
- (Optional small touch) Same fix anywhere the RPC ledger renders the description — pass the computed status through `normalizeApplicationLedgerRow`.

### 3. One-time backfill migration to heal historical `payment_status`
Run a migration that, scoped per organization, sets:

```sql
update sales s
set paid_amount = greatest(s.paid_amount, v.voucher_paid),
    payment_status = case
      when greatest(s.paid_amount, v.voucher_paid) + coalesce(s.sale_return_adjust,0) + coalesce(s.credit_applied,0)
           >= s.net_amount - 0.5 then 'completed'
      when greatest(s.paid_amount, v.voucher_paid) > 0 then 'partial'
      else s.payment_status
    end
from (
  select reference_id as sale_id, sum(total_amount) as voucher_paid
  from voucher_entries
  where voucher_type = 'receipt' and reference_type = 'sale' and deleted_at is null
  group by reference_id
) v
where v.sale_id = s.id
  and s.deleted_at is null
  and s.payment_status not in ('cancelled','hold');
```

This permanently corrects the historical drift behind both the reminder and the ledger.

### Out of scope (intentionally)
- `useCustomerBalance`, dashboards, and totals already use `max(paid_amount, voucher_sum)` and are not affected.
- No change to `CustomerPaymentTab` save logic — new payments already update `payment_status` correctly.
- No change to credit-note / advance-adjust flows.

## Verification

- Re-open Salesman → Customer Account for VANDANA FOOT WEAR JOGESWARI → "Send Outstanding Reminder": INV/25-26/73, /127, /264 must no longer appear.
- Print Customer Ledger for the Perfect Shoes Mira Road customer: paid invoice rows show `Invoice - paid`; partially paid rows show `Invoice - partial`.
- After backfill, `select count(*) from sales where payment_status='pending' and ...` shows no rows where voucher receipts already cover the net amount.
