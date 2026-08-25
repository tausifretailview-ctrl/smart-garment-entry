# ELLA NOOR — Customer balance audit (2026-08)

**Status:** measurement + classification only. **No repairs. No voucher writes. No `paid_amount` / `legacy_paid_baseline` updates.**  
**Date of this pass:** 2026-08-25  
**Org:** ELLA NOOR / `ella-noor` / `3fdca631-1e0c-4417-9704-421f5129ff67` (confirmed live via `get_org_public_info`)  
**Runner SQL:** `scripts/ella-noor-customer-balance-audit-2026-08.sql`  
**Canonical party balance:** `_get_customer_party_balances_rows.out_signed_balance`  
**Independent recompute:** seven signed components below, threshold **> ₹1**  
**Batching:** every detail result set `LIMIT 1000` (PostgREST / SQL-editor row cap). Headline aggregates are single-row.

Related (do not duplicate, do not treat as this pass):

- `docs/ella-noor-phase1-repair-queue.md` — Aug 22 snapshot (783 customers, 144 recon drift > ₹1)
- `docs/customer-balance-verification-recipe.md` — seven RPC sources
- `docs/legacy-paid-baseline-double-count-2026-08.md` — Asma Shareef / INV/26-27/2288; 59 sales, ₹3.32L overstated in the July window
- `docs/customer-balance-hardening-plan.md` — CN memo / partial CN rules
- `scripts/ella-noor-receivables-audit.sql` **Section 3 is unsafe to reuse** — `reference_type IN ('sale','customer')` drops `CustomerReceipt`

---

## Verdict

This pass **did not repair anything** and **did not write**. The audit SQL is complete, with the four required corrections folded in **before** the queries, not after.

Live seven-component numbers, the full mismatch table, top-25 line-by-line, and live invariant hit counts **could not be filled from this Cloud Agent environment**. Anon REST against tenant tables and `v_accounting_invariants` returns `42501 permission denied` (see §0b). Empty / 401 is **not** zero drift.

What this document *does* contain:

1. The measurement method (seven components, both receipt-vocabulary eras, ₹1 threshold, 1000-row paging).
2. The Step 2 classification table with **Duplicate receipt** and **`legacy_paid_baseline`** as named rows.
3. Step 3 cross-checks that **join** `v_accounting_invariants` rather than re-deriving detectors.
4. A P0 / P1 / P2 **queue shape** plus the last-known Aug 22 names, clearly labelled stale.
5. Paste-back slots for SQL-editor output so the four deliverables can be completed without rewriting the method.

**Do not zero `legacy_paid_baseline` from this document.** Category-1 baselines (money paid with no reconstructable receipt) are legitimate; only the overlap shape `baseline > 0 AND receipts_total > 0` is the bug.

---

## 0. Method

### Seven-component recomputation

Signed sum, matching `reconcile_customer_balance` / the verification recipe. `sales.net_amount` is stored **post** `sale_return_adjust`.

| # | Component | Sign | Source |
|---|-----------|------|--------|
| 1 | `opening_balance` | + | `customers.opening_balance` |
| 2 | `total_invoiced` | + | `sales.net_amount` (excl cancelled / hold) |
| 3 | `sale_return_adjust_on_invoices` | − | `sales.sale_return_adjust`, gated on `items_gross` (party CASE) |
| 4 | `receipt_payments` | − | cash + settlement discount; **exclude** memos via `_is_settlement_memo_receipt` |
| 5 | `balance_adjustment` | + | `customer_balance_adjustments.outstanding_difference` |
| 6 | `pending_sale_returns` | − | `_sale_return_remaining_credit_for_balance` (not `credit_status = 'pending'` only) |
| 7 | `unused_advances` | − | advance pool net of used + refunds |

**Compare** `recomputed_7` to `_get_customer_party_balances_rows.out_signed_balance`. Flag when `ABS(party − recomputed_7) > 1`.

Party also subtracts four extra terms (`paid_at_sale_drift`, `credit_note_vouchers`, `customer_payment_refunds`, `advances_applied`). Those are **not** folded into the seven; Step 4 line-by-line (`reconcile_customer_balance`) shows them so a 7-vs-party gap that equals those extras is classified as extra-term alignment, not “customer is wrong”.

