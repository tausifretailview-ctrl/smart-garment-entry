# Customer Balance / Advance / CN Adjustment — Consistency v1

**Status:** Spec (ready for implementation)  
**Supersedes:** Lovable audit draft that proposed moving `adjust_invoice_balance` to `paid_amount +=` only  
**Related:** `mem/features/accounts/customer-balance-logic.md`, `src/utils/customerBalanceCore.ts`, `src/utils/customerBalanceUtils.ts`

---

## Executive summary

Unify credit-note application into **one RPC contract** with **one sale-column semantics** and **one voucher writer**. Do **not** switch post-hoc CN apply to `paid_amount` only — that conflicts with `sale_return_adjust`, POS exchange, and `reconcile_customer_balance`.

**Chosen model (Option A — minimal change):**

| Event | `sales` column | `voucher_entries` |
|--------|----------------|-------------------|
| POS exchange / SR absorbed on bill | `sale_return_adjust` | optional at POS save |
| Post-hoc CN apply (Adjust CN, Settle FIFO) | **`sale_return_adjust += amount`** | **`credit_note_adjustment`** (created **inside RPC**) |
| FIFO CN via legacy hook | Align to same RPC **or** deprecate `apply_credit_note_to_sale` | same |
| Advance apply | **No change** — `consumeAdvanceFIFO` only | `advance_adjustment` |

`credit_applied` is **legacy mirror only** — stop treating it as source of truth; optional backfill to zero or mirror `sale_return_adjust`.

---

## What we checked

- DB RPCs: `adjust_invoice_balance`, `apply_credit_note_to_sale`, `reconcile_customer_balance(s)`
- `sales` columns: `net_amount`, `paid_amount`, `sale_return_adjust`, `credit_applied`, `credit_note_amount`, `payment_status`
- Callers: `AdjustCustomerCreditNoteDialog`, `SettleCustomerAccountDialog`, `FloatingSaleReturn`, `useCreditNotes`
- Balance consumers: `customerBalanceCore`, `customerBalanceUtils`, `customerFinancialSnapshot`, Settle `syncSaleFromVouchers`

**Current latest RPC:** `supabase/migrations/20260509143000_fix_adjust_invoice_balance_cn_consistency.sql`  
(`sale_return_adjust += amount`, mirrors `credit_applied = sale_return_adjust`, **no voucher**)

---

## Findings (validated against repo)

### 1. Two divergent RPC paths — **Confirmed**

| RPC | Sale update | Voucher |
|-----|-------------|---------|
| `apply_credit_note_to_sale` | `paid_amount +=` | Inserts `credit_note_adjustment` (MAX+1 numbering) |
| `adjust_invoice_balance` | `sale_return_adjust +=` | **None** (client inserts voucher) |

Same business event, different footprints. Must converge.

### 2. `credit_applied` — **Legacy only (wording correction)**

Outstanding formula in app + SQL:

```text
outstanding ≈ net_amount - paid_amount - sale_return_adjust
```

(+ voucher-aware dedupe in `reconcileSaleInvoiceDisplay` when CN is both in `sale_return_adjust` and `credit_note_adjustment` vouchers)

`credit_applied` is written as mirror of `sale_return_adjust` in latest `adjust_invoice_balance`; **not** used by `reconcile_customer_balance` or snapshot RPCs. Exception: `SalesmanCustomerAccount.tsx` still references it — fix or remove when touching callers.

### 3. CN “double record” — **Confirmed (mechanism)**

**Settle / Adjust CN flow today:**

1. `adjust_invoice_balance` → bumps `sale_return_adjust`
2. Client `createReceiptVoucher` → `credit_note_adjustment`
3. Settle: `syncSaleFromVouchers` → rewrites `paid_amount` from voucher sums

User-visible balance is often correct because `reconcileSaleInvoiceDisplay` dedupes CN already in `sale_return_adjust` (`DUPLICATE_CN_PAID_MATCH_TOL` in `customerBalanceUtils.ts`). The **`sales` row is internally inconsistent** until sync runs.

**Fix:** RPC becomes the **only** voucher writer; client stops duplicate inserts.

### 4. ADVANCE via `adjust_invoice_balance` — **Out of scope**

`ADVANCE_PAYMENT` branch exists in SQL but **no TypeScript caller** uses it. Advance settlement uses `consumeAdvanceFIFO` (`saleSettlement.ts`) — vouchers only, no `adjust_invoice_balance`.

### 5. `apply_credit_note_to_sale` voucher numbering — **Confirmed bug**

Uses `SELECT MAX(...) + 1` on `voucher_entries`. Must use `generate_voucher_number(p_type, p_date)` (existing atomic helper).

### 6. `ensureCreditNoteHeadroom` — **Confirmed harmful**

