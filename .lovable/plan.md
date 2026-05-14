## What I found

Yesterday's two migrations are in place, but drift still exists in many customers / orgs. Top offenders (`paid_amount` ≠ sum of receipt vouchers, > ₹1):

| Organization | Drifted invoices |
|---|---|
| MIRANOS CLOTHING | 163 |
| TIRTHA COSMETICS | 62 |
| Gurukrupa Silk Sarees | 59 |
| VELVET EXCLUSIVE | 47 |
| **KS FOOTWEAR** | **43** |
| SACCHI FASHION | 35 |
| ELLA NOOR | 20 |
| GLAMARIZE | 17 |
| …others | smaller |

Sample (KS FOOTWEAR):

- `INV/25-26/523` — net 19,118 / paid 19,118 / receipts 10,000 → still showing Paid (the original NEW LAXMI bill).
- `INV/25-26/716` — net 15,393 / paid 15,393 / receipts 25,393.
- `POS/25-26/851` — net 870 / paid 330 / receipts 870 (cash 330 + settlement discount 540).
- Many more POS bills where `paid_amount` is the cash tender only and the settlement discount is missing.

### Why yesterday's heal missed them

`supabase/migrations/20260514064214_…sql` had two predicates that skipped exactly the rows the user is now reporting:

1. `AND COALESCE(s.payment_method,'') <> 'pay_later'` — the NEW LAXMI 523 case is a `pay_later` invoice, so it was deliberately excluded and `paid_amount=19,118` was never reset to 10,000.
2. POS bills where the receipt was created (or recreated) after the migration ran: settlement discount (`voucher_entries.discount_amount`) is in the receipt but `sales.paid_amount` still equals the original cash tender, so the drill-down audit shows the gap.

The discount-split normalize migration (`20260514100000_…`) is fine and should not be re-run.

## Plan

### 1. New one-time heal migration — covers ALL organizations

`supabase/migrations/<new>_heal_sale_paid_amount_v2.sql`

Logic:

```text
receipt_total(sale_id) = SUM(voucher_entries.total_amount + COALESCE(discount_amount,0))
  WHERE voucher_type = 'receipt'
    AND deleted_at IS NULL
    AND reference_id = sale.id        -- match on id, accept either reference_type
                                      -- ('sale' or legacy 'customer'), per the
                                      -- customer-balance-logic memory rule

payable = GREATEST(0, net_amount - COALESCE(sale_return_adjust, 0))
new_paid = LEAST(payable, receipt_total)

UPDATE sales SET
  paid_amount = new_paid,
  payment_status = CASE
    WHEN payable <= 0.01 THEN 'completed'
    WHEN new_paid >= payable - 0.01 THEN 'completed'
    WHEN new_paid > 0.01 THEN 'partial'
    ELSE 'pending'
  END
WHERE deleted_at IS NULL
  AND COALESCE(is_cancelled, false) = false
  AND COALESCE(payment_status,'') NOT IN ('cancelled','hold')
  AND COALESCE(sale_number,'') NOT LIKE 'Hold/%'
  -- NOTE: pay_later is NOT excluded this time
  AND ( ABS(paid_amount - new_paid) > 0.01 OR payment_status IS DISTINCT FROM <computed> )
```

Key differences vs yesterday:
- Removes the `payment_method <> 'pay_later'` filter (this is what blocked INV/25-26/523).
- Joins on `reference_id = sale.id` only — ignores `reference_type` so legacy rows with `reference_type='customer'` pointing to a sale id are also counted (matches the rule documented in `mem://features/accounts/customer-balance-logic`).
- Re-runs idempotently — only updates rows that still drift.

Expected effect on the reported invoices:

| Sale | Before | After |
|---|---|---|
| INV/25-26/523 | paid 19,118 / Completed | paid 10,000 / **Partial** (₹9,118 pending) |
| INV/25-26/716 | paid 15,393 / Completed | paid 15,393 / **Completed** (capped at payable; excess 10,000 indicates an over-receipt to investigate manually) |
| POS/25-26/851 | paid 330 / Completed | paid 870 / Completed (cash 330 + discount 540 reconciled) |
| All other 200+ drifted POS / pay_later sales across the listed orgs | re-aligned | |

### 2. Verification

Re-run the existing `supabase/verify_receipt_sales_mismatch.sql` and the org-level drift query in this thread. Both should return 0 mismatches afterwards.

### 3. Source-code prevention (already shipped)

- `CustomerLedger.tsx` already derives Payment-at-sale from `cash + card + upi` (no longer trusts `paid_amount`).
- `reconcileSaleInvoiceDisplay` already drives the Sales Dashboard from voucher truth.
- Receipt-with-settlement-discount: `voucher_entries.total_amount` now stores cash only and the audit/ledger credits `total + discount`. POS save path that initially set `paid_amount = cash only` while a discount voucher carries the rest is the only remaining write that creates the drift; this migration heals every historical instance and any future occurrence can be re-healed by re-running the same SQL. A trigger-based guard is **out of scope** for this change.

### Out of scope
- Investigating the legacy code path that originally over/under-set `paid_amount`.
- Any change to advance / credit-note application logic.
- Any change to the journal_entries already posted for these vouchers.

Approve to apply the new heal migration.