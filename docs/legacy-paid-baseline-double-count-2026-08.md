# Phase 0 — `legacy_paid_baseline` double-count (2026-08)

**Status:** read-only investigation. No migration, repair, trigger change, or data fix was applied.  
**Example (do not repair):** org `3fdca631-1e0c-4417-9704-421f5129ff67` (ELLA NOOR), sale `641758aa-bc39-4611-8cb2-d6c6d37cf2c9` = INV/26-27/2288.

---

## Established facts (not re-derived)

| Field | Value |
|---|---|
| `net_amount` | 150000 |
| `paid_amount` | **100000** |
| `legacy_paid_baseline` | **50000** |
| Tender (`cash`/`card`/`upi`) | all **0** |
| `sale_return_adjust` | 0 |
| Receipts | exactly one: RCP/26-27/3301, cash, `reference_type='sale'`, 50000, created ~15 min after sale |
| Live `compute_sale_settlement(sale, org)` | `new_paid` = **100000** |
| Ledger / voucher-derived outstanding | ₹1,00,000 (correct) |
| Invoice UI outstanding from `paid_amount` | ₹50,000 (wrong — understates debt) |

July-scoped scale (already measured; see §B for all-time SQL):

| Measure | Value |
|---|---|
| Sales with `legacy_paid_baseline` > 0 (`created_at >= 2026-07-01`) | 5,126 / ₹3,97,94,327 |
| Of those with receipts (**at risk**) | **59** |
| Of those, baseline == receipts | **32** |
| Overstated `paid_amount` (July window) | **₹3,32,306** |

**Category distinction (must not be collapsed):**

1. **Legitimate baseline** — money paid with no reconstructable receipt (POS at-counter omission; pre-~29-May `reference_type` vocabulary filtered out of settlement). Zeroing these makes customers appear to owe money they paid.
2. **Bug** — baseline **and** a receipt covering the same money; baseline never reduced when the voucher appeared.

---

## Critical repo vs live contradiction

| Object | In this checkout’s `supabase/migrations` | Live (evidence) |
|---|---|---|
| `sales.legacy_paid_baseline` column | **Absent** (only in generated `types.ts` since commit `21039858`, 2026-07-29) | Present |
| `sync_sale_legacy_baseline()` / `trg_sales_legacy_baseline` | **Absent** | Must exist (column is maintained; 5k+ non-zero rows) |
| `compute_sale_settlement` including baseline in the sum | **Absent** — latest redefine `20261018140000_fix_cn_adjust_sale_payment_status.sql` has **no** baseline term | Returns `new_paid = 100000` = baseline + receipt on the example → **live body ≠ repo body** |
| `compute_sale_settlement_v2` | Absent from migrations | Present in `types.ts` |
| `v_accounting_invariants` | Absent from migrations | Present; anon-readable; three checks only (see §D12) |

**Implication:** Phase 1 must pull live function/trigger DDL from the SQL editor before editing. Shipping a “fix” from the repo-latest settlement function alone would **drop** baseline support and break category-1 sales.

### SQL to capture live DDL (read-only — run in SQL editor)

```sql
-- A1 / A3 — function bodies
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'sync_sale_legacy_baseline',
    'sync_sale_payment_status_from_receipts',
    'compute_sale_settlement',
    'compute_sale_settlement_v2'
  );

-- A1 — trigger definition
SELECT c.relname AS table_name,
       t.tgname,
       pg_get_triggerdef(t.oid, true) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_sales_legacy_baseline',
    'trg_sync_sale_payment_status_from_receipts'
  );
```

---

## A. Mechanism

### A1 — `sync_sale_legacy_baseline` / `trg_sales_legacy_baseline`

**Not present in this repository.** Live DDL must be captured with the SQL above.

**Inferred behaviour (from column purpose + write sequence below — not a substitute for the live body):**

