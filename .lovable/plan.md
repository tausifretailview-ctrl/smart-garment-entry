
# Customer Balance Consistency — Implementation Plan

Aligns runtime behavior with `mem/features/accounts/customer-balance-logic.md` rules 1–7 and `docs/customer-accounts-consistency-v1.md` (Option A). Reconciliation formula and `sale_return_adjust` semantics stay as-is; we are removing divergence and double-writes around CN application.

## Scope

In:
- `adjust_invoice_balance` RPC — single voucher writer, capped, jsonb return.
- `apply_credit_note_to_sale` RPC — align footprint, atomic voucher numbering.
- Client dialogs (Adjust CN, Settle) — stop double-inserting CN vouchers.
- `ensureCreditNoteHeadroom` — heal-down, never inflate CN header.
- Cosmetic backfill of `credit_applied`.

Out (unchanged):
- `consumeAdvanceFIFO` / advance lifecycle.
- `reconcile_customer_balances` formula.
- `useCustomerBalance` / `customerBalanceCore` math.
- `reconcileSaleInvoiceDisplay` dedupe (kept until all paths converge).

## Changes

### 1. Migration: `customer_accounts_consistency_v1.sql`

**`adjust_invoice_balance` (returns `jsonb`)**
- Lock sale `FOR UPDATE`; reject when `deleted_at IS NOT NULL`, `is_cancelled = true`, or `payment_status IN ('hold','cancelled')`.
- Cap: `p_amount_applied := LEAST(p_amount_applied, net_amount - paid_amount - sale_return_adjust)`; error if `<= 0`.
- Keep `sale_return_adjust += amount` (Option A). Stop writing `credit_applied` (leave existing values; no new writes).
- Recompute `payment_status` from `paid + sale_return_adjust` vs `net` (unchanged logic).
- Keep `credit_notes` / `customer_advances` pool update + `invoice_adjustments` insert.
- **New:** insert `voucher_entries` inline:
  - `CREDIT_NOTE` → `payment_method='credit_note_adjustment'`
  - `ADVANCE_PAYMENT` → `payment_method='advance_adjustment'`
  - `voucher_number := generate_voucher_number('receipt', voucher_date)` (atomic)
  - `reference_type='sale'`, `reference_id=p_invoice_id`, organization-scoped.
- Return `{ success, voucher_entry_id, amount_applied, sale_return_adjust, payment_status }`.

**`apply_credit_note_to_sale`**
- Replace `SELECT MAX(...)+1` with `generate_voucher_number('receipt', ...)`.
- Switch sale write from `paid_amount +=` to `sale_return_adjust +=` (single footprint with above).
- Add outstanding cap: `LEAST(p_apply_amount, net - paid - sale_return_adjust)`.
- Fix `payment_status` calc to include `sale_return_adjust`.
- Keep existing `deleted_at` / `is_cancelled` guards.

**Backfill (cosmetic, optional in same migration)**
- For rows where `credit_applied ≈ sale_return_adjust > 0`: leave or zero `credit_applied`. Do **not** touch `sale_return_adjust`.
- Do not zero `sale_return_adjust` even where matching CN vouchers exist (display layer dedupes).

### 2. Types regen
- `src/integrations/supabase/types.ts` — `adjust_invoice_balance` return type → `Json`.

### 3. Client edits

**`src/components/AdjustCustomerCreditNoteDialog.tsx`** (`applyInvoiceAllocationsViaRpc`)
- Read `voucher_entry_id` from RPC jsonb result.
- Remove fallback `createReceiptVoucher` for CN.
- Keep `recordJournalEntry` using returned voucher id.
- Keep `ensureCreditNoteHeadroom` call until (4) ships in same change.

**`src/components/SettleCustomerAccountDialog.tsx`** (`applyCnFifo`)
- Remove `createReceiptVoucher` after `adjust_invoice_balance`.
- Keep final `syncSaleFromVouchers` (still needed for cash/discount vouchers).
- Keep `sale_returns.credit_available_balance` post-apply sync.

**`src/utils/saleReturnCnBalance.ts`** (`ensureCreditNoteHeadroom`)
- Compute `cnRemaining = credit_amount - used_amount`.
- If pool > `cnRemaining`: update `sale_returns.credit_available_balance` **down** to `cnRemaining`. Never `UPDATE credit_notes SET credit_amount = ...` upward.
- If `amountNeeded > cnRemaining` after heal: throw `formatCnApplyError`.

**Optional cleanup**
- `src/pages/salesman/SalesmanCustomerAccount.tsx`: drop `credit_applied` from outstanding calc; rely on `sale_return_adjust`.

## Acceptance tests (manual, per customer)

1. Adjust CN → invoice: `sale_return_adjust ↑` once, exactly one `credit_note_adjustment` voucher, CN `used_amount ↑`, outstanding ↓.
2. Settle FIFO with CN: same; `syncSaleFromVouchers` leaves display consistent; no duplicate CN.
3. `apply_credit_note_to_sale` (hook/exchange): same footprint; voucher number unique under concurrent inserts.
4. Advance-only settle: unchanged (`consumeAdvanceFIFO`).
5. `reconcile_customer_balances` vs `useCustomerBalance` snapshot: within ₹1.
6. Return pool > CN header: CN header **not** inflated; pool healed or clear error.
7. Apply > outstanding: RPC caps or rejects.
8. Cancelled / deleted sale: RPC rejects.

## Order of execution

1. Write & approve migration (RPCs + cosmetic backfill).
2. Wait for types regen.
3. Update three client files (Adjust CN, Settle, headroom helper).
4. Optional salesman page cleanup.
5. Run acceptance tests on a customer with mixed CN/advance history.

## Risk

Low–medium. Behavior change is "RPC owns the CN voucher; client stops inserting a duplicate." Balance display already tolerates the transition via `reconcileSaleInvoiceDisplay` dedupe.

## Out of scope (explicit)

- Switching CN apply to `paid_amount += amount` (would break `sale_return_adjust`-based reconciliation).
- `customer_advances` redesign, `credit_note_amount` semantics, reconciliation formula changes.
- Deprecating `apply_credit_note_to_sale` entirely — phase 2.
