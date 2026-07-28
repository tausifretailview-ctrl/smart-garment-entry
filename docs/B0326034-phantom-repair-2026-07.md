# B0326034 phantom stock repair — VELVET (8 units)

**Date:** 2026-07-28  
**Org:** `dafc3d0c-874e-4784-bac3-5eab5f3c85b5`  
**Bill:** `bd142466-6fd9-49ae-b8df-8a2febc6ee76` / `B0326034`  
**Status:** SQL for operator run — **not executed from the agent.**

---

## Step 1 — Cause (read-only)

### Does hard delete reverse stock?

**No.** `useSoftDelete.tsx` hard-delete for `purchase_bills` (lines 506–509):

1. `DELETE` from `purchase_items` where `bill_id = id`
2. `DELETE` from `batch_stock` where `purchase_bill_id = id`
3. `DELETE` from `purchase_bills` where `id` + `organization_id`

There is **no** stock reverse and **no** `stock_movements` insert in this path.

### What happens when `purchase_items` are deleted?

Trigger `handle_purchase_item_delete` (`20260928140000_…`):

- If `OLD.deleted_at IS NOT NULL` → **return immediately** (no reverse). This is the Recycle Bin case after soft-delete.
- If live (`deleted_at IS NULL`) → writes `purchase_delete` and decrements `stock_qty`.

### Does soft-delete reverse?

**Yes.** RPC `soft_delete_purchase_bill` reverses `stock_qty` and inserts `soft_delete_purchase` in one transaction, then sets `deleted_at` on items + bill.

### Is `check_purchase_stock_dependencies` on the hard-delete path?

**No.** It is only used from `PurchaseBillDashboard` before **soft**-delete. Hard-delete / Recycle Bin never calls it.

### `purchase_bills` DELETE triggers?

`trg_purchase_bills_delete_purge_journal` — purges **journal_entries** only. Does **not** touch stock.

### Recycle Bin gating

Recycle Bin lists only `deleted_at IS NOT NULL`. So the UI hard-delete path normally runs **after** soft-delete (when reverse should already exist).

### Org reset / supplier cascade / backup

- Org reset wipes movements with data — would not leave orphan `purchase` rows alone.
- Supplier soft-delete does not CASCADE-delete purchase bills.
- No evidence in-repo of a supplier hard-delete cascade that removes bills.

### AuditLog / app_error_logs

**Not queried** — this checkout has no service-role / SQL editor session. Cannot confirm who deleted the bill around 2026-03-18 → 2026-03-31.

### Verdict

| Question | Answer |
|----------|--------|
| Does hard-delete reverse stock? | **No** — relies on a prior soft-delete reverse |
| Is that a live latent bug? | **Yes** — if items ever reach hard-delete with `deleted_at` set **without** a successful reverse (or reverse movements later removed), this exact signature appears |
| Can we prove hard-delete removed B0326034? | **No** — no AuditLog evidence in this session |
| Soft-then-hard with successful reverse? | Would leave `soft_delete_purchase` rows — **not observed** |
| Live hard-delete of never-soft-deleted lines? | Would leave `purchase_delete` rows — **not observed** |

**Cause statement:** The removal actor is **undetermined** without AuditLog. The **mechanism that produces this signature** is: bill header removed while purchase credits remain and no reverse movements exist. The current hard-delete path **cannot heal** a missing reverse and is a **live bug** for any bill that reaches permanent delete without a successful soft-delete reverse. Step 4 proposal applies.

---

## Step 2 — Repair SQL (run in Supabase SQL editor)

### Why not `reconcile_variant_stock_qty` alone?

That RPC inserts a **signed** `reconciliation` movement (`quantity = calculated − current`). After soft-deleting the orphan `+1`, that would add another `−1` to the **active** movement ledger while setting `stock_qty` to calculated → **movement sum ≠ stock_qty**, which fails verify item 2.

Also: `reconcile_variant_stock_qty` reads **transaction tables**, not movements — correct for qty, but can move a variant by more than −1 if other drift exists.

**Repair used here:** soft-delete the 8 orphan `purchase` rows by `reference_id`, then `stock_qty -= 1` for each listed variant, plus a **quantity-0** audit `reconciliation` note. Pre-checks abort if any variant would not be a clean −1 vs active movement sum.

### 2A — Backup (export CSV from results)

```sql
-- Backup: 8 orphans + any sale_delete sharing bill_number string (do not delete sale_delete)
SELECT sm.*
FROM public.stock_movements sm
WHERE sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND (
    sm.reference_id = 'bd142466-6fd9-49ae-b8df-8a2febc6ee76'
    OR (
      sm.bill_number = 'B0326034'
      AND sm.variant_id = 'f0d0f752-7e05-41a9-8fec-2df3d7f47f3c'
      AND sm.movement_type = 'sale_delete'
    )
  )
ORDER BY sm.created_at, sm.movement_type, sm.variant_id;
```

Save as `B0326034-movements-backup-YYYYMMDD.csv` before continuing.

### 2B — Pre-check (must show expected_delta = 1 for all 8)