`src/utils/saleReturnCnBalance.ts` inflates `credit_notes.credit_amount` when return pool > CN header. **Change:** heal `sale_returns.credit_available_balance` down to CN remaining; throw if amount truly exceeds pool.

### 7. `apply_credit_note_to_sale` guards — **Partial gaps**

| Guard | Action |
|--------|--------|
| `deleted_at` / `is_cancelled` | Already present |
| `is_locked` on `sales` | **N/A** — column does not exist on `sales` |
| Cap vs outstanding | **Add:** `LEAST(p_apply_amount, net - paid - sale_return_adjust)` |
| `payment_status` | **Fix:** account for `sale_return_adjust`, not only `paid_amount` vs `net` |

---

## Design constraints (do not violate)

1. **Post-hoc CN reduces receivable via `sale_return_adjust`**, consistent with `reconcile_customer_balance` line `sale_return_adjust_on_invoices`.
2. **CN vouchers are audit trail** for GL / ledger; `paid_amount` on Settle may be reconciled via `syncSaleFromVouchers` — dedupe logic stays until all paths use single writer.
3. **Do not** move `adjust_invoice_balance` to `paid_amount +=` without **stopping** `sale_return_adjust` bumps for the same event (would double-reduce receivable).
4. **Do not** zero `sale_return_adjust` in backfill when matching CN vouchers exist — only cosmetic `credit_applied` cleanup if needed.

---

## Migration: `customer_accounts_consistency_v1.sql`

### 1. `adjust_invoice_balance` (CREDIT_NOTE + ADVANCE_PAYMENT branches)

**Return type:** change to `jsonb` e.g. `{ success, voucher_entry_id, amount_applied, sale_return_adjust }`

**Behavior:**

- Keep **`sale_return_adjust += p_amount_applied`** (Option A).
- **Stop** maintaining `credit_applied` as meaningful field (omit update or set `NULL` / leave mirror only during transition — prefer **stop writing**).
- **Insert voucher inside RPC:**
  - `CREDIT_NOTE` → `payment_method = 'credit_note_adjustment'`
  - `ADVANCE_PAYMENT` → `payment_method = 'advance_adjustment'` (for future callers; unused today)
  - Use `generate_voucher_number('receipt', voucher_date)`.
  - `reference_type = 'sale'`, `reference_id = p_invoice_id`.
- **Cap:** `p_amount_applied := LEAST(p_amount_applied, net_amount - paid_amount - sale_return_adjust)` (after `FOR UPDATE` on sale).
- **Guards on sale:** `deleted_at IS NULL`, `COALESCE(is_cancelled, false) = false`, exclude `payment_status IN ('hold','cancelled')` for apply (match existing status rules).
- Recompute `payment_status` from `paid_amount + sale_return_adjust` vs `net_amount` (same rules as current migration).
- Keep `invoice_adjustments` insert.
- Keep `credit_notes` / `customer_advances` pool updates.

### 2. `apply_credit_note_to_sale`

**Align with Option A** (recommended: thin wrapper or duplicate logic):

- After FIFO CN consumption, bump **`sale_return_adjust`** (not only `paid_amount`), OR delegate to unified internal function shared with `adjust_invoice_balance`.
- **Do not** also bump `paid_amount` for the same rupee unless Settle sync path is explicitly skipped (prefer **sale_return_adjust only** + voucher for audit).
- Replace MAX+1 with **`generate_voucher_number`**.
- Add outstanding cap: `LEAST(p_apply_amount, net - paid - sale_return_adjust)`.
- Fix `payment_status` to include `sale_return_adjust` in “settled” test.

**Deprecation note:** Long-term, route `useCreditNotes` + `FloatingSaleReturn` to the same RPC as Adjust/Settle; keep `apply_credit_note_to_sale` as wrapper during transition if needed.

### 3. One-time backfill (safe / cosmetic)

- Where `credit_applied` ≈ `sale_return_adjust` and both > 0: set `credit_applied = 0` OR leave as mirror — **do not** change `sale_return_adjust`.
- Log count of rows where `paid_amount` ≈ `sale_return_adjust` and a `credit_note_adjustment` voucher exists (informational; client already dedupes display).

### 4. Grants / types

- Regenerate or hand-update `src/integrations/supabase/types.ts` for new `adjust_invoice_balance` return type.

---

## Client edits

### 1. `AdjustCustomerCreditNoteDialog.applyInvoiceAllocationsViaRpc`

- After RPC success, read `voucher_entry_id` from `jsonb` response.
- **Remove** fallback `createReceiptVoucher` for CN when RPC returns id (keep GL `recordJournalEntry` using returned id).
- Keep `ensureCreditNoteHeadroom` call **before** RPC until headroom helper is fixed.

