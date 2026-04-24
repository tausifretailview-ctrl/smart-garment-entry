## Problem

Muskan (ELLA NOOR, customer id `076c36ee-5469-4cc7-b65a-9d5e3254c191`) ledger shows wrong closing balance ₹2,300 Cr instead of correct **₹6,600 Dr**.

## Root cause (verified from DB)

| Sale | Gross | paid_amount | Voucher in DB |
|---|---|---|---|
| INV/25-26/1358 | 12,100 | 12,100 | ✅ RCP/1353 (UPI 12,100) |
| INV/25-26/1374 | 8,900 | **8,900** | ❌ **NONE** (phantom — pay_later but marked completed) |
| INV/26-27/327 | 9,800 | 0 | – |

SR/25-26/58 = 12,100, status `pending`, `linked_sale_id = NULL`.

The ledger shows the 8,900 "Payment at sale" row purely from `sales.paid_amount` on INV/1374 — but no actual cash/UPI voucher exists. Customer never paid this 8,900. The 12,100 SR credit is also showing separately, so the system is **double-deducting 8,900** (once as phantom payment, once when SR credit applies).

## Correct accounting (user-confirmed)

1. SR/58 (12,100 credit) adjusts INV/1374 (8,900) → 3,200 advance left
2. 3,200 advance adjusts INV/327 (9,800) → 6,600 outstanding
3. Closing balance = **₹6,600 Dr**

## Fix steps (data correction only — no code changes)

**Step 1 — Clear phantom payment on INV/1374**
```sql
UPDATE sales
SET paid_amount = 0,
    payment_status = 'pending',
    payment_method = 'pay_later'
WHERE id = '5d980e21-18d6-44b8-b46b-5c568b49e84c'
  AND organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';
```

**Step 2 — Link SR/58 to INV/1374 as adjusted (absorbs 8,900)**
Since SR (12,100) > INV (8,900), we mark SR adjusted against INV/1374 for 8,900 and leave 3,200 as customer credit/advance. Two acceptable approaches — pick one:

**Approach A (recommended): Convert SR/58 into customer advance credit, leave unlinked**
- Keep SR/58 as `pending` and unlinked
- Update `useCustomerBalance` already treats unlinked-pending SR as customer credit — but verify it subtracts the SR. Current code: yes, sale_returns where credit_status≠pending are subtracted. Pending SRs are NOT subtracted, which is wrong here.
- Instead: mark SR/58 `credit_status = 'adjusted'` (without linked_sale_id) so it counts as a 12,100 credit against the gross → 30,800 − 12,100 − 12,100 (only real voucher) = **6,600 Dr** ✓

```sql
UPDATE sale_returns
SET credit_status = 'adjusted'
WHERE id = '31e82458-90e7-4303-ad2d-db676ea8c822'
  AND organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';
```

**Approach B: Create proper credit_note advance entry** — heavier, requires creating a `customer_advances` row of 12,100 + an `advance_used` link of 8,900 to INV/1374. More auditable but more rows to seed.

## Verification after fix

Expected ledger:
- 16 Mar INV/1358 12,100 / Paid 12,100 → 0
- 17 Mar SR/58 12,100 → 12,100 Cr
- 17 Mar INV/1374 8,900 → 3,200 Cr (SR absorbs)
- 24 Apr INV/327 9,800 → **6,600 Dr** ✓

Math: 30,800 (gross) − 12,100 (SR adjusted) − 12,100 (only real voucher) = **6,600 Dr**.

## What I will do once approved

1. Run the two UPDATE SQLs above (Approach A).
2. Re-query the customer's sales + SR + vouchers and print the recomputed ledger snapshot to confirm 6,600 Dr.
3. No code/schema changes needed — `useCustomerBalance` and `CustomerLedger` already produce 6,600 Dr once the underlying data is correct.

## Optional follow-up (not in this fix)

Audit other invoices org-wide where `payment_method='pay_later'` AND `paid_amount > 0` AND no backing voucher exists — these are the same phantom-payment pattern and likely cause similar ledger drift across the ELLA NOOR org. Can run a scan if you want a list.
