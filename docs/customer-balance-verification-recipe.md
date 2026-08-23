# Customer balance verification recipe

Use this when a customer's balance on the Customer Ledger page differs from the
Customer Reconciliation page, or when an operator reports "wrong outstanding".

## 1. Get the master breakdown

Run the per-customer reconciliation RPC (returns one row per source):

```sql
SELECT * FROM public.reconcile_customer_balance(
  '<customer_id>'::uuid,
  '<organization_id>'::uuid
) ORDER BY source;
```

Expected sources: `opening_balance`, `total_invoiced`, `sale_return_adjust_on_invoices`,
`receipt_payments`, `balance_adjustment`, plus pending standalone returns / advances.
The signed sum of these rows IS `get_customer_true_outstanding`, which IS
`reconcile_customer_balances.calculated_balance` for this customer.

## 2. Compare against Customer Ledger

Open the customer's ledger page. Match line by line:

| RPC source                              | Ledger row                      |
| --------------------------------------- | ------------------------------- |
| `opening_balance`                       | Opening balance                 |
| `total_invoiced`                        | Gross sales (sum of net_amount) |
| `sale_return_adjust_on_invoices`        | Sale-return on invoice          |
| `receipt_payments`                      | Receipts (cash / settlement disc.) |
| `balance_adjustment`                    | Manual adjustments              |
| `advance_available` (from org RPC)      | Unused advance                  |
| pending standalone returns              | Pending CN pool                 |

Any line that differs identifies the bucket to debug.

## 3. Common drift causes

1. **Stuck "Not Paid" invoices** — `enforce_pay_later_zero_paid` was previously
   ignoring `reference_type='customer'` receipts. Widened in migration
   `20260606185800`. If you see this on a pay-later sale, re-run any voucher
   insert/update on the sale; the trigger now keeps the receipts.

2. **Threshold mismatch (₹0.51-₹1.00)** — DB used to mark `completed` at ≥cap-1,
   client at ≥cap-0.5. Aligned to ₹0.50 in migration `20260606190000`.

3. **CN double-credit** — `compute_sale_settlement` subtracts the billing return
   from CN receipts (`genuine_cn = max(0, cn - sra)`). If `derivePaidAndStatus`
   is called with raw `cnApplied`, it overstates `paid_amount`. Always pass the
   already-deduped CN portion, or call `applyRecomputedSalePaymentState` after
   the voucher insert and let the DB recompute.

4. **Display CTE drift on Reconciliation page** — sale-return total used to
   include returns linked to cancelled/hold invoices. Fixed in migration
   `20260606185930`.

5. **Partial CN remainder ignored** — `credit_status='partially_adjusted'` with
   `credit_available_balance > 0` must count the **remainder** in pending sale-return
   credit, not the full return net. Fixed in migrations `20260822150000` (helper
   `_sale_return_remaining_credit_for_balance`) and `20260823160000` (party v2).

6. **CN memo receipt double-count** — `credit_note_adjustment` receipt on an
   invoice is already represented in `sale_return_adjust_on_invoices`. Counting
   it again in `receipt_payments` inflates cash by the applied slice (Farhaan Fab:
   -2800 instead of -100). Fixed in migration `20260823180000` via
   `_is_settlement_memo_receipt` (matches JS `isReceiptMemoApplicationLedgerAligned`).
   **Any future SQL rewrite of party balances or reconcile MUST call this helper**
   for receipt totals — never hand-filter only `advance_adjustment`.

## 4. Parity audit (org-wide)

Run `scripts/audit-balance-formula-parity.sql` to compare
`get_customer_true_outstanding` against the TS `computeCustomerBalanceCore`
output (via a logged debug snapshot) for every customer in an org. Drift
> ₹1 indicates one of the causes above.

**Partial CN gate (post 20260823180000):** Run
`scripts/customer-balance-partial-cn-parity.sql` on ELLA NOOR and any org with
`partially_adjusted` sale returns. Blocks 2–3 must return zero drift rows.

**Unified balance gate (Phase D):** After migration `20260822183000`, run
`scripts/verify-customer-balance-unified-gate.sql` and locally
`npm run test:balance-gate`. See `docs/customer-balance-hardening-plan.md`.

## 5. Single source of truth (write path)

- Pre-insert sales: `derivePaidAndStatus` in `src/utils/saleSettlement.ts`.
- Post-insert sales: `applyRecomputedSalePaymentState` in
  `src/utils/recomputeSalePaymentState.ts` — delegates to the DB function
  `compute_sale_settlement(sale_id, org_id)`.
- Voucher events: `trg_sync_sale_payment_status_from_receipts` runs the same
  function automatically; do not write `paid_amount` inline alongside a
  voucher insert.