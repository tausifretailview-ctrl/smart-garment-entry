## Verification status — `customer_accounts_consistency_v1`

Cross-checked spec (`docs/customer-accounts-consistency-v1.md`) against repo. Core migration + client changes are in place. Two small follow-ups + a memory update remain.

### ✅ Already shipped (matches Option A)

**Migration `20260524190704_..._customer_accounts_consistency_v1.sql`**
- `adjust_invoice_balance` → returns `jsonb` (`success`, `voucher_entry_id`, `voucher_number`, `amount_applied`, `sale_return_adjust`, `payment_status`).
- `FOR UPDATE` lock on `sales`; rejects deleted / cancelled / `hold` / `cancelled` status.
- Caps `p_amount_applied = LEAST(amount, net − paid − sale_return_adjust)`.
- Bumps `sale_return_adjust += amount` only — stops writing `credit_applied`.
- Recomputes `payment_status` from `paid + sale_return_adjust` vs `net`.
- Updates `credit_notes` / `customer_advances` pool with capped amount.
- Inserts a single `voucher_entries` row inline with `payment_method = 'credit_note_adjustment' | 'advance_adjustment'`, `reference_type = 'sale'`, atomic `generate_voucher_number('receipt', …)`.
- Writes `invoice_adjustments` audit row.

**Migration — `apply_credit_note_to_sale`**
- Atomic `generate_voucher_number` (no more `MAX+1`).
- Outstanding cap `LEAST(p_apply_amount, net − paid − sale_return_adjust)`.
- Switched from `paid_amount +=` to `sale_return_adjust +=` (single footprint).
- `payment_status` now accounts for `sale_return_adjust`.
- Returns `jsonb` (`applied_amount`, `notes_used`, `voucher_number`).
- Guards: `deleted_at IS NULL`, `is_cancelled = false`, status not `hold`/`cancelled`, customer match.

**Client**
- `AdjustCustomerCreditNoteDialog.applyInvoiceAllocationsViaRpc` — reads `voucher_entry_id` from RPC jsonb, removed `createReceiptVoucher` fallback for CN, keeps `ensureCreditNoteHeadroom` pre-RPC.
- `SettleCustomerAccountDialog.applyCnFifo` — removed `createReceiptVoucher` after `adjust_invoice_balance`; kept `syncSaleFromVouchers` and `sale_returns.credit_available_balance` sync.
- `saleReturnCnBalance.ensureCreditNoteHeadroom` — heals `sale_returns.credit_available_balance` **down** to `cnRemaining`; throws via `formatCnApplyError` when `need > remaining`. No longer inflates `credit_notes.credit_amount`.

**Types**
- `src/integrations/supabase/types.ts`: `adjust_invoice_balance.Returns = Json`.

### ⚠️ Residual gaps to close in this pass

1. **`src/pages/salesman/SalesmanCustomerAccount.tsx`** still sums `credit_applied` into outstanding (lines 105, 297, 304). For new CN apply rows we no longer write `credit_applied`, so this branch under-deducts on new data and double-deducts on legacy rows where the mirror was historically stored. Fix the formula to:
   ```text
   outstanding = net_amount − paid_amount − sale_return_adjust
   ```
   Drop the `credit_applied` column from the select and the subtraction.

2. **`SettleCustomerAccountDialog.tsx`** — leftover `createReceiptVoucher` import (line 32). Still used legitimately for cash/refund vouchers at line 431; keep import, just confirmed no stray CN-path call remains.

3. **`FloatingSaleReturn.tsx`** — out of scope for v1 (POS exchange + pending-CN-redeem-at-POS). The `createReceiptVoucher` at line 915 writes `reference_type = 'customer'`, not a duplicate of the RPC voucher. Mark explicitly as **Phase 2 (deprecation of `apply_credit_note_to_sale` legacy hook)** — no change now.

### 📝 Memory update

Refresh `mem/features/accounts/customer-balance-logic.md`:
- Add: `adjust_invoice_balance` and `apply_credit_note_to_sale` now share the **Option A** footprint — RPC is the **only** voucher writer for `credit_note_adjustment` / `advance_adjustment`; clients must not double-insert.
- Add: `credit_applied` is **legacy / no longer written**; outstanding formula is `net − paid − sale_return_adjust` everywhere.
- Add: `ensureCreditNoteHeadroom` heals `sale_returns.credit_available_balance` down; never inflates `credit_notes.credit_amount`.
- Link → `docs/customer-accounts-consistency-v1.md` and migration `20260524190704_...customer_accounts_consistency_v1.sql`.

### Execution

1. Edit `SalesmanCustomerAccount.tsx` — drop `credit_applied` from select + outstanding calc.
2. Update `mem/features/accounts/customer-balance-logic.md` with the post-shipment facts above (and leave `mem://index.md` entry unchanged — same description still applies).
3. Smoke-run acceptance checklist (manual on a customer with mixed CN + advance + returns):
   - Adjust CN → one `credit_note_adjustment` voucher per row, `sale_return_adjust` bumped once, CN `used_amount` up.
   - Settle FIFO with CN → same; `syncSaleFromVouchers` leaves display clean.
   - `apply_credit_note_to_sale` via POS exchange → single voucher, unique number.
   - `reconcile_customer_balances` vs `useCustomerBalance` snapshot within ₹1.

### Out of scope (matches spec)

- Switching CN apply to `paid_amount +=` only.
- `customer_advances` lifecycle / `sales.credit_note_amount` semantics changes.
- Deprecating `apply_credit_note_to_sale` entirely (Phase 2).
- `customerBalanceCore` / `customerFinancialSnapshot` / reconciliation formula changes.
