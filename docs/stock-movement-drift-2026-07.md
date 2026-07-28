# Stock quantity vs movement ledger drift — Phase 0

**Date:** 2026-07-28  
**Scope:** Read-only investigation. No repairs, no `UPDATE`/`INSERT`/DDL, no migrations, no edits under `src/`.  
**Trigger case:** Org `dafc3d0c-874e-4784-bac3-5eab5f3c85b5` (VELVET), variant `697293ad-dfce-4a04-a685-ca52a4a85105`, barcode `150001717`.  
**Live DB access in this checkout:** anon/publishable key only — no service role / DB URL. Cross-org ranking SQL is provided in the appendix for a privileged session; live aggregates below cite prior VELVET drill-downs and the caller’s cross-org scan numbers, with sentinels excluded by rule.

**Link to stock settlement write-off:** The new “Write Off Unscanned” feature sets `stock_qty = 0` for variants never scanned in a physical count. If `stock_qty` is already overstated (phantom units from unreversed purchases), a shop counting real shelves will write those phantoms off as shrinkage — recording loss that never happened. **Do not run write-off on orgs with unresolved genuine drift until the delete path is fixed and phantom stock is repaired deliberately.**

---

## Executive answer (five lines)

1. **Class:** Failure of an *existing* reversal mechanism, not a missing feature — org-wide `purchase_delete` / `soft_delete_purchase` counts prove reverses normally work.  
2. **Leading path:** Recycle Bin **hard delete** of `purchase_bills` never writes reversals (by design after soft-delete); it is safe only if `soft_delete_purchase_bill` already reversed. For B0326034, **no** `soft_delete_purchase` / `purchase_delete` exists while the `purchase` +1 remains → stock was never reversed before the bill disappeared.  
3. **Not** “live hard-delete without trigger” as the sole story: hard-deleting *live* (`deleted_at IS NULL`) purchase lines **does** write `purchase_delete` via trigger; that would leave reverse evidence we do not see.  
4. **Not** a mid-RPC partial soft-delete: soft-delete / cancel RPCs are single plpgsql transactions.  
5. **Genuine wrong qty today:** at least the VELVET trigger variant (+1 unit); caller’s scan suggests ~hundreds–thousands of genuine-drift variants across low-avg orgs once 999 999 service sentinels are excluded — exact clean totals need the appendix SQL under a privileged role.

---

## 0A. Where reversal movements are written

`product_variants.stock_qty` is **not** maintained by a generic trigger on `stock_movements` insert. Writers pair an explicit `UPDATE product_variants.stock_qty` with an audit `INSERT` into `stock_movements`. The only `AFTER INSERT ON stock_movements` triggers sync legacy `current_stock` / audit — they do not derive `stock_qty`.

### Delete / soft-delete / restore path table

| Delete path | Source (latest) | Writes reverse `stock_movements`? | Adjusts `stock_qty`? | Transactional? |
|-------------|-----------------|-----------------------------------|----------------------|----------------|
| Soft-delete purchase bill | RPC `soft_delete_purchase_bill` — `20260911140000_…sql`; client `useSoftDelete.tsx:80` | Yes — `soft_delete_purchase`, qty `−line.qty`, `reference_id = bill_id` | Yes — set-based `stock_qty − agg.qty` (+ `batch_stock`) | Yes — one function body |
| Restore purchase bill | RPC `restore_purchase_bill` — same migration | Yes — `restore_purchase` | Yes — `+=` | Yes |
| Cancel purchase bill | RPC `cancel_purchase_bill` — `20260430154000_…sql` | Yes — `purchase_delete` (notes say cancelled) | Yes — per line `−` | Yes; bill **kept** (`is_cancelled`) |
| Hard-delete purchase **line** (live) | Trigger `handle_purchase_item_delete` — `20260928140000_…sql` on `AFTER DELETE purchase_items` | Yes — `purchase_delete` **iff** `OLD.deleted_at IS NULL` | Yes — `− OLD.qty` | Per-statement; aborts if bill/org missing |
| Hard-delete purchase bill (Recycle Bin) | `useSoftDelete.tsx:506–509` raw `.delete()` on `purchase_items`, `batch_stock`, then header | **No** (trigger **skips** when `deleted_at` already set) | **No** | **No** — multiple client round-trips |
| Soft-delete sale | RPC `soft_delete_sale` — `20260720180000_…sql`; client `:94` | Yes — `soft_delete_sale` | Yes — `+=` (skips `service`) | Yes; idempotent if already deleted |
| Restore sale | RPC `restore_sale` | Yes — `restore_sale` | Yes — `−=` | Yes |
| Hard-delete sale **line** (live) | Trigger `handle_sale_item_delete` | Yes — `sale_delete` if live | Yes — `+=` | Skipped if soft-deleted |
| Hard-delete sale header | Recycle Bin / also `SalesInvoiceDashboard` → `hardDelete('sales')` | Relies on line trigger (skip if soft-deleted) | Same | Non-transactional client deletes |
| Soft-delete sale return | RPC `soft_delete_sale_return` | Yes — `soft_delete_sale_return` | Yes — `−=` (undo return-in) | Yes |
| Soft-delete purchase return | RPC `soft_delete_purchase_return` | Yes — `soft_delete_purchase_return` | Yes — `+=` | Yes |
| Live hard-delete return lines | Triggers on `sale_return_items` / `purchase_return_items` | Yes — `*_return_delete` if live | Yes | Skipped if soft-deleted |
| Delivery challan soft/hard delete | `20261002100000_delivery_challan_no_stock_deduction.sql` | **No** (no-ops) | **No** | Soft-delete is flag-only; stock policy deliberately off |