Canonical TS outstanding is `computeCustomerOutstanding` in `src/utils/customerBalanceUtils.ts` (via `computeCustomerBalanceCore`). That helper reports unused advance **separately** and does not subtract it from `balance`; party **does** subtract it. This audit follows party / reconcile for component 7.

### Four required corrections (folded in before run)

#### 1. Receipt vocabulary eras

Receipts **before 2026-05-29** are tagged `reference_type = 'CustomerReceipt'`; from that date, `'sale'`. Same cutover exists for `SupplierPayment`→`supplier`, `StudentFeeReceipt`→`student_fee`, `ExpenseVoucher`→`expense`; only the customer-receipt pair matters here.

The receipt-payments component is written as:

```sql
WHERE reference_type IN ('sale', 'CustomerReceipt')
```

If a query filters the new tag only, every customer with pre-cutover receipts looks like they owe more than they do. That is **not** real drift. It was the single largest hidden-money finding in this org (₹2.75 crore across the whole cutover).

Step 1 therefore emits both:

- `recomputed_7_both_eras` / `drift_both_eras` — the audit figure
- `recomputed_7_new_vocab_only` / `drift_new_vocab_only` — what the bug would have printed
- `vocab_query_artifact = true` when new-vocab-only disagrees by > ₹1 **and** both-eras agrees within ₹1

`SALE` / `customer` / `customer_payment` are extra app-canonical values (`CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES`). They are diagnostic columns (`receipt_payments_other_vocab`), not a third era. Customer-level (opening) receipts accept `CustomerReceipt` as well as `customer` so pre-cutover cash sitting on the customer id is not dropped.

**Do not copy** `scripts/ella-noor-receivables-audit.sql` Section 3 (`IN ('sale','customer')`).

#### 2. Duplicate receipt is its own class

Distinct from CN double-count. Failure mode: multiple genuine receipt vouchers on one invoice, not a credit note counted twice. Standing detector: `v_accounting_invariants.rapid_duplicate_receipt` (239 org-wide hits as the digest baseline). An account hitting this pattern is labelled `duplicate_receipt`, not `off_cause_unclear`.

#### 3. Step 3 joins the invariant view

`duplicate_voucher_number`, `rapid_duplicate_receipt`, and `receipts_exceed_invoice` are read from `v_accounting_invariants` (baselined 29 Jul). This audit does **not** rewrite the 5-minute duplicate detector or a second “receipts > invoice” query that could disagree with the digest.

#### 4. Named `legacy_paid_baseline` check

Not folded into generic paid-amount drift. Targeted shape (Asma Shareef, 59 sales, ₹3.32L overstated at last measurement):

```sql
legacy_paid_baseline > 0 AND receipts_total > 0
```

on the same sale, with `receipts_total` using the both-eras filter. The `set_config('app.settlement_recompute', …)` guard that is supposed to stop a receipt write from re-stamping baseline was found unset as recently as August. A generic `paid_amount` before/after diff can miss this mechanism even when it is the cause.

Generic `paid_amount` vs `compute_sale_settlement.new_paid` remains a **separate** class (`paid_amount_drift`).

---

## 0b. What this environment actually ran

| Probe | Result |
|-------|--------|
| `get_org_public_info('ella-noor')` | **200** — `id=3fdca631-…ff67`, name ELLA NOOR |
| `v_accounting_invariants` | **401** `42501 permission denied for table customers` |
| `customers` | **401** same |
| `_get_customer_party_balances_rows` | **401** permission denied for function |
| `get_customer_party_balances` / `get_customer_financial_snapshot_all` / `reconcile_customer_balances` | **401** |
| `invariant_daily_snapshot` | **200** `[]` (`content-range */0`) — RLS empty, not “no snapshots” |

Session copy: `docs/ella-noor-customer-balance-audit-2026-08/anon-rls-probe-2026-08-25.txt`.

`docs/legacy-paid-baseline-double-count-2026-08.md` §D12 recorded `v_accounting_invariants` as **anon-readable** on 2026-08-01 (three checks). Live on 2026-08-25 is not. Do not treat that older observation as current access.

**Intended runner:** Supabase SQL editor (postgres / service_role, `auth.uid()` IS NULL). Run **one numbered section** of `scripts/ella-noor-customer-balance-audit-2026-08.sql` at a time. If a detail result is exactly 1000 rows, bump `OFFSET` by 1000.

No writes were issued in this pass. No test org, no sample customers.

---

## 1. Headline numbers

### This pass (2026-08-25)

