---
name: customer-balance-logic
description: Master customer balance formula, reconcile_customer_balances RPC handles legacy reference_type patterns, advance_used (not total) subtracted
type: feature
---
The authoritative customer balance follows the Master Reconciliation formula:
**Balance = Opening + Gross Invoices - Cash Payments - Advance Used - Sale Returns + Refunds Paid + Adjustments**

Implemented in `reconcile_customer_balances(p_organization_id)` RPC and mirrored in `useCustomerBalance` hook.

**Critical correctness rules:**
1. **Cash payments classified by id-match, not reference_type string.** Voucher receipts are joined to `sales` ON `s.id = ve.reference_id` regardless of whether `reference_type` is 'sale' or 'customer'. Legacy data writes `reference_type='customer'` with `reference_id=sale_id`; classifying by reference_type string drops these receipts.
2. **Opening-balance payments** must use `JOIN customers c ON c.id = ve.reference_id` AND `NOT EXISTS (SELECT 1 FROM sales WHERE id = ve.reference_id)` so legacy sale-pointing rows are excluded.
3. **Subtract `total_advance_used`, NOT `total_advances`.** Advance-funded receipts (`payment_method='advance_adjustment'` or description LIKE '%adjusted from advance balance%') must be excluded from cash_pay so they aren't double-deducted.
4. **Credit-note adjustment receipts (`payment_method='credit_note_adjustment'`) ARE included in cash_pay** — they offset the separately-subtracted sale_returns.
5. The `useCustomerBalance` hook uses `Math.max(salePaidAmount, voucherAmount)` per sale to handle drift between `sales.paid_amount` and voucher sum.