### 2. `SettleCustomerAccountDialog.applyCnFifo`

- **Remove** `createReceiptVoucher` after `adjust_invoice_balance` (RPC writes voucher).
- **Keep** `syncSaleFromVouchers` at end of settle loop (still needed for cash/discount vouchers + paid_amount display).
- Keep `sale_returns.credit_available_balance` sync after apply.

### 3. `saleReturnCnBalance.ensureCreditNoteHeadroom`

- **Replace inflate-CN behavior** with:
  - Compute `cnRemaining = credit_amount - used_amount`.
  - If `maxPoolFromReturn` (sale return pool) > `cnRemaining`, **update `sale_returns.credit_available_balance`** down to `cnRemaining` (or min of pool sources), not `credit_notes.credit_amount` up.
  - If `amountNeeded > cnRemaining` after heal, **throw** with `formatCnApplyError` message.

### 4. Optional cleanup

- `SalesmanCustomerAccount.tsx`: remove `credit_applied` from outstanding calc; use `sale_return_adjust` only.
- `useCreditNotes` / `FloatingSaleReturn`: switch to unified RPC when ready (phase 2).

### 5. No changes required (if Option A held)

- `customerBalanceCore.ts`, `customerFinancialSnapshot.ts`, `reconcile_customer_balance` RPC — already `sale_return_adjust`-aligned.
- `reconcileSaleInvoiceDisplay` — keep until all paths use RPC voucher-only; then simplify dedupe later.

---

## Implementation order

1. **Migration:** `adjust_invoice_balance` jsonb + inline voucher + cap + guards; stop writing `credit_applied`.
2. **Migration:** `apply_credit_note_to_sale` numbering + cap + `sale_return_adjust` alignment (or wrapper).
3. **Client:** `ensureCreditNoteHeadroom` heal-down behavior.
4. **Client:** Remove duplicate vouchers in Adjust CN + Settle.
5. **Types:** Supabase types regen.
6. **Backfill:** cosmetic `credit_applied` (optional).
7. **QA:** acceptance tests below.
8. **Phase 2:** Deprecate `apply_credit_note_to_sale` / single entry point.

---

## Acceptance tests

Per customer with mixed history:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Adjust CN → one invoice | `sale_return_adjust` ↑ once; one `credit_note_adjustment` voucher; CN `used_amount` ↑; outstanding ↓; no duplicate voucher from client |
| 2 | Settle with CN FIFO | Same; `syncSaleFromVouchers` leaves display consistent; no double CN in outstanding |
| 3 | `apply_credit_note_to_sale` (hook / exchange) | Same footprint as (1) after alignment; voucher number unique under concurrency |
| 4 | Advance only (Settle) | Unchanged — `consumeAdvanceFIFO` only |
| 5 | `reconcile_customer_balance` vs UI snapshot | Within ₹1 for same customer |
| 6 | Headroom when return pool > CN header | CN header **not** inflated; return pool healed or clear error |
| 7 | Apply > outstanding | RPC rejects or caps to outstanding |
| 8 | Cancelled / deleted sale | RPC rejects |

---

## Out of scope

- `customer_advances` lifecycle redesign.
- `sales.credit_note_amount` display column semantics.
- Customer-level reconciliation formula changes.
- `ADVANCE_PAYMENT` branch of `adjust_invoice_balance` unless a future feature wires it (then must use same voucher-in-RPC pattern).

---

## Risk

| Level | Notes |
|-------|--------|
| Low–medium | If Option A is followed: behavior change is “RPC owns voucher; stop dead `credit_applied` writes” |
| Higher | If migration switches to `paid_amount` only without removing `sale_return_adjust` bumps |

---

## Files touched (expected)

| Area | Files |
|------|--------|
| SQL | `supabase/migrations/<timestamp>_customer_accounts_consistency_v1.sql` |
| Client | `AdjustCustomerCreditNoteDialog.tsx`, `SettleCustomerAccountDialog.tsx`, `saleReturnCnBalance.ts` |
| Optional | `useCreditNotes.tsx`, `FloatingSaleReturn.tsx`, `SalesmanCustomerAccount.tsx` |
| Types | `src/integrations/supabase/types.ts` |

---

## Lovable / reviewer checklist

- [ ] Plan uses **`sale_return_adjust`**, not “fix via `paid_amount` only”
- [ ] RPC returns **`voucher_entry_id`**
- [ ] Client **does not** double-insert CN vouchers
- [ ] `generate_voucher_number` for all new receipt vouchers in these RPCs
- [ ] `ensureCreditNoteHeadroom` **heals down**, not inflates CN
- [ ] Backfill does **not** clear `sale_return_adjust` blindly
