# Customer balance hardening — implementation plan

**Goal:** One accurate customer balance on every page; no paid_amount / CN / return-pool drift on future transactions.

**Status:** Phase 1 (P0 app writes + UI) — P0-1 + P0-2 + P0-3 complete on branch `cursor/customer-balance-ui-p0-3-0051`

**Unified balance UI (Phases A–D):** Phases A/B/C/D on branch `cursor/unified-customer-balance-ui-0051` — single `get_customer_financial_snapshot` read path, SQL facet semantics, party page alignment, offline verification gate.

---

## Problem summary (Ella Noor evidence)

| Issue | Example | Root cause |
|-------|---------|------------|
| Paid drift | 11 invoices R5 batch | Inline `derivePaidAndStatus` writes vs `compute_sale_settlement` |
| CN double-apply | Shumama ₹61,900 ×2 | SRA + CN voucher both count |
| Return pool stale | Sharmin −₹11,500 Cr | `credit_available_balance` null on adjusted returns |
| Page disagreement | Ledger vs Party vs Outstanding tab | 3+ balance sources in UI |
| Partial CN remainder | Farhaan Fab −₹2,800 vs −₹100 | v2 ignored `partially_adjusted` CAB; CN memo counted in receipts |

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

### Partial CN hardening (20260823160000–180000) ✅

**SQL invariants for any future party-balance / reconcile rewrite:**

1. Sale-return credit: `_sale_return_remaining_credit_for_balance(net, cab, linked_sra)` — never `credit_status = 'pending'` only.
2. Receipt totals: exclude memos via `_is_settlement_memo_receipt(payment_method, description)` — not just `advance_adjustment`.
3. Never count CN applied slice twice: `sale_return_adjust_on_invoices` + full gross SR + CN adjust receipt.

**Verification gates added:**

| Gate | Location | Pass |
|------|----------|------|
| Partial CN SQL | `scripts/customer-balance-partial-cn-parity.sql` | Zero drift on blocks 2–3 |
| Farhaan sign-off | `scripts/verify-customer-party-balances-parity.sql` §0a | Farhaan Fab drift = 0 |
| Offline CN memo | `verifyPartialCnMemoExclusion` + Farhaan fixture test | Balance −100 with CN voucher |

---

## P2 — Polish

- Update `.cursor/rules` — document that `recomputeSalePaymentState` exists and is required
- Ledger: single primary “Amount owed”; RPC cross-check audit-only
- Deprecate `reconcileSaleInvoiceWithSplit` for **writes** (keep for display dedupe)

---

## Verification gates

| Gate | Command / screen | Pass condition |
|------|------------------|----------------|
| **Offline (CI/local)** | `npm run test:balance-gate` | Vitest facet + party alignment tests green |
| Unit (money path) | `npm run test:money` | All money tests green |
| SQL facet semantics | `scripts/verify-customer-balance-unified-gate.sql` gates D-0–D-4 | Zero drift rows after migration `20260822183000` |
| SQL party parity | `scripts/verify-customer-party-balances-parity.sql` | Zero drift rows (Ella Noor + POS orgs) |
| Partial CN parity | `scripts/customer-balance-partial-cn-parity.sql` | Zero drift on partially_adjusted subset |
| Paid invariant | `scripts/verify-paid-settlement-invariant-ella-noor.sql` | No new paid drift |
| UI QA | Customer Reconciliation | 0 rows > ₹1 drift |
| UI QA | Customer Balance Activity | RPC vs legacy within ₹1 |
| Cross-screen | Ledger = Payment = POS picker = Party | Same net within ₹1 per customer |
| Post-deploy | `run-invariant-digest` | `paid_diverges_from_receipts` count must not rise |

### Phase D — verification gate (offline + post-deploy)

**Offline (automated):**

```bash
npm run test:balance-gate
```

Runs `customerBalanceVerificationGate.test.ts`, `customerFinancialSnapshotFacets.test.ts`, and `customerPartyBalanceSnapshot.test.ts`. Pure TS checks for:

- Snapshot facet identities (`net_position = outstanding_dr`, `gross = net + advance`)
- Party row alignment with snapshot (Aafra recovery)
- Cross-screen headline parity within ₹1

**Post-deploy (owner / Lovable SQL editor):**

1. Apply migration `20260822183000_snapshot_facet_semantics.sql`
2. Run `scripts/verify-customer-balance-unified-gate.sql` — start with **DIAG** block, then gates D-0 through D-5
3. **SQL editor auth:** per-customer `get_customer_financial_snapshot` fails with `Authentication required` (assert_org_member). Gates use set-based `get_customer_financial_snapshot_all` + `get_customer_party_balances` instead — safe in postgres/service_role editor.
4. Run `scripts/verify-customer-party-balances-parity.sql` for Ella Noor + POS orgs (blocks using `get_customer_true_outstanding` may also need JWT — use party vs snapshot_all gates when auth fails)
5. Manual UI sign-off (gate D-6 checklist in unified gate script)
6. `run-invariant-digest` after any bulk repair

**30-day production gate (not yet started):** `paid_diverges_from_receipts` stable — track via nightly digest.

---

## Success criteria

- [x] All post-voucher write paths use `applyRecomputedSalePaymentState`
- [x] CN apply uses single RPC writer (no client duplicate voucher)
- [x] Customer Balances = Payment tab = POS picker = Ledger header (within ₹1) — app reads unified snapshot; SQL/UI gates in Phase D
- [ ] No new paid drift rows after 30 days of production traffic
