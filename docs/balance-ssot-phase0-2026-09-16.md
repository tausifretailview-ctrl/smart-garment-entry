# Customer balance SSOT — Phase 0 (2026-09-16)

Read-only inventory after ELLA NOOR leftover-CN apply (`20261219120000` + `20261219120100`). No Phase 1 code in this note.

Org: ELLA NOOR `3fdca631-1e0c-4417-9704-421f5129ff67`. Do not scan KS FOOTWEAR / VELVET until the canonical function is proven here.

Full 48+17 screen table remains in `docs/balance-single-source-of-truth-inventory-2026-08.md`. This file is the **delta + formula families + Hanif + SSOT pick**.

---

## Hanif bhai −₹3,200 (resolved enough to start inventory)

After `20100`, party and snapshot **agree**: both **−₹3,200 Cr**. This is not an Almas-class ±mirror.

| Claim | Amount | Status |
|---|---:|---|
| Party / snapshot live (16 Sep 20100) | −₹3,200 | Aligned with each other |
| Unit-test economic remainder (SR ₹6,250 − CN ₹3,200) | **−₹3,050** | `test/money/customerBalance.test.ts` |
| Repair-queue “done” line | −₹3,050 | `docs/ella-noor-phase1-repair-queue.md` |
| Ledger recon “₹0” (if ₹3,050 cash was paid outside) | ₹0 | Open data question since 20 Aug — no refund voucher |

**Verdict:** still **wrong vs the documented remainder (−₹3,050)** by ₹150 extra credit, **or** it is displaying the **applied ₹3,200** as leftover pool (invoice Dr omitted). It is **not** a party-vs-snapshot split. Non-refunded remaining still uses `_sale_return_remaining_credit_for_balance` (CAB, else net − last `linked_sale_id` SRA) — **not** the all-invoice allocator used for refunded Almas/Fiza.

June `[cn_over_apply_repair_20260606]` soft-deleted RCP/330 (₹3,200 CN memo) while `sales.sale_return_adjust` on INV/287 stayed **0** and CAB/CN row were null. That data hole is in scope for the canonical function: define whether Hanif is −3050 (remainder), 0 (refund assumed), or +3200 (invoice unpaid, return ignored).

Comment-free probe: `/opt/cursor/artifacts/hanif-bhai-resolve-3200.sql` (also `scripts/ella-noor-hanif-bhai-balance-diagnostic.sql`).

**SSOT implication:** Phase 1 SQL must port **non-refunded** remaining to the same all-invoice consume as JS `computePendingStandaloneSaleReturns`, and lock Hanif to one number in the fixture suite. Do not treat −3200 as “correct because two RPCs match.”

---

## What changed since the August inventory

| Check | 2026-08-25 | 2026-09-16 after 20100 |
|---|---|---|
| ELLA NOOR party vs `snapshot_all` signed diffs > ₹1 | 663 (554 advance-shaped + **109 leftover-CN**, **17 mirrors**) | **0 diffs** on 2,545 overlap |
| Almas Motiwala | list Dr vs ledger ₹0 | **₹0 / ₹0** |
| Org Outstanding (party `total_dr`) | ₹27,20,799 | **₹25,03,452** (−₹2,17,347) |
| C-PARTY vs C-SNAP leftover-CN | disagreed | **same signed** on overlap |
| C-JS unused-advance treatment | unused **not** in `balance` | **unchanged** — still a family split |
| Enricher cap | 100 | **still 100** |

A2 signed-equality does **not** mean C-JS equals C-PARTY. Both SQL readers still subtract `unused_advance_pool` from signed balance; C-JS / ledger recon do **not**. Sana Nasir-class customers can still disagree **JS vs SQL** after this apply.

---

## Source families (customer) — formulas in plain terms

### C-JS — `getCustomerAccountState` (`src/utils/customerBalanceCore.ts`)

Used by `useCustomerBalance` (ledger first paint, POS chip, Sales Invoice header, payment banner).

Reads: sales, receipt/credit_note/payment vouchers, advances, advance refunds, sale returns, adjustments.

```
outstanding = opening + invoiced_gross − SRA − real_receipts − CN_vouchers
            + customer_payment_refunds − advance_used − paid_at_sale_drift
            − pending_SR_remaining − refunded_SR_remaining
```

- Unused advance is a **facet only** (`unusedAdvance`), not subtracted.
- Pending SR: all-invoice SRA absorb, skip refunded/cash_refund.
- Refunded SR: `net − all-invoice consumed`.
- Memos (`credit_note_adjustment` / advance apply) excluded from receipts when `ledgerAlignedApplicationReceipts`.

This is what Almas/Farhaan/Fiza unit tests treat as right.

### C-RECON-LEDGER — `computeInvoiceOutstandingFromReconciliation` (`src/utils/customerLedgerReconciliation.ts`)

Used by Customer Ledger recon panel + PDF footer, from **rendered transactions**.

```
outstanding = opening + gross_invoiced − invoice_CN_applied − saleReturns
            − cash − settlement_discount − advance_applied + adjustments
            + cnRefunded
```

- Unused advance **not** in this total (shown separately).
- `saleReturns` = remaining credit, not gross display credit (Farhaan).
- Ground truth for every repair this month **once the ledger table has loaded**.

Does not scale to 7,772 KPI cards.

### C-PARTY — `get_customer_party_balances` → `_get_customer_party_balances_rows`

List + org Outstanding/Credit/Net cards (cards use **raw SQL rows**, not the JS enricher).