```sql
WITH targets AS (
  SELECT unnest(ARRAY[
    '3d02734b-87b9-4c04-8bfd-86b2101a1fc1'::uuid,
    '5146d5ba-7adc-418b-8932-ced871be8120'::uuid,
    '59247a9c-3b79-422b-a243-431d3af1c402'::uuid,
    '697293ad-dfce-4a04-a685-ca52a4a85105'::uuid,
    '7e6acf7c-4aca-4721-9d0c-166b67e9a9b4'::uuid,
    'd5f85de2-9f2e-46d2-8329-d93ee3e791ce'::uuid,
    'e044b51c-fc30-48f9-a44c-d5fe49f47c76'::uuid,
    'f0d0f752-7e05-41a9-8fec-2df3d7f47f3c'::uuid
  ]) AS variant_id
),
orphan AS (
  SELECT variant_id, quantity
  FROM public.stock_movements
  WHERE organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
    AND reference_id = 'bd142466-6fd9-49ae-b8df-8a2febc6ee76'
    AND movement_type = 'purchase'
    AND deleted_at IS NULL
)
SELECT
  t.variant_id,
  pv.barcode,
  pv.stock_qty AS stock_before,
  COALESCE((
    SELECT sum(sm.quantity)
    FROM public.stock_movements sm
    WHERE sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
      AND sm.variant_id = t.variant_id
      AND sm.deleted_at IS NULL
  ), 0) AS movement_sum_before,
  COALESCE(o.quantity, 0) AS orphan_qty,
  pv.stock_qty - 1 AS stock_after_expected,
  COALESCE((
    SELECT sum(sm.quantity)
    FROM public.stock_movements sm
    WHERE sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
      AND sm.variant_id = t.variant_id
      AND sm.deleted_at IS NULL
  ), 0) - COALESCE(o.quantity, 0) AS movement_sum_after_expected
FROM targets t
JOIN public.product_variants pv ON pv.id = t.variant_id
LEFT JOIN orphan o ON o.variant_id = t.variant_id
ORDER BY pv.barcode;
```

**Abort unless:** exactly 8 orphan rows, each `orphan_qty = 1`, and `stock_before = movement_sum_before` for each (ledger currently agrees with itself).

Expected after:

| variant | barcode | stock before → after |
|---------|---------|----------------------|
| `697293ad-…` | 150001717 | 2 → 1 |
| `d5f85de2-…` | 150001718 | 2 → 1 |
| `7e6acf7c-…` | 150001719 | 1 → **0** |
| `f0d0f752-…` | 150001720 | 2 → 1 |
| `3d02734b-…` | 150001721 | 2 → 1 |
| `5146d5ba-…` | 150001722 | 2 → 1 |
| `59247a9c-…` | 150001723 | 2 → 1 |
| `e044b51c-…` | 150001724 | 1 → **0** |

(Confirm `stock_before` from pre-check — do not assume if pre-check differs.)

### 2C — Repair (single transaction)

```sql
BEGIN;

-- 1) Soft-delete exactly the 8 orphan purchases (scope by reference_id ONLY)
UPDATE public.stock_movements
SET deleted_at = now()
WHERE organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND reference_id = 'bd142466-6fd9-49ae-b8df-8a2febc6ee76'
  AND movement_type = 'purchase'
  AND deleted_at IS NULL;

-- Expect 8
-- SELECT count(*) FROM stock_movements WHERE reference_id = 'bd142466-6fd9-49ae-b8df-8a2febc6ee76' AND deleted_at IS NOT NULL AND movement_type = 'purchase';

-- 2) Decrement stock_qty by 1 for the 8 variants only
UPDATE public.product_variants pv
SET
  stock_qty = pv.stock_qty - 1,
  updated_at = now()
WHERE pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND pv.id IN (
    '3d02734b-87b9-4c04-8bfd-86b2101a1fc1',
    '5146d5ba-7adc-418b-8932-ced871be8120',
    '59247a9c-3b79-422b-a243-431d3af1c402',
    '697293ad-dfce-4a04-a685-ca52a4a85105',
    '7e6acf7c-4aca-4721-9d0c-166b67e9a9b4',
    'd5f85de2-9f2e-46d2-8329-d93ee3e791ce',
    'e044b51c-fc30-48f9-a44c-d5fe49f47c76',
    'f0d0f752-7e05-41a9-8fec-2df3d7f47f3c'
  )
  AND pv.stock_qty >= 1;

-- Expect 8 rows updated. If less, ROLLBACK.

-- 3) Audit only (quantity 0 — does not change movement sum)
INSERT INTO public.stock_movements (
  variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id
)
SELECT
  v.id,
  'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid,
  'reconciliation',
  0,
  'bd142466-6fd9-49ae-b8df-8a2febc6ee76'::uuid,
  'B0326034',
  'Repair 2026-07-28: voided orphan purchase for missing bill B0326034; stock_qty −1',
  auth.uid()
FROM (VALUES
  ('3d02734b-87b9-4c04-8bfd-86b2101a1fc1'::uuid),
  ('5146d5ba-7adc-418b-8932-ced871be8120'::uuid),
  ('59247a9c-3b79-422b-a243-431d3af1c402'::uuid),
  ('697293ad-dfce-4a04-a685-ca52a4a85105'::uuid),
  ('7e6acf7c-4aca-4721-9d0c-166b67e9a9b4'::uuid),
  ('d5f85de2-9f2e-46d2-8329-d93ee3e791ce'::uuid),
  ('e044b51c-fc30-48f9-a44c-d5fe49f47c76'::uuid),
  ('f0d0f752-7e05-41a9-8fec-2df3d7f47f3c'::uuid)
) AS v(id);

-- 4) Verify inside txn
-- (run the verification SELECTs below; COMMIT only if clean)

COMMIT;
-- or ROLLBACK;
```