- Runs on `sales` writes (INSERT and/or UPDATE).
- When `paid_amount` (or tender) exceeds what reconstructable receipts can explain, it stores the unexplained amount into `legacy_paid_baseline`.
- There is **no** evidence in the app or in repo migrations of any path that **reduces** `legacy_paid_baseline` when a later receipt covers that money (see A5).

### A2 — `sync_sale_payment_status_from_receipts` / trigger (repo-latest)

**Source:** `supabase/migrations/20260708120000_fix_sale_paid_sync_post_adjust_net_and_cn_dedupe.sql`  
(Later migrations redefine `compute_sale_settlement` only; this remains the latest sync function in-repo.)

**Trigger:**

```sql
CREATE TRIGGER trg_sync_sale_payment_status_from_receipts
AFTER INSERT OR UPDATE OR DELETE ON public.voucher_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_payment_status_from_receipts();
```

**Function behaviour (summary):**

1. Ignore non-`receipt` rows / null `reference_id`.
2. If `reference_type = 'sale'` **or** (`reference_type = 'customer'` and `reference_id` is a sale id): call `compute_sale_settlement(sale_id, org)` and `UPDATE sales SET paid_amount, payment_status`.
3. If `reference_type = 'customer'` and `reference_id` is a **customer** id: find that customer’s sales whose `sale_number` appears in the voucher description; recompute each.

Full body is in that migration (lines ~91–175). **Live may have diverged** if Lovable patched it after baseline landed — capture with `pg_get_functiondef`.

### A3 — `compute_sale_settlement` and where baseline enters

#### Repo-latest (`20261018140000_…`) — **no baseline**

```
tender = cash_amount + card_amount + upi_amount
receipts = Σ cash-like sale/customer receipts + max(0, CN vouchers − sra)
new_paid = LEAST(net, GREATEST(receipts, tender))   -- if tender > receipts
         | LEAST(net, receipts)                      -- else
status from derive_sale_payment_status(net, new_paid + sra, …)
```

Capped at `net_amount` (`v_payable_cap`). **No `legacy_paid_baseline`.**

#### Live (inferred from example — confirm with `pg_get_functiondef`)

Given tender = 0, one ₹50k receipt, baseline = 50k, and `new_paid` = 100000:

```
new_paid ≈ LEAST(net, legacy_paid_baseline + receipt_total [+ tender rules…])
```

So live settlement **adds** baseline into the sum (then caps at net). That is exactly how the double-count materialises once a receipt exists for the same rupees.

### A4 — Write sequence for INV/26-27/2288

**Sale created:** 1 Aug 2026 01:59 PM IST  
**Receipt RCP/26-27/3301:** 08:44:32 UTC ≈ 02:14 PM IST (~15 minutes later)  
**Tender columns today:** all 0.

#### Evidence from application code (Collect Payment)

`SalesInvoiceDashboard.handleRecordPayment` (cash / UPI / card / etc., non-CN) does **two separate writes**:

1. **First** — `UPDATE sales` bumping `paid_amount` by the payment amount **before** any voucher exists  
   (`src/pages/SalesInvoiceDashboard.tsx` ~2702–2731).
2. **Then** — `createReceiptVoucher(...)` inserting `voucher_entries`  
   (~2770–2781).
3. DB trigger `trg_sync_sale_payment_status_from_receipts` fires → `compute_sale_settlement` → writes `paid_amount` again.
4. **Client “final sync”** then sets  
   `reconciledPaid = min(payableCap, max(refreshedSale.paid_amount, receiptTotal))`  
   (~2911–2929) — which **preserves** an already-inflated `paid_amount`.

Sales Invoice **create** path does **not** insert a receipt in the same save (`SalesInvoice.tsx` insert ~3132+); receipts come from Collect Payment / Payments flows later.

#### Statement-by-statement reconstruction (best supported story)