```
signed = opening + invoiced_net − gated_SRA − receipts_excl_memos − paid_drift
       − SR_remaining − CN_vouchers + payment_refunds
       − advance_used − unused_advance_pool
```

- After 20100, `SR_remaining` = `_org_sale_return_balance_remaining` (refunded: all-invoice, **same customer**; else CAB/linked helper).
- **Nets unused advance into signed** (unlike C-JS).
- Fast set-based. Enricher `enrichPartyRowsWithCanonicalBalance` patches ≤100 filtered rows toward C-JS; org KPIs ignore it.

### C-SNAP — `get_customer_financial_snapshot` / `_all` / `_batch`

Ledger warnings, POS search, WhatsApp captions, salesman account card, many dialogs.

Same signed sum as C-PARTY after 20100 on ELLA NOOR overlap (`outstanding_dr`). Extra OUT: `advance_available`, `cn_available_total`, `gross_outstanding_dr = signed + advance`, `net_position = signed`.

`get_customer_financial_snapshot` (single-id) still calls `get_customer_true_outstanding` (sum of reconcile components) — keep that wrapper in the family.

### C-REC / C-TRUE — `reconcile_customer_balance` / `get_customer_true_outstanding`

Accounts Outstanding headline, Payments Dashboard, salesman list, accounting AR. Component list; after 20000 refunds **add**. Same leftover helper via `_customer_sale_return_credit_total`. Display callers of C-TRUE: **none** (`fetchCustomerTrueOutstandingMap` unused).

### C-STMT — `get_customer_ledger_statement` + client merge (`CustomerLedgerPage.tsx`)

Own running balance on `/customer-account-statement`.

### C-AUDIT — `customerAuditMath.computeCustomerOutstanding`

Delegates to core with a drift warning. Audit/recon screens.

### C-OB-SALES / C-OB

`opening + sales − paid` or `customers.opening_balance`. Known wrong. AI fallback, some salesman fallbacks.

---

## Screen count (still 48 customer / 17 supplier)

August C01–C48 / S01–S17 still apply. Highest-risk **independent** customer readers after 20100:

| ID | Surface | Family | After 20100 |
|---|---|---|---|
| C02 | Customer Balances org cards | C-PARTY raw | SQL; unused netted into signed |
| C08 | Ledger headline (first paint) | C-JS | JS; unused **not** netted; then C-RECON when txs load |
| C09/C10 | Ledger recon / PDF footer | C-RECON-LEDGER | JS from rows |
| C12/C13 | Dashboard net receivable | C-PARTY window | SQL |
| C14/C26/C46 | Accounts / Payments / Balance sheet AR | C-REC | SQL |
| C15–C16, C21–C23, C25, C27–C34, C43–C45 | Snapshot lists / WhatsApp / POS search | C-SNAP | SQL; now signed-equal to C-PARTY on ELLA overlap |
| C37 | Account statement | C-STMT | independent |
| C47 | AI outstanding | C-PARTY aligned | SQL |
| C48 | Khata FIFO | C-PARTY aligned | SQL |

Supplier track unchanged (S-JS vs S-PARTY vs S-ORG vs S-OB). Out of this ELLA NOOR customer initiative except as a parallel pattern.

---

## Which formula is long-term truth

**Logic:** C-RECON-LEDGER / C-JS (Almas ₹0, Farhaan −₹100, unused advance as a facet, all-invoice CN, refund adds then leftover CN offsets).

**Vehicle:** one **SQL set-based** function (evolve `_get_customer_party_balances_rows` or a new `_customer_balance_canonical_rows`) so 7,772 KPI cards stay one query.

**Not** JS-per-page as SSOT. **Not** “make C-PARTY match C-SNAP unused netting and call it done” — that already happened on overlap and still disagrees with ledger unused-advance semantics.

Facets from the **same row**:

- `signed_invoice_outstanding` — C-JS `balance` (no unused net)
- `unused_advance_pool`
- `unclaimed_sr_remaining` (pending + refunded leftover)
- `gross_outstanding_dr` = max(0, signed)
- `credit_pool_cr` = max(0, −signed) **or** signed+advance per existing UI Credit card (must pick one and document)
- `net_position` = signed − unused (only if UI still wants that view)

Every surface reads these columns. No second SUM.

---

## Phase 1 (not started — needs sign-off)

1. Port non-refunded remaining to all-invoice consume (Hanif −3050 lock).
2. Stop subtracting unused advance from canonical `signed` (or expose both `signed_net_of_advance` and `signed_invoice` and migrate C02/C12 with a fixture: Sana Nasir).
3. Point C-SNAP / C-REC at the same helper (thin wrappers).
4. Migrate C08 first paint to that RPC (kill flash). Then C09 as a display of the same components, not a second formula.
5. Remove `enrichPartyRowsWithCanonicalBalance` when patched-row count is 0.
6. Delete dead `fetchCustomerTrueOutstandingMap` display path; keep reconcile as a **debug dump of the canonical components**, not a second sum.

Do not start this until Hanif probe CSV confirms −3200’s components, and ELLA NOOR stays the only org.

---

## Phase 2–3 (later)

Lock Almas, Fiza, 17 mirrors, Farhaan, Sana, Aafra, Siya, Parishma, Anusha, Hanif in `test/money`. Cross-surface equality in CI. Scheduled digest: canonical vs any leftover reader, WhatsApp to platform admin (Parishma pattern #1).