| Metric | Value |
|--------|-------|
| Org confirmed live | ELLA NOOR `3fdca631-1e0c-4417-9704-421f5129ff67` |
| Customers / Dr / Cr / net / unused advance | **not measured here** (tenant RPC 401) |
| Mismatch count (`ABS(party − recomputed_7) > 1`) | **not measured here** |
| Vocab-artifact count (new-vocab-only drift, both-eras OK) | **not measured here** — paste Step 0b + Step 1 `vocab_query_artifact` |
| `rapid_duplicate_receipt` hits (this pass) | **not measured here** (view 401). Standing digest baseline: **239** org-wide |
| `legacy_paid_baseline` ∩ receipts (this pass) | **not measured here**. Last measurement (July window): **59** sales, **₹3,32,306** overstated |

Paste Step 1b / Step 0b / Step 2b / Step 3a / Step 3e-sum here:

```
(paste SQL-editor headline row)
```

### Prior snapshot — 22 Aug 2026 (stale; not this pass)

From `docs/ella-noor-phase1-repair-queue.md`. Three days old. Use only as a scale check until Step 1b is pasted.

| Metric | Value |
|--------|-------|
| Customers | 783 |
| Recon drift > ₹1 | 144 |
| Total Dr | ₹32,07,872 |
| Total Cr | ₹18,32,454 |
| Net receivable | ₹13,75,418 |
| Unused advance pool | ₹18,11,617 |
| Paid-drift invoices (R5) | 11 — repaired Aug 22 |

---

## 2. Step 2 classification table

Primary class is assigned in this **order** (first match wins) so duplicate receipts are not dumped into CN or “unclear”.

| Class | What it is | Detector (this audit) | This-pass count | Last known |
|-------|------------|------------------------|-----------------|------------|
| **Receipt vocabulary artifact** | Query filtered new tag only; pre-29-May `CustomerReceipt` cash exists | Step 1 `vocab_query_artifact` | *paste* | ₹2.75 crore org-history finding if the filter is wrong; should be **0** with the required `IN ('sale','CustomerReceipt')` |
| **Duplicate receipt** | Multiple genuine receipt vouchers on one invoice (not a CN counted twice) | `v_accounting_invariants.rapid_duplicate_receipt` **joined**, not re-derived | *paste Step 2b* | **239** org-wide digest baseline |
| **CN double-count** | SRA on the invoice **and** a `credit_note_adjustment` voucher **and** remaining return-pool credit | Step 2 `cn_double` (SRA + CN voucher + remaining CAB). Distinct from duplicate receipt | *paste* | Shumama ₹61,900 ×2 (R2 done Aug 22); §1C export had 15 rows |
| **`legacy_paid_baseline`** | `legacy_paid_baseline > 0` **and** `receipts_total > 0` on the same sale | Named Step 2 / Step 3e check. **Not** generic paid drift | *paste Step 3e-sum* | Asma Shareef INV/26-27/2288; July window **59** sales / **₹3.32L** |
| **Paid-amount drift** | `sales.paid_amount` ≠ `compute_sale_settlement.new_paid` | Step 2 `paid_drift` (distinct from baseline) | *paste* | 11 invoices R5, repaired Aug 22 |
| **Receipts exceed invoice** | Receipts > net + SRA + ₹1 | `v_accounting_invariants.receipts_exceed_invoice` joined | *paste Step 3a* | digest (29 Jul+) |
| **Duplicate voucher number** | Two+ live vouchers share `voucher_number` | `v_accounting_invariants.duplicate_voucher_number` joined | *paste Step 3a* | digest (29 Jul+) |
| **Return pool stale** | Remaining sale-return credit disagrees with party / CAB hygiene | Step 4 line-by-line `pending_sale_returns` vs party | *paste* | Sharmin / Tanvi R3 done Aug 22 |
| **Advance over-refund / over-apply** | Refund or draw exceeds booking | View checks `advance_refund_exceeds_*` / `advance_applied_exceeds_invoice` via Step 3a rollup (still joined, not rebuilt) | *paste* | §1E had 53 rows (Anusha Pathan ₹5,450) |
| **Off, cause unclear** | Residual after every named class | Step 2 `primary_class = off_cause_unclear` | *paste* | — |

If a flagged customer’s mismatch **collapses** when `CustomerReceipt` is added to the receipt filter, the report line is a **query artifact**, not a customer error. Step 1’s `vocab_query_artifact` column is that test.

