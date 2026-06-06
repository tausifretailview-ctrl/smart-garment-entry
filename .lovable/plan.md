# ELLA NOOR — Outstanding repair after CN over-application audit

The CSV lists 35 receipt vouchers on sales where a `credit_note_adjustment` was applied even though either no credit note existed (`REVERSE_NO_SOURCE`), an unprocessed sale-return pool should have been the source (`BACKFILL_FROM_PENDING_SR`), or CN issuance and application don't line up cleanly (`REVIEW_MIXED`). Net effect: customer outstanding is understated by **₹2,16,400** across 28 customers.

Goal: bring each customer's `get_customer_true_outstanding` back to the economically correct value without breaking sale-level paid_amount/payment_status integrity.

## Bucket plan

```text
Bucket                       Rows  Σ over-applied   Action
REVERSE_NO_SOURCE              28      1,57,600     Soft-delete voucher_entries, recompute sales
BACKFILL_FROM_PENDING_SR        4       72,250      Issue CN from the pending SR, re-link voucher to that CN
REVIEW_MIXED (Sharmin Mewara)   3       13,450      Manual: 1 case-by-case review before any write
```

## Steps (all run as migrations / supabase--insert, ELLA NOOR org only)

1. **Snapshot** — copy the 35 affected rows into `audit.ella_noor_cn_repair_20260606` (voucher_entries, sales.paid_amount/payment_status, credit_notes.used_amount).
2. **REVERSE_NO_SOURCE (28 rows)**
  - `UPDATE voucher_entries SET deleted_at = now(), deleted_reason = 'cn_over_apply_repair_20260606' WHERE id IN (…28 ids…)`.
  - For each sale_id, call `compute_sale_settlement(sale_id, org_id)` to refresh `paid_amount` and `payment_status` (the existing trigger fires on voucher delete; we'll call it explicitly to be safe).
3. **BACKFILL_FROM_PENDING_SR (4 rows: Shumama ×2, FAIZA, Parina)**
  - For each row, locate the oldest pending sale_return with sufficient `credit_amount` on the same customer.
  - Insert a `credit_notes` row (status='used', used_amount=cn_applied_amt, linked sale_return_id).
  - `UPDATE voucher_entries SET source_credit_note_id = <new cn id>` so the receipt is now backed by a real CN.
  - Mark the source `sale_returns.credit_status='adjusted'` and update `credit_notes.used_amount`.
  - Recompute the sale.
4. **REVIEW_MIXED (Sharmin Mewara — 3 invoices, ₹24,750 applied vs ₹11,300 issued = ₹13,450 excess)**
  - Manually decide which receipt(s) to partially/fully reverse. Default proposal: keep the earliest two (INV/231 ₹11,500 and INV/261 ₹1,950 = ₹13,450) backed by the ₹11,300 CN + ₹2,150 partial; reverse INV/397 ₹11,300 entirely. Needs confirmation before write.
5. **Customer recompute** — `SELECT public.reconcile_customer_balances('<ella_noor_org_id>')` then run `scripts/audit-balance-formula-parity.sql` — expect zero drift > ₹1.
6. **Verification report** — per-customer before/after table written to `/mnt/documents/ella_noor_outstanding_after_repair.csv` (opening, gross, receipts, CN applied, sale_returns, calculated_balance, delta vs pre-repair).

## Safety

- All writes scoped by `organization_id = ELLA NOOR` and the explicit voucher_id / sale_id lists from the CSV.
- Soft-delete only (no hard delete) — fully reversible from the snapshot table.
- Migration runs in a single transaction per bucket so a failure rolls back cleanly.
- Stock is not touched (CN-adjust receipts don't move stock).

## Clarifying question before I write the migration

For the `REVIEW_MIXED` Sharmin Mewara case (₹13,450 to reverse out of three invoices), should I:

- **A)** Use my default proposal above (reverse INV/26-27/397 RCP-00714 ₹11,300 in full, leave the other two), then re-check
- **B)** Reverse proportionally across all three receipts
- **C)** Skip Sharmin in this batch and handle separately

Reply with A / B / C and I'll generate the migration + verification CSV. Update with option A 