| Step | When | What | Baseline / paid effect |
|---|---|---|---|
| S0 | 01:59 | `INSERT sales` — likely `pay_later`, `paid_amount=0`, tender 0 (or equivalent unpaid credit save) | baseline 0 |
| S1 | 02:14 | Client `UPDATE sales SET paid_amount = 0 + 50000` **with no receipt yet** | `trg_sales_legacy_baseline` (inferred) sees paid with no reconstructable voucher → **`legacy_paid_baseline = 50000`** (correct *at that instant*) |
| S2 | 02:14 | Client `INSERT voucher_entries` receipt ₹50000, `reference_type='sale'` | — |
| S3 | 02:14 | `trg_sync_sale_payment_status_from_receipts` → live `compute_sale_settlement` → **baseline 50k + receipt 50k = 100k** → `paid_amount = 100000` | baseline **not** reduced |
| S4 | 02:14 | Client final sync `max(paid_amount, receiptTotal)` → keeps 100000 | no repair |

**What the evidence supports:** baseline was written when `paid_amount` was raised **without** a voucher, then the voucher arrived seconds later and settlement **added** both. That matches Collect Payment’s write order and the 15-minute gap between sale create and receipt.

**What remains ambiguous without live DDL + row history:**

- Whether S0 already had `paid_amount > 0` from an at-save payment shortcut (unlikely given tender = 0 and 15-minute receipt lag, but not disproven without `sales` audit / WAL).
- Exact BEFORE vs AFTER / WHEN clause of `trg_sales_legacy_baseline`.
- Whether any intermediate client refresh rewrote tender columns to 0 after the fact.

**Do not treat “sale created already double-counted” as fact** — the Collect Payment ordering alone is sufficient to create the bug on a clean unpaid invoice.

### A5 — Is there a path that reduces baseline when a receipt covers the same money?

**In this checkout: no.**

- No app code reads or writes `legacy_paid_baseline`.
- No migration reduces it.
- Receipt sync only overwrites `paid_amount` / `payment_status` via `compute_sale_settlement`.
- If live `compute_sale_settlement` **adds** baseline + receipts, then receipt sync **inflates** paid and leaves baseline untouched.

**That non-reduction is the defect.** Category-1 rows stay correct only while they have **no** overlapping reconstructable receipt.

---

## B. Scale (SQL — run in SQL editor)

> **Not executed in the agent environment.** Anon key can read `v_accounting_invariants` but **cannot** read `sales` / `voucher_entries` (RLS). No service-role / SQL-editor credential is available here.  
> July figures in the prompt remain the only executed measurements. Paste the following for all-time / breakdowns.

### B0 — Safety: row count before unscoped scans

```sql
SELECT COUNT(*) AS sales_rows FROM public.sales;  -- note: full table; no org filter by design for planning only
SELECT COUNT(*) AS sales_rows_active
FROM public.sales
WHERE deleted_at IS NULL
  AND COALESCE(is_cancelled, false) = false;
```

Prefer the org-scoped / CTE forms below for real work.

### B6 — All-time at-risk (no date filter)

```sql
WITH receipt_totals AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    ROUND(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))::numeric, 2) AS receipt_total
  FROM public.voucher_entries ve
  WHERE ve.voucher_type = 'receipt'
    AND ve.deleted_at IS NULL
    AND ve.reference_type IN ('sale', 'SALE', 'customer', 'customer_payment', 'CustomerReceipt')
    AND LOWER(COALESCE(ve.payment_method, '')) NOT IN ('credit_note_adjustment', 'advance_adjustment')
  GROUP BY ve.organization_id, ve.reference_id
),
at_risk AS (
  SELECT
    s.organization_id,
    s.id AS sale_id,
    s.sale_number,
    s.created_at,
    s.net_amount,
    s.paid_amount,
    s.legacy_paid_baseline AS baseline,
    rt.receipt_total,
    ROUND(LEAST(
      COALESCE(s.legacy_paid_baseline, 0),
      COALESCE(rt.receipt_total, 0)
    )::numeric, 2) AS overlap_overstatement,
    ROUND((COALESCE(s.legacy_paid_baseline, 0) + COALESCE(rt.receipt_total, 0))::numeric, 2) AS baseline_plus_receipts
  FROM public.sales s
  JOIN receipt_totals rt
    ON rt.sale_id = s.id
   AND rt.organization_id = s.organization_id
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.legacy_paid_baseline, 0) > 0.009
    AND COALESCE(rt.receipt_total, 0) > 0.009
)
SELECT
  COUNT(*) AS at_risk_count,
  COUNT(*) FILTER (WHERE ABS(baseline - receipt_total) <= 0.009) AS baseline_eq_receipts,
  COUNT(*) FILTER (WHERE ABS(baseline - receipt_total) > 0.009) AS baseline_ne_receipts,
  ROUND(SUM(overlap_overstatement), 2) AS overstated_paid_amount_est,
  MIN(created_at) AS earliest_at_risk_created_at,
  MAX(created_at) AS latest_at_risk_created_at
FROM at_risk;
```

