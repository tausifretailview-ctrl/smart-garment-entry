## Goal

Repair Khadija Sheikh's per-invoice allocation in Ella Noor so the invoice list, dashboard KPI, and `reconcile_customer_balance` all agree at **Cr ₹3,100**. Zero economic change; every write creates an audit-trail voucher.

Scope: single customer `aacca229-d4da-4c65-a7b7-39b528743fff`, org `3fdca631-1e0c-4417-9704-421f5129ff67`. Rest of the 22-customer list stays untouched pending your sign-off on this pilot.

Also: fix the pre-existing `BarcodePrinting.tsx` build error (`h_gap` → `v_gap` on line 2350) as a same-turn hotfix once we're in build mode.

## Migration steps (single atomic block)

### 1. Reset stale `credit_applied`

For INV/25-26/856 and INV/25-26/1194 — their backing CN vouchers were soft-deleted 2026-06-06 but `credit_applied` was never zeroed.

- Set `credit_applied = 0` on both.
- Call `compute_sale_settlement(sale_id, org_id)` on each → recomputes `paid_amount` / `payment_status` from real vouchers only. Post-state:
  - INV 856: paid 4,400, headroom 650, status `partial`.
  - INV 1194: paid 10,100, headroom 100, status `partial`.

### 2. FIFO-allocate balance-adjustment pool (₹11,050) via `adjust_invoice_balance`

Walk pending/partial invoices in `sale_date ASC`. For each, apply `LEAST(pool_remaining, net − paid − sale_return_adjust)`; the RPC writes a `credit_note_adjustment`-shape receipt voucher, atomically numbers it, bumps `sale_return_adjust`, and re-runs `compute_sale_settlement`.

Expected allocation:

| Invoice | Headroom | Applied | Pool left |
|---|---|---|---|
| INV/25-26/585 | 0 (overpaid) | 0 | 11,050 |
| INV/25-26/856 | 650 | 650 | 10,400 |
| INV/25-26/903 | 4,500 | 4,500 | 5,900 |
| INV/25-26/1194 | 100 | 100 | 5,800 |
| INV/26-27/1629 | 1,200 | 1,200 | 4,600 |

Post-state: all 18 invoices `completed`; ₹4,600 residual pool remains as unallocated balance-adjustment credit (represented by remaining `customer_balance_adjustments` rows — we mark ₹6,450 of them as used against the vouchers we just wrote via a linkage table, or leave them in place if the reconcile RPC keeps their outstanding_difference).

### 3. Verification (inside same transaction)

```sql
-- Must equal −3100 (unchanged pre → post)
SELECT sum(amount) FROM public.reconcile_customer_balance(<khadija>, <org>);

-- Must be 0 rows
SELECT sale_number FROM sales
WHERE customer_id=<khadija> AND organization_id=<org>
  AND deleted_at IS NULL AND COALESCE(is_cancelled,false)=false
  AND payment_status IN ('pending','partial');
```

`RAISE EXCEPTION` if either check fails → whole migration rolls back.

## Files

```text
supabase/migrations/<ts>_khadija_sheikh_fifo_reallocation.sql
  - DO $$ block scoped to one customer_id + org_id
  - No schema changes; uses adjust_invoice_balance + compute_sale_settlement

src/pages/BarcodePrinting.tsx
  - line 2350: rename `h_gap` reference to `v_gap` (matches type)
```

## Post-run manual check

Re-run the recipe from `docs/customer-balance-verification-recipe.md` for Khadija; expect all invoices completed, KPI "Pending ₹0" for this customer, ledger Cr ₹3,100.

## Not in scope

Other 21 customers, dashboard KPI vs row-list filter discrepancy (separate bug), and the org-wide auto-allocation rollout — those wait until this pilot verifies clean.