---

## 3. Full mismatch table

**This pass:** not populated (tenant RPC 401).

**Contract** (Step 1, `LIMIT 1000`, page with `OFFSET`):

| Column | Meaning |
|--------|---------|
| `customer_id` / `customer_name` | Active customer |
| `party_signed` / `party_direction` | Canonical |
| `recomputed_7_both_eras` | Audit figure (required vocab pair) |
| `drift_both_eras` | `party − recomputed_7_both_eras` |
| `drift_new_vocab_only` | What a `'sale'`-only filter would print |
| `vocab_query_artifact` | True iff new-vocab-only is a false flag |
| seven component columns | opening, invoiced, SRA, receipts (both / legacy / new / other), adjustments, pending SR, unused advance |

Paste Step 1 CSV here:

```
(paste)
```

If the result is exactly 1000 rows, it is truncated — re-run with `OFFSET 1000`. ELLA NOOR had 783 customers on 22 Aug, so one page should cover the org unless the customer file has grown past 1000.

---

## 4. Top-25 Dr / top-25 Cr — line-by-line verification

**This pass:** not executed (party RPC 401). SQL: Step 4a (Dr) and Step 4b (Cr). Each name is expanded through `reconcile_customer_balance` plus the party RPC row so extras (`paid_at_sale_drift`, CN vouchers, refunds, advances applied) are visible next to the seven.

**How to verify a row (SQL editor, after 4a/4b):**

1. Confirm `SUM(reconcile sources) ≈ party_signed` within ₹1. If not, the customer is a real mismatch.
2. Confirm `receipt_payments` is not missing a `CustomerReceipt` slice (Step 0 / `vocab_query_artifact`).
3. Tag named classes from Step 2 (duplicate receipt vs CN double vs baseline vs paid drift).
4. Do **not** write a voucher or adjust `paid_amount` from this sheet.

### Last-known names (22 Aug 2026 — stale, incomplete, not a top-25)

From Phase 1 exports. **Not** this pass’s verification. Missing names are not “settled”; they were never listed in that queue doc.

**Dr (known):**

| Customer | Party (22 Aug) | Notes from Phase 1 (not re-verified today) |
|----------|----------------|--------------------------------------------|
| Sumaiya Chhapra Bhabhi | ₹4,73,730 Dr | ₹2,06,350 recon gap; payments not on invoices — review, not a write |
| Samiya Nursumar Bhabhi | ₹4,55,820 Dr | party = recon (drift 0) on 22 Aug |
| SHUMAMA BAIRELI | ₹1,58,700 Dr | R2 CN double-apply repaired Aug 22; party verified |
| Saba Ali | ₹90,843 Dr | ₹43,933 recon gap; pending SR |
| Siya Kapoor | ₹62,250 Dr | CN + advance ₹21,700 |
| SHEHNAZ HALAI | ₹51,010 Dr | Advance ₹24,850 + recon gap |
| Tanvi Taufu | ₹2,950 Dr | R3 return-pool hygiene Aug 22 |

**Cr (known):**

| Customer | Party (22 Aug) | Notes |
|----------|----------------|-------|
| Saniya Mahaldar | ₹40,000 Cr | Advance pool ₹40,000 |
| ASMA AKIL MEMON | ₹24,950 Cr | Advance pool ₹24,950 |
| NASIM VAPI | ₹24,850 Cr | Advance pool ₹44,800 |
| Sana Nasir | ₹20,000 Cr | Advance pool ₹20,000 |
| Fariba Qureshi | ₹13,400 Cr | Advance pool ₹13,400 |
| KHADIJA SHEIKH | ₹8,800 Cr | CN repair-batch customer |
| Sharmin Mewara | ₹0 Settled | Was ₹11,500 Cr; R3 CAB zeroed Aug 22 |

Paste Step 4a / 4b here:

```
(paste)
```

---

## 5. P0 / P1 / P2 repair queue (queue only)

**No item in this list is authorised to run.** Dry-run SELECT, five-row hand-check, repair tag, and invariant digest remain mandatory before any future mutate — see bulk-money rules in `AGENTS.md`.

Ranking in Step 5 SQL:

| Tier | Rule (this audit) | Action when a later repair pass is signed |
|------|-------------------|-------------------------------------------|
| **P0** | `ABS(party) ≥ ₹1,00,000` **or** baseline overlap `≥ ₹50,000` | Owner review first. Baseline overlap: capture live `compute_sale_settlement` DDL before touching the column. Do not zero all baselines. |
| **P1** | Named class: duplicate receipt, CN double-count, `legacy_paid_baseline` overlap, receipts-exceed | Classify correctly (duplicate receipt ≠ CN). Join the invariant view for the first of those. |
| **P2** | Remaining non-settled / micro drift / extra-term alignment | No write unless the shop disputes. |

### Queue from this pass

Not ranked (RPC 401). Paste Step 5 here:

```
(paste)
```

### Last-known queue (22 Aug — stale)

| Tier | Customer | Last-known party | Issue | Repair status as of 22 Aug |
|------|----------|------------------|-------|----------------------------|
| P0 | Sumaiya Chhapra Bhabhi | ₹4,73,730 Dr | Recon gap ₹2,06,350 | Review only |
| P0 | SHUMAMA BAIRELI | ₹1,58,700 Dr | CN double-apply | **R2 done** |
| P0 | Tanvi Taufu | ₹2,950 Dr | Return pool | **R3 done** |
| P1 | FAIZA SALMAN MERCHANT | — | SR/35 CAB | Dry-run in `ella-noor-p1-cn-repair.sql` |
| P1 | Parina Bhujwala | — | SR/64 vs INV/1245 | Dry-run in same script |
| P1 | Saba Ali | ₹90,843 Dr | CN / pending SR | Breakdown pending |
| P1 | Siya Kapoor | ₹62,250 Dr | CN + advance | Breakdown pending |
| P2 | NASIM VAPI, ASMA AKIL MEMON, Saniya Mahaldar, Fariba Qureshi, Sana Nasir | Cr / advance-heavy | Advance pool | §1D / §1E |
| — | Asma Shareef (INV/26-27/2288) | — | `legacy_paid_baseline` ∩ receipt | **Named check this audit;** last July window 59 sales / ₹3.32L. Not in the Aug 22 P0 list because it was filed as a paid-amount / invoice-UI bug, not a party-RPC mismatch |

R5 (11 paid-drift invoices) and Sharmin R3 are **done** as of 22 Aug; do not re-queue as if untouched.

---

## 6. Query-artifact checklist

Before treating any Step 1 flag as a real customer error:

1. Step 0 shows `CustomerReceipt` settlement amount. If that amount is material and the receipt filter omitted it, **stop** — the flags are the May cutover artifact.
2. Step 1 `vocab_query_artifact = true` → label the row **query artifact**, not P0.
3. Duplicate receipt hits come from `v_accounting_invariants`, not a homegrown 5-minute join. If the view count and a homemade detector disagree, **trust the view** and fix the homemade query.
4. `legacy_paid_baseline` overlap is labelled that, even when `paid_amount` also disagrees with `compute_sale_settlement`. Do not collapse it into generic paid drift.
5. CN double-count requires SRA **and** a CN voucher **and** remaining pool. Duplicate genuine RCP rows without a CN memo are **duplicate receipt**.

---

## 7. How to finish the four deliverables

In the SQL editor, in order:

1. Step 0 + 0b — vocabulary proof  
2. Step 1b — headlines  
3. Step 1 — mismatch table (page if 1000)  
4. Step 2 + 2b — classification  
5. Step 3a–3e — invariant join + named baseline check  
6. Step 4a / 4b — top 25 Dr / Cr  
7. Step 5 — queue  

Paste the result sets into the slots above. Still no writes.

---

## Appendix A — SQL map

| Section | File | Delivers |
|---------|------|----------|
| 0 / 0b | `scripts/ella-noor-customer-balance-audit-2026-08.sql` | Vocabulary eras |
| 1 / 1b | same | Mismatch table + headlines |
| 2 / 2b | same | Classification including duplicate receipt + baseline |
| 3a–3d | same | `v_accounting_invariants` joins |
| 3e / 3e-sum | same | Named `legacy_paid_baseline` check |
| 4a / 4b | same | Top-25 line-by-line |
| 5 | same | P0/P1/P2 queue (SELECT only) |

## Appendix B — What was not done

- No `INSERT` / `UPDATE` / `DELETE`
- No `adjust_invoice_balance` / `createReceiptVoucher`
- No baseline zeroing
- No assumption that anon empty = zero drift
- No reuse of receivables-audit Section 3’s new-vocab-only receipt filter
