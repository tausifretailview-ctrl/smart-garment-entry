# ELLA NOOR — Customer balance audit (2026-08)

**Status:** **SUPERSEDED (evening 2026-08-25).** Today's **717 / 647 / ₹1,10,91,413** classification is **not** to be treated as a live-data finding until Step 6 is pasted. SELECT-only. **No writes. No `paid_amount` architecture recommendation (A or B).**  
**Org:** ELLA NOOR / `ella-noor` / `3fdca631-1e0c-4417-9704-421f5129ff67`  
**Canonical party balance:** `_get_customer_party_balances_rows.out_signed_balance` (live page)  
**Run next:** `scripts/ella-noor-step6-memo-hole.sql` (6a Sana, 6b CN shape) then `scripts/ella-noor-step6-org.sql` (6d headline, 6e remaining)

Related (do not duplicate, do not treat as this pass):

- `docs/ella-noor-phase1-repair-queue.md` — Aug 22 snapshot (783 customers, 144 recon drift > ₹1)
- `docs/customer-balance-verification-recipe.md` — seven RPC sources
- `docs/legacy-paid-baseline-double-count-2026-08.md` — Asma Shareef / INV/26-27/2288; 59 sales, ₹3.32L overstated in the July window
- `docs/customer-balance-hardening-plan.md` — CN memo / partial CN rules
- `scripts/ella-noor-receivables-audit.sql` **Section 3 is unsafe to reuse** — `reference_type IN ('sale','customer')` drops `CustomerReceipt`

---

## Correction — Sana Nasir (recompute hole, not live party)

Manual check of the largest P0 line (Sana Nasir, ₹11,00,900 gap) found **the live page is correct and the independent recompute is wrong.**

She deposited ₹11,20,900 in advances; ₹11,00,900 is `used_amount`. 93 of 94 receipt vouchers are `advance_adjustment` totalling exactly ₹11,00,900. One real cash/UPI voucher: ₹13,550. **used + cash = ₹11,14,450 = total invoiced.** Remaining unused advance = ₹20,000 = the −₹20,000 Cr on the live page. **She owes nothing.**

Today's seven-component sum excluded `advance_adjustment` via `_is_settlement_memo_receipt` and only subtracted `unused_advances` (remaining pool). Consumed `used_amount` sat in a hole between those two. The live party function already subtracts `advances_applied` (`used_amount`) **and** unused **and** excludes memos from cash — so the page was right.

Including `advance_adjustment` in receipts does **not** double-count with `unused_advances`, because unused is leftover, not consumption. Recompute with those vouchers included = −₹20,000, matching the live page. Equivalent when vouchers match used: also subtract `used_amount` and keep the memo exclusion (party-parity column `recomputed_7_plus_used_amount`).

`pending_sale_returns` **is** the same remaining-balance shape (via `_sale_return_remaining_credit_for_balance`). CN **consumption** is `sale_return_adjust`, not pending_sr. Including `credit_note_adjustment` on top of SRA is the Farhaan Fab −₹2,800 double-count. **Do not copy the advance fix onto CN** until STEP 6b says `looks_like_advance_hole` (expect `sra_matches_cn_memos` instead).