`overlap_overstatement = LEAST(baseline, receipts)` is the paisa-level double-count under the “same money counted twice” model (matches the July ₹3.32L methodology for the equality set; for unequal rows it is a **lower bound** on overlap, not a full economic audit).

### B7 — Breakdown by org and INV vs POS

```sql
-- reuse at_risk CTE from B6
SELECT
  a.organization_id,
  o.name AS org_name,
  CASE
    WHEN a.sale_number ILIKE 'POS/%' THEN 'POS'
    WHEN a.sale_number ILIKE 'INV/%' THEN 'INV'
    ELSE 'OTHER'
  END AS sale_prefix,
  COUNT(*) AS n,
  ROUND(SUM(a.overlap_overstatement), 2) AS overstated_est
FROM at_risk a
LEFT JOIN public.organizations o ON o.id = a.organization_id
GROUP BY 1, 2, 3
ORDER BY overstated_est DESC, n DESC;
```

(For the July-only slice, add `AND s.created_at >= '2026-07-01'::timestamptz` inside `at_risk`.)

### B8 — The 27 (baseline ≠ receipts): shape of the difference

```sql
-- reuse at_risk
SELECT
  CASE
    WHEN baseline > receipt_total + 0.009 THEN 'baseline_gt_receipts'
    WHEN receipt_total > baseline + 0.009 THEN 'receipts_gt_baseline'
    ELSE 'equal'
  END AS bucket,
  COUNT(*) AS n,
  ROUND(AVG(baseline - receipt_total), 2) AS avg_baseline_minus_receipts,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY baseline - receipt_total), 2) AS median_diff,
  ROUND(MIN(baseline - receipt_total), 2) AS min_diff,
  ROUND(MAX(baseline - receipt_total), 2) AS max_diff
FROM at_risk
GROUP BY 1
ORDER BY 1;

-- detail for unequal (naive zero-baseline would corrupt these)
SELECT organization_id, sale_id, sale_number, created_at,
       baseline, receipt_total, paid_amount, net_amount,
       ROUND(baseline - receipt_total, 2) AS baseline_minus_receipts
FROM at_risk
WHERE ABS(baseline - receipt_total) > 0.009
ORDER BY ABS(baseline - receipt_total) DESC
LIMIT 100;
```

**Interpretation guide (for the repair design, not executed here):**

- `baseline_gt_receipts` — often category-1 remainder + partial voucher (naive `baseline := 0` understates paid).
- `receipts_gt_baseline` — baseline floor plus later cash; or settlement/tender quirks; inspect before bulk-zero.
- Equality set — strongest candidates for “same ₹ counted twice.”

### B9 — Capped / hidden double-counts

```sql
-- reuse at_risk
SELECT
  COUNT(*) FILTER (
    WHERE baseline_plus_receipts > net_amount + 0.009
  ) AS at_risk_uncapped_sum_exceeds_net,
  COUNT(*) FILTER (
    WHERE baseline_plus_receipts > net_amount + 0.009
      AND ABS(COALESCE(paid_amount, 0) - net_amount) <= 0.5
  ) AS looks_fully_paid_but_sum_exceeds_net,
  ROUND(SUM(
    GREATEST(0, baseline_plus_receipts - net_amount)
  ) FILTER (WHERE baseline_plus_receipts > net_amount + 0.009), 2) AS hidden_overcount_above_cap
FROM at_risk;
```