### Hard-delete design (important)

`IF OLD.deleted_at IS NOT NULL THEN RETURN OLD;` was added so Recycle Bin permanent delete does **not** double-reverse after soft-delete (`20251224143446…`). That means:

- Soft-delete path = **only** stock reverse for recycle-bin purge.  
- Hard-delete path = **structural** purge only.  
- If a bill reaches hard-delete **without** a successful soft-delete stock reverse, phantom stock is retained and the `purchase` movement stays.

App soft-delete for purchase bills **always** goes through the RPC (`useSoftDelete.tsx:79–84`). Default `UPDATE deleted_at` branch is **not** used for `purchase_bills`.

---

## 0B. Why it failed for B0326034

### Facts already verified (prior privileged drill-down + caller statement)

| Fact | Evidence |
|------|----------|
| `stock_qty` = 2 | Variant row |
| Active purchase sum = 1 | Only bill **B0326033** (`2c5b21df-…`) still in `purchase_bills` / `purchase_items` |
| Movements | Exactly two `purchase` +1: B0326033 (legit) and **B0326034** (`bd142466-…`, 2026-03-18 15:46:54) |
| Bill B0326034 | **Absent** from `purchase_bills` (not soft-deleted — gone) |
| Reversals for this variant | **None** — no `purchase_delete`, `soft_delete_purchase`, etc. |
| Parity | stored 2 − recomputed 1 = **+1 overstated** |

### Candidates

| Candidate | Verdict |
|-----------|---------|
| Soft-delete RPC mid-loop partial reverse | **Refuted** for current code — set-based / one txn; failure rolls back header too |
| Live hard-delete of purchase lines without reverse | **Refuted as sole cause** — live delete trigger writes `purchase_delete`; we would see it |
| Trigger never fired on live delete | Unlikely for a clean client delete (would raise if bill already gone mid-cascade); no evidence of disable |
| Hard-delete after soft-delete with successful reverse | **Refuted for this variant** — would leave `soft_delete_purchase` (or cancel’s `purchase_delete`) and stock would already be −1 |
| **Bill removed while stock reverse never ran** (hard-delete / purge after `deleted_at` set without RPC reverse, or out-of-band delete) | **Consistent with evidence** |
| Partial failure across *other* variants of same bill | **Open until appendix SQL** — see below |

### Partial vs whole-bill

**Available evidence points to whole-bill disappearance**, not “soft-delete reversed some SKUs and not this one”:

- Header `bd142466-…` is entirely absent (prior CSV of purchase lines listed only B0326033).  
- Soft-delete / cancel are all-or-nothing transactions.  
- This variant has zero reverse rows for that bill.

**Still required (privileged, do not repair):** list *all* movements for `reference_id = 'bd142466-…'` or `bill_number = 'B0326034'`.  

- If every row is `purchase` with no `soft_delete_purchase` / `purchase_delete` for any variant → **whole-bill no-reverse** (path failure).  
- If other variants have reverse rows and this one does not → **partial / data corruption** (different severity).