**paid_amount option A vs B is on hold.** A large share of the 647 "party trusts `paid_amount`" rows may be this hole (Sana's 1e join would fire: gap = used_amount). No architecture recommendation until 6d is pasted.

| Formula | Sana Nasir signed balance |
|---------|---------------------------|
| Live party | **−₹20,000** (correct) |
| Today's excl-memo 7-sum | ₹10,80,900 (wrong — hole = used_amount) |
| Incl `advance_adjustment` in receipts | **−₹20,000** |
| Excl-memo plus subtract `used_amount` | **−₹20,000** |

Paste slots (SQL editor):

| Section | File | Expect |
|---------|------|--------|
| **6a** | `scripts/ella-noor-step6-memo-hole.sql` | Sana: `party_signed = −20000`, `recomputed_7_incl_advance_memo` matches, `used_plus_cash_equals_invoiced` |
| **6b** | same | Top 25 CN-memo customers: `sra_matches_cn_memos` vs `looks_like_advance_hole` |
| **6d** (includes 6c) | `scripts/ella-noor-step6-org.sql` | `n_closed_by_incl_advance_memo`; `n_zero_memo_formulas_differ = 0`; `n_p0_after_incl_advance` |
| **6e** | same | Remaining names after correction, biggest `gap_incl_advance` first |

```
(paste Step 6d one-row headline)
```

```
(paste Step 6e remaining rows — this is the corrected P0/P1 list)
```

---

## Verdict (morning 2026-08-25 — **do not act on these numbers**)

This pass **did not repair anything** and **did not write**. No change to `_get_customer_party_balances_rows`, `paid_amount`, or `legacy_paid_baseline`.

The morning headline below assumed the seven-component recompute was the independent truth. **Sana Nasir disproves that.** Keep the numbers as a before-snapshot of the *memo-blind* formula only.

**Tender-column hypothesis: disproved for ELLA NOOR.** Step 1c came back with `paid_at_sale_tender = 0` on every customer, `n_dual_write_sales = 0`, and `abs_drift_with_tender_rupees` identical to the receipts-only figure (**₹1,15,59,763**). This org’s `cash_amount` / `card_amount` / `upi_amount` are empty.

**Receipts-only Step 1 is the live mismatch:** 717 customers, party always lower than recompute, abs drift **₹1,15,59,763**.

**Step 1e (decisive, now classified):** of the **251** zero-receipt customers with real invoiced amount, **`n_flagged_whose_gap_equals_paid_amount = 234`**. That is the named pattern **Party trusts `paid_amount` over receipts** — live balance credits `sales.paid_amount` directly; independent recompute (receipts + tender + advances) disagrees. Same field as the documented `legacy_paid_baseline` self-reinflation bug. This is **not** a data-entry mistake on those 234 accounts. `credit_applied` did **not** explain the leftover **17**.

**Step 2c (headline, live):** **682** of 717 customers classified (95%). **647** of those (**₹1,10,91,413**, 96% of ₹1,15,59,763) are **Party trusts `paid_amount` over receipts**. **35** other named patterns. **35** genuinely unexplained — their own worklist; do not force-fit.

**Step 5b (live):** **`n_p0 = 33`**, **`n_p0_party_trusts_paid_amount = 33`**. Every P0 row is the named `paid_amount` pattern. The 33 names: paste **`scripts/ella-noor-step5-p0-names.sql`** as the only SQL-editor statement. This checkout has the anon key only (`42501` / RLS empty is not an empty P0 list).

Do **not** fold `paid_amount` into the seven-component recompute. Repair needs Tausif’s sign-off, same as every other repair this month.

### Classification headlines (717 customers / ₹1,15,59,763)

| Slice | Customers | Rupees of abs drift |
|-------|-----------|---------------------|
| Total mismatch | **717** | **₹1,15,59,763** |
| **Classified** | **682** (95%) | *paste Step 2c remainder + ₹1,10,91,413* |
| **Party trusts `paid_amount` over receipts** | **647** | **₹1,10,91,413** (96% of total drift) |
| Other named patterns (dup receipt, CN, baseline, adj, advance, refund, orphan) | **35** (= 682 − 647) | *paste `rupees_other_named_patterns`* |
| **Genuinely unexplained** (own worklist — do not force-fit) | **35** | *paste `rupees_genuinely_unexplained`* |
| Zero-receipt + invoiced (Step 1e set) | **251** | *paste* |
| Of those 251, 1e join (subset of the 647) | **234** | *paste* |
| Leftover of the 251 | **17** | *paste Step 2-17* |
| Some receipts recorded, still mismatched | **466** | *paste Step 2-466* |

Run **Step 5 + 5b + 5-unexplained** in the SQL editor for names and the P0 exposure. This Cloud Agent cannot aggregate tenant rows (`42501` / RLS empty). **Empty RLS is not a zero P0.**

**Do not zero `legacy_paid_baseline` from this document.**

---

## 0. Method

### Seven-component recomputation

Signed sum, matching `reconcile_customer_balance` / the verification recipe. `sales.net_amount` is stored **post** `sale_return_adjust`.

| # | Component | Sign | Source |
|---|-----------|------|--------|
| 1 | `opening_balance` | + | `customers.opening_balance` |
| 2 | `total_invoiced` | + | `sales.net_amount` (excl cancelled / hold) |
| 3 | `sale_return_adjust_on_invoices` | − | `sales.sale_return_adjust`, gated on `items_gross` (party CASE) |
| 4 | `receipt_payments` | − | cash + settlement discount on vouchers. **Morning pass excluded memos** via `_is_settlement_memo_receipt`. **Step 6:** that exclusion plus remaining-only `unused_advances` drops consumed `used_amount` into a hole (Sana Nasir). Keep excl-memo columns; corrected column includes `advance_adjustment`. Do **not** include `credit_note_adjustment` until 6b confirms (SRA already holds CN apply). |
| 4b | `paid_at_sale_tender` (diagnostic) | − | per-sale residual after `compute_sale_settlement`: `LEAST(net, GREATEST(receipts, cash+card+upi)) − receipts`. **Not** a raw sum of tender onto receipts |
| 5 | `balance_adjustment` | + | `customer_balance_adjustments.outstanding_difference` |
| 6 | `pending_sale_returns` | − | `_sale_return_remaining_credit_for_balance` (not `credit_status = 'pending'` only) |
| 7 | `unused_advances` | − | advance pool net of used + refunds |

**Compare** `recomputed_7_both_eras` (receipts only) **and** `recomputed_7_with_tender` to `_get_customer_party_balances_rows.out_signed_balance`. Flag when `ABS(party − recompute) > 1`. Do not drop the receipts-only figure — it is the before-snapshot for this correction.

Party also subtracts `paid_at_sale_drift` (tender minus receipts, **uncapped** in the party RPC) plus `credit_note_vouchers`, `customer_payment_refunds`, `advances_applied`. The Step 1 tender diagnostic uses the **capped** settlement function, not `paid_amount`, and not party’s uncapped `GREATEST(0, tender − receipts)`. Residual after tender-close can still be those extra terms or the cap difference.

Canonical TS outstanding is `computeCustomerOutstanding` in `src/utils/customerBalanceUtils.ts` (via `computeCustomerBalanceCore`). That helper reports unused advance **separately** and does not subtract it from `balance`; party **does** subtract it. This audit follows party / reconcile for component 7. Ledger residual tender is `residualPaymentAtSaleTender` (`customerAuditBundle.ts`) — same “tender minus receipts, never sum” idea; settlement then caps at `net_amount`.

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

#### 5. Named class — Party trusts `paid_amount` over receipts

Classification only. Join (same as Step 1e):

```sql
ABS(gap_recompute_minus_party − SUM(sales.paid_amount)) <= 1
```

**234** of the 251 zero-receipt invoiced mismatches hit this. They must not land in `off_cause_unclear`. On the 466 with some receipts, the same join is “full”; inflation is `gap ≈ GREATEST(0, paid − receipts)` (party v2 `GREATEST(paid_amount, tender)` with tender = 0). **Do not** put `paid_amount` into `recomputed_7`. **Do not** patch the party function in this pass.

Offline lock: `test/money/ellaNoorPaidAmountClass.test.ts`.

### Why the original Step 1 undercounted (tender residual)

The receipts-only recompute treated “paid” as **voucher_entries only**. Party / `reconcile_customer_balance` / `compute_sale_settlement` also credit cash that sits on the sale row (`cash_amount + card_amount + upi_amount`) when that tender is **not** already covered by a receipt. Skipping it makes every such customer look like they owe more than party says — hence 717 mismatches, all the same sign, including Siya Kapoor.

**Do not fix that by summing tender onto receipts.** `SalesInvoiceDashboard.handleRecordPayment` (documented 15 Aug / `docs/legacy-paid-baseline-double-count-2026-08.md`) can write **both** a `paid_amount`/tender bump **and** a receipt voucher for the same money. Unconditional `receipts + tender` would double-count those bills up to `net_amount`.

Live `compute_sale_settlement` (repo-latest body):

```text
tender = cash_amount + card_amount + upi_amount
IF tender > receipts THEN
  new_paid = LEAST(net_amount, GREATEST(receipts, tender))
ELSE
  new_paid = LEAST(net_amount, receipts)
```

That is `LEAST(net, GREATEST(receipts, tender))` — **max, then cap**. It does **not** read `paid_amount` or `legacy_paid_baseline`.

Step 1 now emits, per customer, **without overwriting the first-run columns**:

| Column | Meaning |
|--------|---------|
| `receipt_payments_both_eras` | Unchanged — voucher cash only, both vocabulary eras |
| `paid_at_sale_tender` | Sum of per-sale residual `GREATEST(0, LEAST(net, GREATEST(receipts, tender)) − receipts)` |
| `recomputed_7_both_eras` | Unchanged — receipts only |
| `recomputed_7_with_tender` | Same seven-component formula with `(receipt_payments_both_eras + paid_at_sale_tender)` in place of receipts alone |
| `drift_with_tender` | `party_signed − recomputed_7_with_tender` |
| `tender_closes_mismatch` | True iff receipts-only drift > ₹1 **and** `|drift_with_tender| ≤ 1` |
| `dual_write_sale_count` / `dual_write_overlap_est` | FLAG: sale has a non-memo receipt **and** non-zero tender. No winner picked this pass |

Step 1c is the one-row headline for “how many of the 717 close”. Step 1d is the dual-write customer/sale list. Offline formula lock: `test/money/ellaNoorAuditTenderCap.test.ts`.

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

### Receipts-only Step 1 (SQL editor, 2026-08-25 — first run)

This is the **before** snapshot. `party_signed` matched the captured `balance_before` exactly. Do not treat these 717 as real customer errors.

| Metric | Value |
|--------|-------|
| Mismatch (`ABS(party − recomputed_7_both_eras) > 1`) | **717** |
| Sign | party < recompute on **every** row |
| Zero-receipt mismatches with real invoices | **247** on first dump; **251** on Step 1c |
| Siya Kapoor | in the 717; live Payments + PDF were already correct in July |

### Tender-corrected Step 1c (SQL editor — **disproved for this org**)

| Metric | Value |
|--------|-------|
| `n_mismatch_receipts_only` | **717** |
| `n_of_those_now_within_1` | **0** |
| `n_mismatch_with_tender` | **717** |
| `abs_drift_receipts_only_rupees` | **₹1,15,59,763** |
| `abs_drift_with_tender_rupees` | **₹1,15,59,763** (identical) |
| `n_mismatch_zero_receipts_with_invoices` | **251** |
| `n_dual_write_sales` | **0** |
| `paid_at_sale_tender` | **₹0** on every customer |

ELLA NOOR tender columns are empty. Keep the diagnostic; do not revert.

### Step 1e — `paid_amount` / `credit_applied` on the 251 (paste live row)

Both columns **exist** on live `sales` (confirmed 2026-08-25: PostgREST `select=paid_amount,credit_applied` HTTP 200; `this_column_does_not_exist` → `42703`). Generated `types.ts` matches (`sales.Row.paid_amount`, `sales.Row.credit_applied`).

Repo context (not a substitute for the 1e row):

- Latest `_get_customer_party_balances_rows` in-repo (`20260911150000`) does **not** read `paid_amount` or `credit_applied`.
- Older party v2 (`20260823140000`) `paid_at_sale_drift` **does** use `GREATEST(paid_amount, tender)` and still fires when tender is 0 and `paid_amount > 0` — the 251 shape, if live DDL was not swapped.
- `credit_applied` is a **legacy mirror of `sale_return_adjust`** (`docs/customer-accounts-consistency-v1.md`). It is not a party-RPC input. Subtracting it on top of SRA double-counts the mirror. Step 1e reports `sum_credit_applied_beyond_sra` separately.

Run **Step 1e**. One row. SELECT-only. Do not write `paid_amount`. **Measured:** `n_flagged_whose_gap_equals_paid_amount = **234**` of 251. `credit_applied` did not explain the leftover 17.

| Metric | Value |
|--------|-------|
| `n_flagged_customers` | **251** |
| `n_sales_on_flagged` | *paste* |
| `sum_paid_amount` | *paste* |
| `n_sales_paid_amount_nz` | *paste* |
| `sum_credit_applied` | *paste* |
| `n_sales_credit_applied_nz` | *paste* |
| `n_sales_either_nz` | *paste* |
| `sum_credit_applied_beyond_sra` | *paste — new channel leftover, not the SRA mirror* |
| `n_sales_credit_applied_eq_sra` | *paste — mirror count* |
| `sum_gap_recompute_minus_party` / `abs_gap_on_flagged` | *paste* |
| `paid_amount_vs_gap_rupees` | *paste — coverage only; do not fold into recompute* |
| `credit_beyond_sra_vs_gap_rupees` | *paste* |
| `n_flagged_whose_gap_equals_paid_amount` | **234** |
| `n_flagged_whose_gap_equals_credit_beyond_sra` | did **not** explain the leftover 17 |

```
(paste Step 1e one-row result — 234 is already known)
```

The **234 names** are Step 2-paid, not this aggregate. How to read the rest of 1e:

1. **`credit_beyond_sra` material and `n_flagged_whose_gap_equals_credit_beyond_sra` high** → would have been a named diagnostic; it is **not** the leftover-17 answer.
2. **234 of 251: gap = `SUM(paid_amount)`** → named class **Party trusts `paid_amount` over receipts**. Do **not** add `paid_amount` to the seven-component sum. Repair is a separate sign-off.
3. The ₹1,15,59,763 / 717-customer drift is **real**. Most of the 251 slice is this named class; the 466 still need Step 2-466 / 2c.

### Org headline (Step 1b)

| Metric | Value |
|--------|-------|
| Org confirmed live | ELLA NOOR `3fdca631-1e0c-4417-9704-421f5129ff67` |
| Customers / Dr / Cr / net / unused advance | **not measured here** (tenant RPC 401) — paste Step 1b |

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

Primary class is assigned in this **order** (first match wins) so `party_trusts_paid_amount` is tagged, not dumped into “unclear”. Duplicate receipts stay distinct from CN. **682** classified / **35** unexplained.

| Class | What it is | Detector (this audit) | This-pass count | Last known |
|-------|------------|------------------------|-----------------|------------|
| **Party trusts `paid_amount` over receipts** | Live balance credits `sales.paid_amount` directly; independent recompute (receipts + tender + advances) disagrees. Same field behind `legacy_paid_baseline` self-reinflation. Not a data-entry mistake on the customer’s account — the party function is reading a less reliable source of truth. **Not folded into recompute.** | Step 1e / 2-paid join: `ABS(gap_recompute_minus_party − paid_amount_sum) <= 1`. On the 466, also inflation (`gap ≈ paid − receipts` or per-sale `SUM(GREATEST(0, paid − receipts_on_sale))`) and partial (inflation covers some of the gap). | **647** customers / **₹1,10,91,413**. Includes **234** of the 251 zero-receipt 1e join. | Older party v2 `GREATEST(paid_amount, tender)` even when tender = 0 |
| **Paid-at-sale tender residual** | Voucher receipts missing; cash sits on `cash_amount`/`card_amount`/`upi_amount` | Step 1 `tender_closes_mismatch` | **0** (disproved — tender columns empty) | Diagnostic kept |
| **Dual-write (receipt + tender)** | Same sale has a receipt voucher **and** non-zero tender | Step 1d FLAG list | **0 sales** | Keep the FLAG query |
| **`credit_applied` leftover** | Legacy SRA mirror vs a real at-sale credit channel | Step 1e `sum_credit_applied_beyond_sra` | **did not explain the leftover 17** | Spec: mirror only |
| **Receipt vocabulary artifact** | Query filtered new tag only; pre-29-May `CustomerReceipt` cash exists | Step 1 `vocab_query_artifact` | *paste* | ₹2.75 crore org-history finding if the filter is wrong; should be **0** with the required `IN ('sale','CustomerReceipt')` |
| **Duplicate receipt** | Multiple genuine receipt vouchers on one invoice (not a CN counted twice) | `v_accounting_invariants.rapid_duplicate_receipt` **joined**, not re-derived | *paste Step 2b*; also run on the 17 (Step 2-17) | **239** org-wide digest baseline |
| **CN double-count** | SRA on the invoice **and** a `credit_note_adjustment` voucher **and** remaining return-pool credit | Step 2 `cn_double`. Distinct from duplicate receipt | *paste*; also Step 2-17 | Shumama ₹61,900 ×2 (R2 done Aug 22); §1C export had 15 rows |
| **Manual-adjustment overlay** | Gap equals `SUM(customer_balance_adjustments.outstanding_difference)` — one side is overlaying a manual outstanding patch | Step 2-17 / 2c `manual_adjustment_overlay` | *paste Step 2-17 / 2c* | — |
| **Advance over-application** | Gap equals `SUM(customer_advances.used_amount)` (party extra term vs seven-component) | Step 2-17 / 2c `advance_over_application` | *paste* | §1E had 53 rows (Anusha Pathan ₹5,450) |
| **Unrecorded refund** | Gap equals customer `payment` vouchers (`reference_type = customer`) — party subtracts these; seven-component does not | Step 2-17 / 2c `unrecorded_refund` | *paste* | Party CTE `customer_payment_refunds` |
| **Orphan receipt** | Receipts still sitting on **soft-deleted** sales of this customer | Step 2-17 / 2c `orphan_receipt` | *paste* | — |
| **`legacy_paid_baseline`** | `legacy_paid_baseline > 0` **and** `receipts_total > 0` on the same sale | Named Step 2 / Step 3e check. **Not** generic paid drift. Distinct from “party trusts `paid_amount`” (that class is gap vs `paid_amount`, including zero-receipt rows) | *paste Step 3e-sum* | Asma Shareef INV/26-27/2288; July window **59** sales / **₹3.32L** |
| **Paid-amount drift** | `sales.paid_amount` ≠ `compute_sale_settlement.new_paid` | Step 2 `paid_drift` (distinct from baseline **and** from party-trusts-paid_amount) | *paste* | 11 invoices R5, repaired Aug 22 |
| **Receipts exceed invoice** | Receipts > net + SRA + ₹1 | `v_accounting_invariants.receipts_exceed_invoice` joined | *paste Step 3a* | digest (29 Jul+) |
| **Duplicate voucher number** | Two+ live vouchers share `voucher_number` | `v_accounting_invariants.duplicate_voucher_number` joined | *paste Step 3a* | digest (29 Jul+) |
| **Return pool stale** | Remaining sale-return credit disagrees with party / CAB hygiene | Step 4 line-by-line `pending_sale_returns` vs party | *paste* | Sharmin / Tanvi R3 done Aug 22 |
| **Off, cause unclear** | Residual after every named class (including party-trusts-paid_amount) | Step 2c / Step 5-unexplained `off_cause_unclear` | **35** — own worklist; do **not** force-fit | — |

If a flagged customer’s mismatch **collapses** when `CustomerReceipt` is added to the receipt filter, the report line is a **query artifact**, not a customer error. Step 1’s `vocab_query_artifact` column is that test.

The old row “`paid_amount` on zero-receipt invoices” **is this named class**. It is not generic `paid_amount_drift` and it is not `legacy_paid_baseline` overlap (`baseline > 0 AND receipts > 0`).

### Step 2-paid — the 234 names

SQL: **Step 2-paid**. Same join as 1e. `primary_class = party_trusts_paid_amount`. Expect 234 rows (under the 1000 cap).

```
(paste Step 2-paid customer_id / customer_name / abs_gap / paid_amount_sum)
```

### Step 2-17 — leftover worklist (251 − 234 = 17)

`credit_applied` and `paid_amount` both ruled out. SQL: **Step 2-17** runs duplicate receipt, CN double-count, `legacy_paid_baseline`, manual-adjustment overlay, advance over-application, unrecorded refund, orphan receipt, receipts-exceed, duplicate voucher, generic paid-amount drift against **these 17 only**.

```
(paste Step 2-17 — 17 names + primary_class + flag columns)
```

### Step 2-466 — mismatches with some receipts (717 − 251)

Same 1e join, plus inflation and partial. SQL: **Step 2-466** (one row) and **Step 2-466-list** (names the pattern explains).

| Metric | Value |
|--------|-------|
| `n_some_receipts` | *paste — expect 466* |
| `n_466_full_1e_join` | *paste* |
| `n_466_inflation` | *paste* |
| `n_466_partial` | *paste* |
| `n_466_explained_fully_or_partially` | *paste* |
| `n_466_not_explained_by_paid` | *paste* |
| `abs_gap_on_466` / rupee splits | *paste* |

```
(paste Step 2-466 one-row result)
```

### Step 2c — rupee split of ₹1,15,59,763

One row. Named pattern vs other named patterns vs genuinely unexplained. Other named patterns are counted only on customers **not** already explained by party-trusts-paid_amount (no double-count).

```
(paste Step 2c)
```

---

## 3. Full mismatch table

**This pass:** not populated (tenant RPC 401).

**Contract** (Step 1, `LIMIT 1000`, page with `OFFSET`):

| Column | Meaning |
|--------|---------|
| `customer_id` / `customer_name` | Active customer |
| `party_signed` / `party_direction` | Canonical |
| `receipt_payments_both_eras` | Voucher cash only (unchanged) |
| `paid_at_sale_tender` | Settlement residual (max then cap); addable to receipts without dual-write SUM |
| `recomputed_7_both_eras` | Receipts-only seven-component (first-run figure) |
| `recomputed_7_with_tender` | Same formula with receipts + residual tender |
| `drift_both_eras` | `party − recomputed_7_both_eras` (717-row before) |
| `drift_with_tender` | `party − recomputed_7_with_tender` |
| `tender_closes_mismatch` | Receipts-only flag that disappears under tender |
| `vocab_query_artifact` | True iff new-vocab-only is a false flag |
| `dual_write_sale_count` | FLAG — both a receipt and non-zero tender |
| seven component columns | opening, invoiced, SRA, receipts (legacy / new / other), adjustments, pending SR, unused advance |

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
3. Tag named classes from Step 2 (party-trusts-paid_amount vs duplicate receipt vs CN double vs baseline vs paid drift).
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

The full 717-row export is **Step 5** in `scripts/ella-noor-customer-balance-audit-2026-08.sql` (`LIMIT 1000` — one page covers 717). Markdown here holds the headline, the P0 slice (once pasted), and the 35 unexplained as their own worklist. Do not dump 717 names into this file.

Tiers (this pass — matches Step 5 SQL; baseline-overlap-only is no longer a P0 shortcut):

| Tier | Rule | What a later signed repair would do |
|------|------|-------------------------------------|
| **P0** | `ABS(party_signed) ≥ ₹1,00,000` **or** `ABS(gap) ≥ ₹50,000` | Owner review first. For `party_trusts_paid_amount`: architecture decision (A vs B below) before any write. |
| **P1** | Named pattern **and** (`ABS(party_signed) ≥ ₹5,000` **or** `ABS(gap) ≥ ₹5,000`) | Pattern-specific write in `proposed_write` (named vouchers / sales). |
| **P2** | Remaining named, or unexplained with `ABS(gap) > ₹1` | No write unless the shop disputes. Unexplained stay unexplained. |

`proposed_write` is specific, same grain as Siya Kapoor / Parishma / Farhaan Fab this month:

| `named_pattern` | Write that would fix it (still not authorised) |
|-----------------|------------------------------------------------|
| `party_trusts_paid_amount` | **On hold.** Morning pass left (A) correct `paid_amount` vs (B) stop crediting it in party. Sana Nasir shows the 1e join can fire on the recompute hole. No A/B until Step 6d. |
| `duplicate_receipt` | Soft-delete the **named voucher(s)** on the row after dry-run + 5-row hand-check (Parishma class — do not auto-delete). |
| `legacy_paid_baseline` | Named **sale(s)** on the row (Asma Shareef / INV/26-27/2288 shape). Capture live `compute_sale_settlement` DDL first. Do not zero all baselines. |
| `cn_double_count` | Named **sale(s)**. Repair only via `adjust_invoice_balance` (Shumama R2). No bare `createReceiptVoucher`. |
| `manual_adjustment_overlay` | Named **adjustment row(s)**. Do not reverse a shop-entered patch without dry-run. |
| `advance_over_application` | Named **advance_number(s)**. Do not auto-refund (Anusha class — human judgement). |
| `unrecorded_refund` | Named **payment voucher(s)**. Confirm real refund vs CN memo (Farhaan Fab) before any write. |
| `orphan_receipt` | Named **deleted sale + voucher**. Recycle-bin investigation — no hard delete. |
| `off_cause_unclear` | **No write.** Fresh look. Do not force-fit into `party_trusts_paid_amount`. |

### Step 5b — P0 count and rupee exposure (paste the one-row result)

This is the number that decides how urgently the `paid_amount` architecture conversation needs to happen. Run **Step 5b**. Empty RLS is not zero P0.

| Metric | Value |
|--------|-------|
| `n_p0` | **33** |
| `abs_gap_p0` | *paste — P0 drift rupees (primary exposure)* |
| `abs_party_p0` | *paste — sum of \|party_signed\| on P0* |
| `n_p0_party_trusts_paid_amount` | **33** |
| `abs_gap_p0_party_trusts_paid_amount` | *paste — same as `abs_gap_p0` if all 33 are this pattern* |
| `n_p0_unexplained` | **0** |
| `n_classified` / `n_genuinely_unexplained` | **682** / **35** |

```
(paste Step 5b one-row result)
```

### P0 names — Tausif review list (Step 5-P0) — **superseded pending Step 6**

The 33-name list from `scripts/ella-noor-step5-p0-names.sql` was ranked on the **memo-blind** gap. Sana Nasir (largest line) is a recompute artifact, not a live debt. **Do not use that list for a `paid_amount` architecture decision.** After 6d/6e, the corrected P0 is `queue_tier_after_correction = P0` on remaining mismatches only.

**Runner:** paste `scripts/ella-noor-step5-p0-names.sql` as the **only** statement in the SQL editor (one result set, 33 rows). Same query lives as **Step 5-P0** in the big audit file. `legacy_paid_baseline_nonzero` is a flag on `valid_sales` (any sale with `legacy_paid_baseline > 0`), not a second voucher join tree.

This Cloud Agent cannot fill the 33 names. Confirmed 2026-08-25: `_get_customer_party_balances_rows(p_organization_id)` → HTTP 401 `42501`; `customers` → HTTP 401 `42501`; `sales` → HTTP 200 `[]` (RLS empty, not zero sales). Empty/401 is not an empty P0 list. Paste the CSV below after the SQL editor run.

| # | Customer | Phone | `party_signed` | `recomputed_7_both_eras` | `gap_recompute_minus_party` | `receipt_payments_both_eras` | `sum_paid_amount` | `legacy_paid_baseline_nonzero` |
|---|----------|-------|----------------|--------------------------|-----------------------------|------------------------------|-------------------|--------------------------------|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| … | *paste remaining 30 from Step 5-P0* | | | | | | | |

```
(paste Step 5-P0 CSV / 33 rows)
```

### The 35 genuinely unexplained (Step 5-unexplained)

**Do not fold these into any existing pattern by force-fit.** They are not a residual bucket for `party_trusts_paid_amount`. `force_fit_forbidden = true` on every row. If a later pass finds a real pattern, add a **new named class** — do not stretch 1e/2c to absorb them.

```
(paste Step 5-unexplained — expect 35 names)
```

### Last-known queue (22 Aug — stale; superseded by Step 5)

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
| — | Asma Shareef (INV/26-27/2288) | — | `legacy_paid_baseline` ∩ receipt | Named check this audit; last July window 59 sales / ₹3.32L |

R5 (11 paid-drift invoices) and Sharmin R3 are **done** as of 22 Aug; do not re-queue as if untouched. A name reappearing on Step 5 with `party_trusts_paid_amount` is a **different** class than the Aug 22 CN/return work.

---

## 6. Query-artifact checklist

Before treating any Step 1 flag as a real customer error:

1. Step 0 shows `CustomerReceipt` settlement amount. If that amount is material and the receipt filter omitted it, **stop** — the flags are the May cutover artifact.
2. Step 1 `vocab_query_artifact = true` → label the row **query artifact**, not P0.
3. Duplicate receipt hits come from `v_accounting_invariants`, not a homegrown 5-minute join. If the view count and a homemade detector disagree, **trust the view** and fix the homemade query.
4. `legacy_paid_baseline` overlap is labelled that, even when `paid_amount` also disagrees with `compute_sale_settlement`. Do not collapse it into generic paid drift.
5. CN double-count requires SRA **and** a CN voucher **and** remaining pool. Duplicate genuine RCP rows without a CN memo are **duplicate receipt**.
6. Do not `SUM(receipts + tender)` on a dual-write sale. Residual is `LEAST(net, GREATEST(receipts, tender)) − receipts`. Dual-write rows stay a FLAG until a later pass.
7. Gap equals `SUM(paid_amount)` → **Party trusts `paid_amount` over receipts**, not “off, cause unclear”, and not generic `paid_amount_drift`. Do not fold `paid_amount` into `recomputed_7`.
8. `legacy_paid_baseline` overlap still requires `baseline > 0 AND receipts > 0` on the same sale. A zero-receipt row whose gap equals `paid_amount` is the new named class, not the Asma Shareef overlap shape.
9. The **35** `off_cause_unclear` customers are a separate worklist. Do not stretch 1e/2c to absorb them.

---

## 7. How to finish the four deliverables

In the SQL editor, in order. **Step 6 first — it supersedes 1–5 headlines:**

0. **Step 6a** — Sana Nasir proof (`scripts/ella-noor-step6-memo-hole.sql`)  
0b. **Step 6b** — CN remaining vs SRA vs cn_memos (same file)  
0c. **Step 6d** — org headline (`scripts/ella-noor-step6-org.sql`)  
0d. **Step 6e** — remaining names after incl-advance (same file)  
1. Step 0 + 0b — vocabulary proof  
2. Step 1b — org headlines  
3. Step 1 — mismatch table with tender columns (page if 1000)  
4. Step 1c — tender close count (**done: 0 of 717**)  
5. Step 1d — dual-write FLAG list (**done: 0 sales**)  
6. Step 1e — `paid_amount` / `credit_applied` on the 251 (**done at count level: 234 / 17** — may be the memo hole)  
7. **Step 2-paid** — 234 names  
8. **Step 2-17** — leftover 17 + other named-pattern flags  
9. **Step 2-466** + **2-466-list** — 466 full / inflation / partial  
10. **Step 2c** — rupee split of ₹1,15,59,763  
11. Step 2 + 2b — invariant/CN/baseline list (does not include the 234)  
12. Step 3a–3e — invariant join + named baseline check  
13. Step 4a / 4b — top 25 Dr / Cr  
14. **Step 5** — 717-row queue (name, phone, pattern, proposed_write, P0/P1/P2) — memo-blind  
15. **Step 5b** — P0 count (**done: 33 / 33 party_trusts_paid_amount**) — memo-blind  
16. **Step 5-P0** — 33 names — memo-blind, superseded by 6e  
17. **Step 5-unexplained** — the 35 (do not force-fit)  

Paste the result sets into the slots above. Still no writes.

---

## Appendix A — SQL map

| Section | File | Delivers |
|---------|------|----------|
| 0 / 0b | `scripts/ella-noor-customer-balance-audit-2026-08.sql` | Vocabulary eras |
| 1 / 1b | same | Mismatch table + org headlines |
| 1c | same | Tender close count — **0 of 717** on ELLA NOOR |
| 1d | same | Dual-write FLAG list — **0 sales** |
| 1e | same | `paid_amount` / `credit_applied` headline on the 251 — **234** gap=paid |
| 2-paid | same | **234 names**, `primary_class = party_trusts_paid_amount` |
| 2-17 | same | Leftover **17** + other named-pattern flags |
| 2-466 / 2-466-list | same | 466 full / inflation / partial + names |
| 2c | same | Rupee split — **647 / ₹1,10,91,413** party-trusts; **682** classified; **35** unexplained |
| 2 / 2b | same | Invariant/CN/baseline list + digest counts (not the 234) |
| 3a–3d | same | `v_accounting_invariants` joins |
| 3e / 3e-sum | same | Named `legacy_paid_baseline` check |
| 4a / 4b | same | Top-25 line-by-line |
| 5 | same | 717-row P0/P1/P2 queue with `proposed_write` (SELECT only) |
| 5-P0 | `scripts/ella-noor-step5-p0-names.sql` (also section in the big file) | **33 P0 names** for Tausif (gap DESC + `legacy_paid_baseline` flag) |
| 5b | same | P0 count — **33**, all `party_trusts_paid_amount` |
| 5-unexplained | same | The **35** genuinely unexplained (force-fit forbidden) |
| **6a** | `scripts/ella-noor-step6-memo-hole.sql` | Sana Nasir proof — live page vs excl-memo vs incl-advance |
| **6b** | same | CN remaining vs SRA vs cn_memos (do not assume the advance hole) |
| **6d** (6c inside) | `scripts/ella-noor-step6-org.sql` | Org headline: how many of 717 close; zero-memo identity; corrected P0 count |
| **6e** | same | Remaining mismatches after incl-advance (corrected review list) |

## Appendix B — What was not done

- No `INSERT` / `UPDATE` / `DELETE`
- No `adjust_invoice_balance` / `createReceiptVoucher`
- No baseline zeroing
- No change to `_get_customer_party_balances_rows`
- No write to `paid_amount` / `legacy_paid_baseline`
- **No `paid_amount` architecture recommendation (A or B) — on hold until Step 6d**
- No folding `paid_amount` into the seven-component recompute
- No assumption that anon empty = zero drift
- No reuse of receivables-audit Section 3’s new-vocab-only receipt filter
- No summing of tender columns onto receipts (dual-write would double-count)
- No decision on which side of a dual-write sale is “the” payment
- No repair of party-trusts-paid_amount (may be a recompute artifact)
- No force-fit of the 35 unexplained into an existing named pattern
- No including `credit_note_adjustment` in receipts until 6b confirms (Farhaan Fab)