These are invisible to “`paid_amount` looks merely completed” eyeballing because the net cap clips the stored paid figure.

---

## C. Blast radius

### C10 — Screens / reports that trust `sales.paid_amount` (or balances derived from it)

| Surface | How it uses `paid_amount` |
|---|---|
| **Sales Invoice Dashboard** table / Page Total | Client `reconcileSaleInvoiceWithSplit` → peels voucher buckets from `paid_amount`, then adds voucher cash; still poisoned when paid was double-counted then peeled unevenly vs SQL KPI (see D13) |
| **Sales Invoice Dashboard** Pending KPI | RPC `get_invoice_dashboard_stats` → `invoice_reconcile_outstanding` with `paid_residual = paid − (cash+adv+cn)` |
| Invoice History / payment modal | Reads `paid_amount` for “already paid” / remaining |
| **Payments Dashboard** / Collect & Pay lists | `net − paid_amount` style due |
| **POS Dashboard** summary | `pendingAmount` from sale rows / stats helpers using paid |
| WhatsApp invoice templates | `{pending_amount}` from `net − paid` |
| Excel export on Sales dashboard | exports `paid_amount` and computed balance from it |
| Background `syncVisibleInvoiceStaleFields` / `applyRecomputedSalePaymentState` | Writes **from** `compute_sale_settlement` — will **re-inflate** if live settlement still adds baseline |

**Generally voucher-first (trustworthy for this bug class):**

| Surface | Notes |
|---|---|
| Customer ledger PDF / running ledger credits | Uses voucher rows + at-sale **tender columns**, not `paid_amount − vouchers` (see `CustomerLedger` comments) |
| `get_customer_true_outstanding` / `reconcile_customer_balance` | Receipt-centric; `paid_at_sale_drift` uses tender − receipts, not raw `SUM(paid_amount)` |
| Day book / journal views | Driven by `journal_entries` / vouchers when accounting engine on |

GST returns are tax/invoice-face oriented; they are not the primary consumer of `paid_amount` for AR, but any “collection” report that subtracts `paid_amount` from net is in the blast radius.

### C11 — Ledger / `get_customer_account_state`

- **No DB RPC** named `get_customer_account_state` in this checkout.
- Client helper `getCustomerAccountState` (`customerBalanceCore.ts`) wraps balance math that may use `paid_amount` only inside **drift** peels (`computePaidAmountDrift`), not as the sole lifetime paid total.
- Headline outstanding should come from `get_customer_true_outstanding` / snapshot RPCs (voucher-derived).
- **Therefore:** the ledger outstanding on the example (₹1,00,000) is the right verification oracle. Repair must make invoice `paid_amount` agree with voucher+legitimate-baseline reality **without** changing voucher rows.

---

## D. Related

### D12 — `v_accounting_invariants`

Live view columns: `check_name`, `organization_id`, `entity_id`, `entity_ref`, `detail`.

**Checks observed (anon select, 2026-08-01):**

1. `duplicate_voucher_number`
2. `rapid_duplicate_receipt`
3. `receipts_exceed_invoice`

**Would any catch this class?** **No.**

- Receipts do **not** exceed the invoice (₹50k ≤ ₹150k).
- The bug is `paid_amount` / baseline inflation, not voucher duplication.

#### Proposed invariant SQL (document only — do not deploy from this phase)

