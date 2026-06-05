## What's actually wrong

For **Shumama Baireli**, a CN-adjustment receipt voucher of **₹38,000** was posted on 2026-05-21 against `INV/26-27/803`:

- `voucher_entries`: `RCP/26-27/929`, `payment_method=credit_note_adjustment`, `total_amount=38000`, references the sale.
- `sales`: `INV/26-27/803` has `net_amount=38000`, `sale_return_adjust=38000`, `payment_status=completed` ⇒ dashboard correctly reads it as "Paid".
- `credit_notes` for this customer: **only one row exists** — `CN/26-27/16` for ₹11,250, already fully used by `SR/26-27/33`.
- `sale_returns` (pending CAB): `SR/41` ₹10,950 + `SR/37` ₹11,400 + `SR/36` ₹11,100 = **₹33,450**.

So a ₹38,000 CN was applied to the invoice, but `credit_notes.used_amount` was **never bumped** and there is no CN header for that amount. The sale-return CAB (the pool the user "spent") was reduced (or never decremented) without a matching CN write. That's why the dashboard says "paid via CN" but the CN balance still looks unchanged.

## Scope of the issue across ELLA NOOR

A direct audit (CN-adjustment receipts on sales vs. `credit_notes.used_amount` per customer) finds **26 customers** with one-sided CN applications totaling **~₹1,78,400** of over-applied / phantom CN:

| Customer | CN Issued | CN Used | CN Applied to invoices | Over-applied |
|---|---:|---:|---:|---:|
| Shumama Baireli | 11,250 | 11,250 | 40,150 | **28,900** |
| AMNA DARVESH | 0 | 0 | 13,500 | 13,500 |
| Sharmin Mewara | 11,300 | 11,300 | 24,750 | 13,450 |
| Muskan | 0 | 0 | 12,100 | 12,100 |
| MAHENOOR KAS / GULNAZ | 0 | 0 | 10,500 each | 10,500 each |
| Amrin, OSAMA, QURRATUL AIN, Shanawaz, Mahi Supariwala, Ruby Bhatia, Khadija, FIZA, SAMEENA, PRIYANKA, Naeem, Nazbin, Parina, Arezah, Sadiqa, Sadiya, Hanif, AYESHA, FAIZA SALMAN, SABINA | … | … | … | small (₹1.8K–₹9.2K each) |

Most cases have `total_cn_issued = 0` — i.e. the user applied a CN against the invoice without a `credit_notes` header ever existing.

## Root cause

The legacy "Adjust pending sale-return against invoice" path (POS `FloatingSaleReturn` + `apply_credit_note_to_sale`) writes the receipt voucher and bumps `sales.sale_return_adjust`, **but only updates `credit_notes.used_amount` when `sale_returns.credit_note_id` is already set**. Pending sale-returns in ELLA NOOR have `credit_note_id = NULL`, so no CN row was created or decremented. This is exactly the **Phase 2 not-shipped** path called out in `mem://features/accounts/customer-balance-logic`.

Result: receipt + `sale_return_adjust` are written → invoice flips to Paid; CN header never reflects the spend → ledger / CN remaining are wrong.

## Plan

### Phase A — Confirm with the user (no writes)

Share the 26-customer audit list (above) for sign-off. Confirm the canonical fix policy per row, with three options per affected sale:

1. **Backfill CN header** — create a `credit_notes` row equal to the applied voucher and mark it `fully_used` (paper trail only). Invoice stays Paid, CN ledger now balances.
2. **Reverse the voucher** — soft-delete the CN-adjustment voucher and clear `sales.sale_return_adjust`. Invoice flips back to Pending; user must re-apply correctly via the new RPC.
3. **Mixed** — backfill for cases where a real return exists; reverse where it was a mistake.

Default recommendation: **Option 1 (backfill)** for rows where the customer actually has pending sale-return CAB equal to or greater than the over-apply; **Option 2 (reverse)** for the rest.

### Phase B — Data repair (one-shot SQL, after approval)

For each affected sale, in a single transactional migration:
- Create / extend a `credit_notes` row to cover the gap; set `used_amount = credit_amount`, `status = fully_used`, link via `sale_id`.
- For "reverse" rows: soft-delete the voucher, subtract `total_amount` from `sales.sale_return_adjust`, recompute `payment_status`.
- Re-run `reconcile_customer_balances` for the org so the ledger matches.

### Phase C — Prevent recurrence (code)

Route every CN-on-invoice apply through `adjust_invoice_balance` (already the single writer per memory). Specifically:
- `src/components/FloatingSaleReturn.tsx` POS-redeem path and `useCreditNotes` pending-CN-redeem must call `adjust_invoice_balance` (which now caps via `credit_notes.credit_amount − used_amount` and inserts the voucher inline).
- Delete / quarantine direct `createReceiptVoucher({ payment_method: 'credit_note_adjustment' })` call sites outside the two RPCs.
- Add a DB trigger on `voucher_entries` insert: if `payment_method='credit_note_adjustment'` and the request did not come from `adjust_invoice_balance` / `apply_credit_note_to_sale`, raise. (Optional, second line of defense.)

### Phase D — Verify

- Re-run the audit query — over-applied total must be 0.
- Spot-check Shumama Baireli, AMNA DARVESH, Sharmin Mewara in Sales Dashboard, Customer Ledger, and CN list.

## Technical notes

- Audit query used (read-only, reproducible):
  ```sql
  WITH cn_vouchers AS (
    SELECT ve.total_amount, s.customer_id, c.customer_name
    FROM voucher_entries ve
    JOIN sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
    JOIN customers c ON c.id = s.customer_id
    WHERE ve.organization_id = '<ELLA_NOOR>'
      AND ve.deleted_at IS NULL AND s.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND LOWER(ve.payment_method) = 'credit_note_adjustment'
  ), cust_cn AS (
    SELECT customer_id, SUM(credit_amount) AS issued, SUM(used_amount) AS used
    FROM credit_notes
    WHERE organization_id = '<ELLA_NOOR>' AND deleted_at IS NULL
    GROUP BY customer_id
  )
  SELECT c.customer_name, COALESCE(cc.issued,0), COALESCE(cc.used,0),
         SUM(cv.total_amount) AS applied,
         SUM(cv.total_amount) - COALESCE(cc.used,0) AS over_applied
  FROM cn_vouchers cv
  LEFT JOIN cust_cn cc USING (customer_id)
  GROUP BY 1,2,3 HAVING SUM(cv.total_amount) > COALESCE(cc.used,0) + 0.5
  ORDER BY over_applied DESC;
  ```
- Files touched in Phase C: `src/components/FloatingSaleReturn.tsx`, `src/hooks/useCreditNotes.tsx`, `src/utils/saleSettlement.ts` (any direct CN voucher writer).
- No change needed to `adjust_invoice_balance` / `apply_credit_note_to_sale` — they already enforce the cap.

## Deliverable

After approval I will (1) produce the full per-invoice repair list, (2) submit a single data-repair migration, (3) ship the Phase C code change, and (4) re-run the audit to confirm zero drift.