Until that query runs, classify as: **whole-bill removal without stock reverse for the observed variant; partial-failure not supported by current evidence.**

### Hypothesis check (caller’s leading theory)

> Soft delete reverses server-side; hard delete does not.

**Confirmed**, with a critical refinement:

| Statement | Result |
|-----------|--------|
| Soft-delete RPC reverses movements + `stock_qty` | **True** (current definition) |
| Hard-delete client path does not reverse | **True** — and triggers skip soft-deleted lines |
| Therefore hard delete alone explains B0326034 | **Incomplete** — hard delete *expects* a prior reverse. Observed pattern = **purge without prior reverse evidence** |
| Hard delete of *live* lines would leave this fingerprint | **False** — would insert `purchase_delete` |

---

## 0C. Sentinels vs genuine drift

### Sentinel pattern (confirmed in product code)

Service / non-inventory variants are stamped with virtual stock **`999999`** for unlimited POS billing (`src/utils/productStockDisplay.ts` — `SERVICE_VIRTUAL_STOCK_QTY = 999999`). Dashboards already treat these as non-physical.

**Exclude from drift ranking when any of:**

- `products.product_type IN ('service','combo')`, or  
- `product_variants.stock_qty >= 999999` (and typically no meaningful movement history)

Caller example `ee0ea1e5`: 380 variants, ~379 999 651 total ≈ **~1 000 000 per variant** → sentinel cluster, **not drift**.

### Clean ranking method

Drift definition (canonical, matches `detect_stock_discrepancies` / `_get_stock_reconciliation_rows`):

```text
recomputed = opening_qty + purchases − sales − purchase_returns + sale_returns − pending_dc
drift      = stock_qty − recomputed
```

Purchases/sales/… come from **line-item tables** joined to non-deleted headers — **not** from `SUM(stock_movements)`.

**This checkout could not re-run the 33-org scan** (no service role). Using the caller’s plausible genuine-drift orgs (low per-variant average) as the starting set:

| Org (prefix) | Reported variants w/ drift | ~avg |units|/variant | Classification |
|--------------|----------------------------|------------------------------|----------------|
| `ee0ea1e5` (and similar ~1e6 avgs) | large | ~1 000 000 | **Sentinel — exclude** |
| `dafc3d0c` (VELVET) | 139 | ~2.9 | **Likely genuine** |
| `e8fbf0d8` | 275 | ~7.2 | **Likely genuine** |
| `a12ca696` | 243 | (low) | **Likely genuine** |
| `ceb7f3dd` | 158 | (low) | **Likely genuine** |
| `5e769632` | 1 855 | check mix | **Re-scan with sentinel filter** — may be mixed |

**Separate buckets (after appendix SQL):**

| Bucket | What to report |
|--------|----------------|
| Sentinel | variant count, org count, do **not** sum “value” |
| Genuine | variant count, org count, `SUM(drift)` net units, `SUM(drift * pur_price)` overstated vs understated separately |

---

## 0D. Direction and cause mix

**Do not merge overstated and understated.**

| Direction | Meaning | Business effect |
|-----------|---------|-----------------|
| **Overstated** (`drift > 0`) | `stock_qty` > transaction recompute | Phantom on-hand; write-off / settlement may “shrink” false stock; valuation high |
| **Understated** (`drift < 0`) | `stock_qty` < recompute | Hidden stock; sales may oversell; valuation low |

### Cause correlation (for genuine rows) — diagnostic joins

| Signal | Typical direction | Notes |
|--------|-------------------|-------|
| `stock_movements.reference_id` points to missing `purchase_bills` / `sales` and **no** matching `*_delete` / `soft_delete_*` | Overstated (purchase) or understated (sale) | **B0326034 class** |
| Movements with `reference_id IS NULL` | Either | Opening / manual / incomplete writers |
| Delete/cancel with matching reverse present | Should be ~0 drift if `stock_qty` followed | If drift remains, second bug |
| `reconciliation` / `stock_reset` already applied | Masks prior drift | `quantity` often 0 on recon rows — audit only |

VELVET trigger case: **overstated +1**, orphan `purchase` movement, missing bill, no reverse.

Appendix SQL splits counts for missing-header orphans vs NULL refs vs delete-without-reverse vs prior recon.