```sql
-- baseline_receipt_overlap: cash-like receipts exist AND legacy_paid_baseline > 0
-- detail = LEAST(baseline, receipt_total)  (estimated double-counted rupees)
SELECT
  'baseline_receipt_overlap'::text AS check_name,
  s.organization_id,
  s.id AS entity_id,
  s.sale_number AS entity_ref,
  ROUND(LEAST(s.legacy_paid_baseline, r.receipt_total)::numeric, 2) AS detail
FROM public.sales s
JOIN LATERAL (
  SELECT COALESCE(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 0) AS receipt_total
  FROM public.voucher_entries ve
  WHERE ve.organization_id = s.organization_id
    AND ve.reference_id = s.id
    AND ve.voucher_type = 'receipt'
    AND ve.deleted_at IS NULL
    AND ve.reference_type IN ('sale', 'SALE', 'customer', 'customer_payment', 'CustomerReceipt')
    AND LOWER(COALESCE(ve.payment_method, '')) NOT IN ('credit_note_adjustment', 'advance_adjustment')
) r ON TRUE
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.legacy_paid_baseline, 0) > 0.009
  AND r.receipt_total > 0.009;
```

### D13 — Pending Amount ₹0 vs Page Total balance ₹50,000 (report only)

**Two different formulas on the same poisoned `paid_amount=100000` + receipt cash=50000:**

#### KPI — `get_invoice_dashboard_stats` → `invoice_reconcile_outstanding` (migration `20260717052829_…`)

Call site passes:

```text
p_paid_residual = GREATEST(0, paid_amount − (cash+adv+cn))  = 50000
p_cash          = 50000
```

Helper **reconstructs** then **adds cash again**:

```text
v_sale_paid     = residual + cash + adv + cn     = 100000
v_effective_cash = (v_sale_paid − adv_cn) + cash = 100000 + 50000 = 150000
outstanding      = 150000 − 150000               = 0
```

→ **Pending Amount ₹0** for this invoice in the KPI sum.

#### Table / Page Total — client `reconcileSaleInvoiceWithSplit` → `reconcileSaleInvoiceDisplay`

```text
paidForReconcile = max(tender, paid_amount − voucherBuckets) = 50000
effectiveCash    = paidForReconcile + cash                   = 100000
outstanding      = 150000 − 100000                           = 50000
```

→ **Page Total balance ₹50,000**.

So the dashboard disagreement is **not** proof of a third money bug; it is SQL helper double-adding cash on top of an already double-counted `paid_amount`. Fixing baseline settlement will change both numbers; the helper/client parity bug in `invoice_reconcile_outstanding` is **separate** and should not be conflated with Phase 1 baseline repair.

---

## Proposed fix (described only — not applied)

### Goals

1. Stop **new** category-2 inflation.
2. Repair existing category-2 without touching category-1.
3. Never leave Collect Payment as a writer that races baseline capture.

### Prevention (mechanism)

1. **Capture live DDL** for `sync_sale_legacy_baseline`, live `compute_sale_settlement`, and sync trigger; put them in a new timestamped migration (Lovable-owned path).
2. **Baseline reduction on receipt coverage** (preferred core fix):  
   When reconstructable cash-like receipts for a sale increase, set  
   `legacy_paid_baseline := GREATEST(0, legacy_paid_baseline − newly_covered)`  
   or, equivalently, redefine baseline as  
   `max(0, unexplained_paid)` where  
   `unexplained_paid = max(0, paid_or_tender_signal − receipt_total)`  
   so baseline is a **residual**, not a permanent addend.
3. **Settlement formula** must become (conceptually):  
   `new_paid = LEAST(net, receipt_total + remaining_baseline + tender_rules)`  
   where `remaining_baseline` is already residual.  
   **Do not** ship `GREATEST(baseline, receipts)` as a universal rule until B8 unequal rows are classified — that would under-pay true “baseline + later voucher” cases.
4. **Client Collect Payment:** stop bumping `paid_amount` before voucher insert; let `trg_sync_sale_payment_status_from_receipts` be the writer (or bump only after voucher). Also replace `max(paid, receiptTotal)` final sync with `compute_sale_settlement` / `applyRecomputedSalePaymentState`.
5. **Do not** zero all `legacy_paid_baseline > 0`. That destroys category-1.

