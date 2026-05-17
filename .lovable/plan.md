## Problem

Same root cause as the earlier VANDANA FOOT WEAR fix. Audit of the two organizations confirms broad drift:

- **ELLA NOOR**: 38 invoices across 36 customers are fully settled (via receipts, sale-return adjust, or credit-note adjust) but still carry `payment_status='pending'`. Hidden adjustments total ₹2,11,600.
- **KS FOOTWEAR**: 6 invoices across 6 customers in the same state. Hidden adjustments total ₹20,695.

Consequence: these invoices still show in WhatsApp outstanding reminders and render as "Invoice - pending" in the Customer Ledger PDF for those customers.

The frontend code changes already shipped (`SalesmanCustomerAccount.tsx` + `CustomerLedgerPage.tsx`) compute balance dynamically, so once those screens reload, the false positives are gone there. But:

- Any other screen / report still reading `sales.payment_status` directly stays wrong.
- Dashboards filtered by "Pending" status keep showing these rows.

## Fix

One-time backfill, scoped strictly to the two affected organizations. Same SQL logic as the earlier VANDANA backfill — re-applied org-wide.

For every non-cancelled, non-hold sale in these two orgs:

1. Raise `paid_amount` to `max(paid_amount, sum(receipt vouchers))`.
2. Recompute `payment_status`:
   - `completed` if `paid + sale_return_adjust + credit_applied ≥ net_amount − 0.5`
   - `partial` if any payment exists
   - otherwise leave as is.

```sql
update sales s
set paid_amount = greatest(s.paid_amount, coalesce(v.voucher_paid,0)),
    payment_status = case
      when greatest(s.paid_amount, coalesce(v.voucher_paid,0))
           + coalesce(s.sale_return_adjust,0)
           + coalesce(s.credit_applied,0)
           >= s.net_amount - 0.5 then 'completed'
      when greatest(s.paid_amount, coalesce(v.voucher_paid,0)) > 0 then 'partial'
      else s.payment_status
    end
from (
  select reference_id as sale_id, sum(total_amount) as voucher_paid
  from voucher_entries
  where voucher_type='receipt' and deleted_at is null
    and organization_id in (
      '4bc73037-e877-4123-9261-eb6e3876698c', -- KS FOOTWEAR
      '3fdca631-1e0c-4417-9704-421f5129ff67'  -- ELLA NOOR
    )
  group by reference_id
) v
where s.organization_id in (
  '4bc73037-e877-4123-9261-eb6e3876698c',
  '3fdca631-1e0c-4417-9704-421f5129ff67'
)
  and s.deleted_at is null
  and s.payment_status not in ('cancelled','hold')
  and (v.sale_id = s.id or v.sale_id is null);
```

(Run as a `supabase--insert` data-only statement — no schema change.)

## Verification

Re-run the audit query — expected count drops to 0 for both orgs. Spot-check WhatsApp Outstanding Reminder for any customer in either org: only true-pending invoices remain.

## Out of scope

- No code changes — the frontend fixes already shipped handle live computation.
- Other organizations not touched (run a separate audit if needed).