### 2D — Verify

```sql
-- Per-variant: stock_qty == active movement sum; expected 0 or 1 as above
WITH targets AS (
  SELECT unnest(ARRAY[
    '3d02734b-87b9-4c04-8bfd-86b2101a1fc1'::uuid,
    '5146d5ba-7adc-418b-8932-ced871be8120'::uuid,
    '59247a9c-3b79-422b-a243-431d3af1c402'::uuid,
    '697293ad-dfce-4a04-a685-ca52a4a85105'::uuid,
    '7e6acf7c-4aca-4721-9d0c-166b67e9a9b4'::uuid,
    'd5f85de2-9f2e-46d2-8329-d93ee3e791ce'::uuid,
    'e044b51c-fc30-48f9-a44c-d5fe49f47c76'::uuid,
    'f0d0f752-7e05-41a9-8fec-2df3d7f47f3c'::uuid
  ]) AS variant_id
)
SELECT
  pv.barcode,
  pv.stock_qty,
  COALESCE(sum(sm.quantity), 0) AS movement_sum,
  pv.stock_qty - COALESCE(sum(sm.quantity), 0) AS delta
FROM targets t
JOIN product_variants pv ON pv.id = t.variant_id
LEFT JOIN stock_movements sm
  ON sm.variant_id = t.variant_id
 AND sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
 AND sm.deleted_at IS NULL
GROUP BY pv.barcode, pv.stock_qty
ORDER BY pv.barcode;

-- sale_delete on f0d0f752 must still exist and not be soft-deleted
SELECT id, movement_type, quantity, deleted_at, bill_number
FROM stock_movements
WHERE organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
  AND variant_id = 'f0d0f752-7e05-41a9-8fec-2df3d7f47f3c'
  AND movement_type = 'sale_delete'
  AND bill_number = 'B0326034';

-- Detector: this bill must disappear
SELECT * FROM public.detect_orphan_purchase_stock('dafc3d0c-874e-4784-bac3-5eab5f3c85b5');

-- Control org must stay clean (replace uuid if needed)
SELECT * FROM public.detect_orphan_purchase_stock('a1bac661-0000-0000-0000-000000000000');
-- Use full a1bac661 org uuid from your scan.
```

### Soft-delete vs hard-delete of movements

`stock_movements.deleted_at` exists. The **new detector** filters it. Most history UIs (`StockAnalysis`, `ProductHistoryDialog`, etc.) **do not** filter `deleted_at` yet — voided rows remain visible (acceptable as audit). Verification and detector **must** use `deleted_at IS NULL`.

---

## Step 3 — Detector

- Migration: `supabase/migrations/20261028120000_detect_orphan_purchase_stock.sql`
- UI: Settings → Stock Reconciliation card (orphan scan panel)
- Validate after deploy:

```sql
SELECT * FROM detect_orphan_purchase_stock('<a1bac661-full-uuid>');  -- expect 0
SELECT * FROM detect_orphan_purchase_stock('dafc3d0c-874e-4784-bac3-5eab5f3c85b5');
-- before repair: 1 row B0326034 / bd142466… net_qty 8
-- after repair: 0 rows
```

### Sales / returns equivalent (design only — not built)

Same pattern: group by `reference_id` for `sale`/`sale_delete`/`soft_delete_sale` (and return families) where header missing and net qty ≠ 0. Sign conventions differ (sale credits vs purchase). Build only after purchase detector is proven quiet on controls.

---

## Step 4 — Hard-delete fix (**implemented**)

**Migration:** `supabase/migrations/20261028130000_hard_delete_purchase_bill.sql`  
**Client:** `useSoftDelete.tsx` — `hardDelete('purchase_bills')` calls RPC only (no multi-step client deletes).

### Behaviour

1. Admin + org member only.  
2. Compute active purchase-family movement net per variant for `reference_id = bill_id` (`deleted_at IS NULL`).  
3. If any net &gt; 0: negative-stock guard, reverse `stock_qty` / `batch_stock`, insert `soft_delete_purchase` (−net).  
4. Flag any live `purchase_items` with `deleted_at` so the item DELETE trigger does not double-reverse.  
5. Delete `batch_stock`, `purchase_items`, then `purchase_bills` (journal purge trigger still fires).  

Sales / returns hard-delete remain client multi-step (separate follow-up).

**Deploy:** apply this migration on Supabase before relying on Recycle Bin permanent delete for purchases.