---

## 0E. Existing tooling

| Tool | What it does | Scheduled? | Fixes this class? | Distinguishes bad movement vs bad qty? |
|------|--------------|------------|-------------------|----------------------------------------|
| `detect_stock_discrepancies` | Returns variants where `stock_qty ≠` **transaction-history** recompute (excludes service/combo in current def) | **Manual** (Settings → Stock Reconciliation UI). Not the same as low-stock cron (`scan_stock_alerts_all_orgs`) | **Detects** B0326034-class (qty 2 vs purchases 1) | Treats **line-item tables as truth**; does not validate movements |
| `fix_stock_discrepancies` | Sets `stock_qty` to recalculated; inserts `reconciliation` movement with **quantity 0** | Manual only | **Would fix qty** for this class; **leaves orphan `purchase` movement** | Same — trusts transactions; does not delete bad movements |
| `reset_stock_from_transactions` | Same formula; writes `stock_reset` notes | Manual only | **Would fix qty** the same way | **Does not sum movements.** Prompt worry (“will confirm 2 from movements”) is **incorrect for current SQL** — it ignores the orphan +1 and would set qty → 1 |
| `reconcile_variant_stock_qty` | Single-variant repair using same formula | Manual / RPC | Same as above for one id | Same |
| `check_purchase_stock_dependencies` | Before delete: finds sales that would make reverse go negative | Soft-delete UI guard | Prevention only | N/A |
| `get_stock_reconciliation` / `StockReconciliation.tsx` | Read UI over detect + optional fix/reset | Manual | Same as detect/fix | Same |
| `pg_class.reltuples` on `stock_movements` | Size estimate only | — | — | Use for planning, not drift |

**Important:** Running `fix_*` / `reset_*` **before** fixing the delete path will:

1. Correct `stock_qty` toward transaction truth (good for on-hand).  
2. **Destroy the mismatch evidence** that proves orphan movements (bad for forensics).  
3. Leave the movement ledger still claiming a purchase that has no bill.

**Do not run those RPCs on VELVET (or others) until Phase 1 decides repair strategy.**

---

## Root cause (clear statement)

**Root cause class:** Purchase stock was credited (`purchase` movement + `stock_qty++`). The purchase bill was later **removed from `purchase_bills` without a matching reverse movement or `stock_qty` decrement** for the affected variant(s).

**Mechanism in product code that enables this:**

1. Soft-delete RPC is the stock reverse.  
2. Recycle Bin hard delete deliberately does **not** reverse (skips trigger when `deleted_at` is set).  
3. Therefore any path that removes the bill **without** a successful soft-delete/cancel reverse leaves phantom `stock_qty` and a permanent orphan `purchase` movement.

**Evidence for B0326034:** bill absent + orphan `purchase` +1 + no `soft_delete_purchase`/`purchase_delete` + `stock_qty` still includes that unit.

**Not proven:** exact UI click (Recycle Bin vs SQL/admin). Proven: **current hard-delete path cannot heal a missing reverse**, and live-line delete would have left reverse rows we do not have.

---

## Fix list (impact ÷ risk)

Ordered highest leverage first. Phase 0 only — do not implement here.

### Code fix (prevent recurrence)

1. **Make permanent delete of purchases stock-safe** (high impact / medium risk)  
   - Either: refuse hard delete unless a reverse movement exists for every prior `purchase` of that `reference_id`, **or**  
   - Run reverse inside a single SECURITY DEFINER RPC that deletes children + header atomically (same txn as reverse).  
   - Same pattern review for sales / returns hard delete from dashboard.

2. **Block hard delete of stock documents that still have unbalanced movements** (high / low)  
   - Pre-check: for `reference_id`, `SUM(signed qty by type rules) ≈ 0` or explicit reverse present.

3. **Telemetry** (medium / low)  
   - Alert when `stock_movements.reference_id` has no matching header in `purchase_bills`/`sales` for org.

### Data repair (after code fix; preserve evidence first)

4. **Export orphan movement report** (low risk) — appendix SQL; retain CSV.  
5. **Per-org qty repair** via transaction recompute **only after** export (medium risk) — `fix_stock_discrepancies` / controlled `reconcile_variant_stock_qty`.  
6. **Optional ledger hygiene** (higher risk) — insert compensating `purchase_delete` / note for orphans, or mark movements superseded; do **not** silently `DELETE` movements without audit.

