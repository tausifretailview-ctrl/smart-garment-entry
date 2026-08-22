# Customer balance hardening — implementation plan

**Goal:** One accurate customer balance on every page; no paid_amount / CN / return-pool drift on future transactions.

**Status:** Phase 1 (P0 app writes + UI) — P0-1 + P0-2 + P0-3 complete on branch `cursor/customer-balance-ui-p0-3-0051`

---

## Problem summary (Ella Noor evidence)

| Issue | Example | Root cause |
|-------|---------|------------|
| Paid drift | 11 invoices R5 batch | Inline `derivePaidAndStatus` writes vs `compute_sale_settlement` |
| CN double-apply | Shumama ₹61,900 ×2 | SRA + CN voucher both count |
| Return pool stale | Sharmin −₹11,500 Cr | `credit_available_balance` null on adjusted returns |
| Page disagreement | Ledger vs Party vs Outstanding tab | 3+ balance sources in UI |

---

## P0 — In progress (this PR series)

### P0-1 Single sale payment writer ✅ starting

**Rule:** After any receipt/advance/CN voucher mutates a sale, call `applyRecomputedSalePaymentState(saleId, orgId)` — never hand-write `paid_amount` / `payment_status`.

| File | Change |
|------|--------|
| `customerBalanceUtils.ts` | `syncSalePaymentsFromVouchersBatch` → `applyRecomputedSalePaymentState` |
| `BulkAdvanceAdjustDialog.tsx` | Remove inline paid update; recompute after FIFO |
| `SalesInvoiceDashboard.tsx` | Remove pre-voucher paid bump; recompute after voucher |
| `useSaveSale.tsx` | Recompute after insert/update when sale exists in DB |

**Keep `derivePaidAndStatus` for:** pre-insert UX only (cart totals before save).

### P0-2 Single CN writer RPC ✅ complete

**Spec:** `docs/customer-accounts-consistency-v1.md`

**DB (already live):** `supabase/migrations/20260606140000_cn_adjust_sync_guardrails.sql`

- `adjust_invoice_balance` returns `jsonb` with `voucher_entry_id`
- Creates `credit_note_adjustment` voucher inline via `generate_voucher_number`
- `trg_cn_adjust_sync` is sole writer of `credit_notes.used_amount`
- `apply_credit_note_to_sale` delegates to `adjust_invoice_balance` (FIFO)

**Client (this PR):**

| File | Change |
|------|--------|
| `saleSettlement.ts` | `createReceiptVoucher` blocks `credit_note_adjustment`; FIFO uses RPC only |
| `AdjustCustomerCreditNoteDialog.tsx` | RPC-only apply; reads `voucher_entry_id` for GL |
| `SettleCustomerAccountDialog.tsx` | CN via `applyCreditNoteFifoToSale`; `syncSaleFromVouchers` → `applyRecomputedSalePaymentState` |
| `saleReturnCnBalance.ts` | `ensureCreditNoteHeadroom` heal-down (never inflates CN header) |
| `FloatingSaleReturn.tsx` | POS CN redeem via `adjust_invoice_balance` RPC |

**Tests:** `test/money/cnAdjustConsistency.test.ts` — guard, RPC meta parse, pool helpers

### P0-3 One headline balance in UI ✅ complete

Standardize display on `get_customer_financial_snapshot.outstanding_dr`:

| Replace | With |
|---------|------|
| `OutstandingDashboardTab` invoice sum + SR/advance hack | Snapshot RPC headline; aging still invoice-based with SRA |
| `credit_applied` in invoice dashboard | `sale_return_adjust` only via `invoiceOutstandingAmount` |
| Payment picker sales-ledger fallback | `fetchCustomerFinancialSnapshotMap` retry |
| POS `FloatingPayments` inline fallback | `fetchCustomerFinancialSnapshot` |

**Tests:** `test/money/invoiceOutstandingDisplay.test.ts`

---

## P1 — Next

- Return pool invariant: on `credit_status = adjusted`, require `credit_available_balance = 0` or explicit remainder
- Nightly `paid_diverges_from_receipts` digest → WhatsApp alert
- Remove `warnSettlementPathMismatch` once all paths migrated
- Unify settlement tolerance (₹1 DB vs ₹0.99 UI)

---

## P2 — Polish

- Update `.cursor/rules` — document that `recomputeSalePaymentState` exists and is required
- Ledger: single primary “Amount owed”; RPC cross-check audit-only
- Deprecate `reconcileSaleInvoiceWithSplit` for **writes** (keep for display dedupe)

---

## Verification gates

| Gate | Command / screen |
|------|------------------|
| Unit | `npm run test:money` |
| Parity | `scripts/verify-customer-party-balances-parity.sql` |
| Paid invariant | `scripts/verify-paid-settlement-invariant-ella-noor.sql` |
| UI QA | Customer Reconciliation — 0 rows > ₹1 drift |
| Post-deploy | `run-invariant-digest` — `paid_diverges_from_receipts` count must not rise |

---

## Success criteria

- [x] All post-voucher write paths use `applyRecomputedSalePaymentState`
- [x] CN apply uses single RPC writer (no client duplicate voucher)
- [x] Customer Balances = Payment tab = POS picker = Ledger header (within ₹1)
- [ ] No new paid drift rows after 30 days of production traffic
