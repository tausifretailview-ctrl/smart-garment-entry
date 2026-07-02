## Problem

For KHADIJA SHEIKH and 21 similar customers in ELLA NOOR, backing Credit Note vouchers were soft-deleted in a prior cleanup, but the `sales.credit_applied` field on each invoice was left behind as stale data. The `reconcile_customer_balance` RPC correctly ignores the deleted vouchers, so net balance shows ₹3,100 Cr — but the dashboard row-level "Pending" still uses `credit_applied`, which is why some invoices look partially paid when their credit source no longer exists.

Net result for KHADIJA: ₹6,450 truly pending on 4 invoices + ₹9,550 floating credit pool = ₹3,100 Cr net.

## Goal

Re-allocate each customer's floating credit pool onto their actual pending invoices so:
- Row-level "Pending" on the Sales Invoice Dashboard matches the ledger
- `sales.credit_applied` and `sale_return_adjust` reflect real, non-phantom credits
- `reconcile_customer_balance` output stays unchanged (net position preserved)

## Plan

### 1. Discovery (read-only, one script)
`scripts/ella-noor-floating-credit-audit.sql`:
- For each of the 22 customers, list:
  - pending invoices (net − paid − sale_return_adjust − credit_applied > 0) oldest-first
  - stale `credit_applied` on fully-paid invoices where backing voucher is deleted
  - floating credit pool = (sum of stale credit_applied) + (any unallocated `customer_advances`)
- Store output to `docs/ella-noor-floating-credit-plan.md` for user review before write.

### 2. Data repair migration (one transaction per customer via RPC)
New RPC `public.reallocate_customer_floating_credit(p_org_id uuid, p_customer_id uuid)`:
1. Reset `credit_applied = 0` on invoices whose backing credit-note voucher is deleted (phantom entries).
2. Compute floating pool for that customer.
3. FIFO-apply the pool to pending invoices: set new `credit_applied` on each until pool exhausted; last invoice may be partial.
4. If pool > total pending, remainder stays as `customer_advances` (unused credit).
5. Recompute `payment_status` (`paid`/`partial`/`pending`) via existing `derivePaidAndStatus` logic.
6. Insert a row in `balance_reconciliation_log` for audit.
7. Assert `reconcile_customer_balance` net = pre-repair net (parity gate; abort on drift > ₹1).

Driver migration loops the RPC over the 22 customer IDs found in step 1.

### 3. UI (already partially done last turn)
`SalesInvoiceDashboard.tsx` currently uses `Math.max(sale_return_adjust, credit_applied)` as a defensive display fix. After the repair migration, `credit_applied` will be accurate again, so:
- Revert row display to plain subtraction `net − paid − sale_return_adjust − credit_applied`.
- Same for `pageTotals`, Excel export, payment dialogs.
- Keep `credit_applied` in the SELECT projections.
- Revert `get_invoice_dashboard_stats` RPC to plain subtraction.

### 4. Verification
- Run `scripts/verify-customer-party-balances-parity.sql` — expect 0 drift rows for the 22 customers.
- Spot-check KHADIJA on Sales Invoice Dashboard: 4 pending invoices should absorb the ₹9,550 pool, leaving ₹3,100 Cr as an unused advance (or full absorption if pending ≥ pool).

### Technical notes
- All writes scoped by `organization_id = <ELLA NOOR>` + `customer_id`.
- Soft-delete policy respected — no rows deleted; only `credit_applied` field values reset.
- Historical journal entries untouched; parity assertion guards the ledger.
- Migration is idempotent: rerunning finds pool = 0 and no-ops.

## Deliverables
1. `scripts/ella-noor-floating-credit-audit.sql` (read-only report)
2. `docs/ella-noor-floating-credit-plan.md` (per-customer allocation preview — you approve before step 3)
3. Migration: `reallocate_customer_floating_credit` RPC + driver call for 22 customers
4. UI revert in `SalesInvoiceDashboard.tsx` + `invoiceDashboardData.ts` + `get_invoice_dashboard_stats` RPC to plain subtraction
5. Post-repair verification query output