### Repair (data) — category-2 only

**Equality set (baseline ≈ receipts) — safest bulk:**

```sql
-- ILLUSTRATIVE ONLY — do not run in Phase 0
-- Preview:
SELECT s.organization_id, s.id, s.sale_number, s.legacy_paid_baseline, r.receipt_total, s.paid_amount
FROM … equality predicate …;

-- Repair shape:
-- UPDATE sales SET legacy_paid_baseline = 0 WHERE … equality …;
-- then recompute paid_amount/payment_status via compute_sale_settlement per row.
```

**Unequal set:** case-by-case — reduce baseline by `LEAST(baseline, receipt_total)` only when product/ops confirm overlap; leave pure residual baselines alone.

### Verification query (does **not** trust `paid_amount`)

```sql
-- After repair + recompute: no sale should have baseline>0 AND cash-like receipts
-- with LEAST(baseline, receipts) > 0.009, AND paid should match settlement without double-add.
WITH receipt_totals AS ( … same as B6 … ),
check_rows AS (
  SELECT
    s.organization_id,
    s.id,
    s.sale_number,
    s.legacy_paid_baseline,
    rt.receipt_total,
    s.paid_amount,
    c.new_paid AS settlement_paid,
    -- voucher-only cash-like paid (oracle)
    rt.receipt_total AS voucher_paid
  FROM public.sales s
  LEFT JOIN receipt_totals rt
    ON rt.sale_id = s.id AND rt.organization_id = s.organization_id
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'  -- widen per org after pilot
    AND s.deleted_at IS NULL
    AND s.id = '641758aa-bc39-4611-8cb2-d6c6d37cf2c9'
)
SELECT *,
  ROUND(GREATEST(0, COALESCE(net_amount,0) - COALESCE(settlement_paid,0) - COALESCE(sale_return_adjust,0)), 2) AS invoice_outstanding_from_settlement
FROM check_rows
JOIN public.sales s USING (id);
```

**Pass criteria for the example:**

- `legacy_paid_baseline = 0` **or** residual that does not overlap the ₹50k receipt  
- `settlement_paid = 50000`  
- invoice outstanding = 100000  
- customer ledger outstanding still 100000 (unchanged vouchers)  
- re-running Collect Payment / inserting a test receipt on a staging copy must not re-inflate

Org-wide pass: B6 `at_risk_count = 0` for the equality definition you choose; unequal residuals documented.

---

## Anything that contradicts the opening summary

1. **Repo `compute_sale_settlement` does not match the live behaviour that produces `new_paid = 100000`.** The summary’s arithmetic is right for **live**; this checkout’s migrations are stale relative to baseline.
2. **The 15-minute gap is explained by Collect Payment’s pre-voucher `paid_amount` UPDATE**, not necessarily by “paid at sale save with no voucher.” Tender columns = 0 fits Collect Payment (it does not set `cash_amount` on that path).
3. **Dashboard Pending ₹0 vs table ₹50k is a second bug** (`invoice_reconcile_outstanding` reconstructing paid then adding cash again). It amplifies the double-count in the KPI; it is not an independent AR miss.
4. **`v_accounting_invariants` would not have caught this** — confirmed live (only three check names).
5. **July ₹3.32L / 59 / 32 figures were not re-run here** — no privileged SQL path in this environment. Treat them as given until B6–B9 are pasted into the SQL editor.

---

## Recommended next steps (still not Phase 0 execution)

1. Run the DDL capture queries (§A) and attach live function bodies to the Phase 1 PR.  
2. Run B6–B9; fill the measurement tables.  
3. Pilot repair on ELLA NOOR equality rows only (not INV/2288 alone without mechanism fix — it will re-inflate).  
4. Ship prevention (baseline residual + Collect Payment write-order) before bulk repair of all orgs.  
5. Separately schedule the `invoice_reconcile_outstanding` double-add fix (D13).