### Ongoing detection

7. **Nightly / weekly read-only job:** count genuine-drift variants (sentinel-excluded) + count orphan `purchase`/`sale` movements with missing headers.  
8. **Gate stock settlement write-off** behind “org genuine drift = 0” or admin acknowledgment.

---

## Is any shop’s inventory valuation materially wrong today?

**Yes, at least locally.**

- VELVET trigger SKU: **+1 unit phantom** at purchase cost of that variant (small rupee amount alone).  
- Caller’s genuine-looking org list (VELVET 139 variants ~2.9 avg, others hundreds of variants) implies **material unit-count error** if averages hold after sentinel exclusion — valuation impact = `Σ (drift × pur_price)` for overstated rows (and opposite for understated).  
- Exact ₹ totals need appendix SQL; do **not** use the 33-org raw totals that include ~999 999 sentinels.

Settlement write-off on an overstated org would convert phantom stock into recorded shrinkage — **valuation and P&amp;L both wrong in the same direction**.

---

## Appendix — privileged SELECTs only

Bound by `organization_id`. Prefer `pg_class.reltuples` for `stock_movements` size; do not `count(*)` the full table.

### A. B0326034 — all variants / reverse check

```sql
-- Replace UUID if needed
SELECT sm.movement_type, sm.quantity, sm.variant_id, sm.bill_number, sm.reference_id, sm.created_at, sm.notes
FROM stock_movements sm
WHERE sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND (
    sm.reference_id = 'bd142466-0000-0000-0000-000000000000'::uuid  -- paste full id from movement
    OR sm.bill_number = 'B0326034'
  )
ORDER BY sm.created_at;

SELECT id, software_bill_no, deleted_at, is_cancelled
FROM purchase_bills
WHERE organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND (id::text LIKE 'bd142466%' OR software_bill_no = 'B0326034');
```

### B. Sentinel vs genuine drift for one org (~8s-safe)

```sql
WITH rows AS (
  SELECT * FROM public.detect_stock_discrepancies('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
),
enriched AS (
  SELECT r.*,
         pv.pur_price,
         p.product_type,
         (r.current_stock_qty >= 999999 OR COALESCE(p.product_type,'goods') IN ('service','combo')) AS is_sentinel
  FROM rows r
  JOIN product_variants pv ON pv.id = r.variant_id
  JOIN products p ON p.id = pv.product_id
)
SELECT
  COUNT(*) FILTER (WHERE is_sentinel) AS sentinel_variants,
  COUNT(*) FILTER (WHERE NOT is_sentinel) AS genuine_variants,
  COUNT(*) FILTER (WHERE NOT is_sentinel AND discrepancy > 0) AS overstated,
  COUNT(*) FILTER (WHERE NOT is_sentinel AND discrepancy < 0) AS understated,
  COALESCE(SUM(discrepancy) FILTER (WHERE NOT is_sentinel),0) AS net_units_genuine,
  COALESCE(SUM(discrepancy * COALESCE(pur_price,0)) FILTER (WHERE NOT is_sentinel AND discrepancy > 0),0) AS overstated_value,
  COALESCE(SUM(ABS(discrepancy) * COALESCE(pur_price,0)) FILTER (WHERE NOT is_sentinel AND discrepancy < 0),0) AS understated_value_abs
FROM enriched;
```

### C. Orphan purchase movements (org-bounded)

```sql
SELECT sm.id, sm.variant_id, sm.quantity, sm.bill_number, sm.reference_id, sm.created_at
FROM stock_movements sm
WHERE sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND sm.movement_type = 'purchase'
  AND sm.reference_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM purchase_bills pb
    WHERE pb.id = sm.reference_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements r
    WHERE r.organization_id = sm.organization_id
      AND r.variant_id = sm.variant_id
      AND r.reference_id = sm.reference_id
      AND r.movement_type IN ('purchase_delete','soft_delete_purchase')
  )
LIMIT 500;
```

### D. Movement table size estimate

```sql
SELECT c.relname, c.reltuples::bigint AS est_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'stock_movements';
```

---

## Stop

Phase 0 complete. Awaiting approval before any code fix, data repair, or tooling changes.
