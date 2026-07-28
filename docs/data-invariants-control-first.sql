-- =============================================================================
-- Data invariants — CONTROL-FIRST run order (Phase 1 live counts)
-- Run ONE block at a time. Note wall-clock from SQL editor. No writes.
-- If any CONTROL fails, STOP — do not record that check's violation count.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A) INV-04 CONTROL (−) — MUST be 0 for org a1bac661
-- If >0, the orphan check is wrong; discard INV-04 numbers.
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT COUNT(*) AS orphan_rows_control_org
FROM (
  SELECT sm.variant_id, sm.reference_id
  FROM stock_movements sm
  WHERE sm.deleted_at IS NULL
    AND sm.organization_id = 'a1bac661-f294-4a95-a7a9-8c64e8864456'
    AND sm.reference_id IS NOT NULL
  GROUP BY sm.variant_id, sm.reference_id
  HAVING ABS(SUM(sm.quantity)) > 0.0001
    AND BOOL_OR(sm.movement_type IN (
      'purchase','sale','purchase_return','sale_return',
      'purchase_increase','purchase_decrease','purchase_edit',
      'sale_update_increase','sale_update_decrease','reconciliation',
      'restore_purchase','restore_sale','restore_sale_return','restore_purchase_return'
    ))
    AND NOT EXISTS (SELECT 1 FROM purchase_bills pb WHERE pb.id = sm.reference_id)
    AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = sm.reference_id)
    AND NOT EXISTS (SELECT 1 FROM purchase_returns pr WHERE pr.id = sm.reference_id)
    AND NOT EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.id = sm.reference_id)
) x;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) INV-03 CONTROL (+) — VELVET phantom must show drift ≠ 0
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT out_variant_id, out_barcode, out_stored_stock_qty, out_recomputed_stock_qty, out_drift
FROM public._get_stock_reconciliation_rows('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
WHERE out_variant_id = '697293ad-dfce-4a04-a685-ca52a4a85105'::uuid;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) INV-02c CONTROL (+) — empty purchase_returns (expect ~125 / 7 orgs)
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT pr.organization_id,
       COUNT(*) AS violation_count,
       ROUND(SUM(COALESCE(pr.net_amount, 0))::numeric, 2) AS sum_net,
       (ARRAY_AGG(pr.id))[1:5] AS sample_ids
FROM purchase_returns pr
WHERE pr.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM purchase_return_items pri
    WHERE pri.return_id = pr.id AND pri.deleted_at IS NULL
  )
GROUP BY pr.organization_id
ORDER BY violation_count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- D) INV-02d sale_returns headerless
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT sr.organization_id, COUNT(*) AS violation_count,
       ROUND(SUM(COALESCE(sr.net_amount, 0))::numeric, 2) AS sum_net
FROM sale_returns sr
WHERE sr.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sale_return_items sri
    WHERE sri.return_id = sr.id AND sri.deleted_at IS NULL
  )
GROUP BY sr.organization_id
ORDER BY violation_count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- E) INV-02a sales headerless
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT s.organization_id, COUNT(*) AS violation_count,
       ROUND(SUM(COALESCE(s.net_amount, 0))::numeric, 2) AS sum_net
FROM sales s
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sale_items si
    WHERE si.sale_id = s.id AND si.deleted_at IS NULL
  )
GROUP BY s.organization_id
ORDER BY violation_count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- F) INV-02b purchase_bills headerless
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT pb.organization_id, COUNT(*) AS violation_count,
       ROUND(SUM(COALESCE(pb.net_amount, 0))::numeric, 2) AS sum_net
FROM purchase_bills pb
WHERE pb.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM purchase_items pi
    WHERE pi.bill_id = pb.id AND pi.deleted_at IS NULL
  )
GROUP BY pb.organization_id
ORDER BY violation_count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- G) INV-01b sale identity (rich) — control: sample of quiet completed bills
-- First: count violations; then spot-check a known good bill has gap < 0.01
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT s.organization_id, COUNT(*) AS violation_count
FROM sales s
WHERE s.deleted_at IS NULL
  AND ABS(
    COALESCE(s.gross_amount, 0)
    - COALESCE(s.discount_amount, 0)
    - COALESCE(s.flat_discount_amount, 0)
    + COALESCE(s.other_charges, 0)
    + COALESCE(s.round_off, 0)
    - (COALESCE(s.net_amount, 0) + COALESCE(s.sale_return_adjust, 0))
  ) > 0.01
GROUP BY s.organization_id
ORDER BY violation_count DESC;

-- Negative control (must be near-empty): completed, no flat/sra/round noise
SELECT COUNT(*) AS unexpected_gaps_on_simple_bills
FROM sales s
WHERE s.deleted_at IS NULL
  AND s.payment_status = 'completed'
  AND COALESCE(s.flat_discount_amount, 0) = 0
  AND COALESCE(s.sale_return_adjust, 0) = 0
  AND ABS(COALESCE(s.round_off, 0)) < 0.01
  AND COALESCE(s.other_charges, 0) = 0
  AND ABS(
    COALESCE(s.gross_amount, 0) - COALESCE(s.discount_amount, 0)
    - COALESCE(s.net_amount, 0)
  ) > 0.01;

-- ─────────────────────────────────────────────────────────────────────────────
-- H) INV-04 violations (ONLY if control A returned 0)
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
WITH live_mov AS (
  SELECT organization_id, variant_id, reference_id, movement_type, quantity, id
  FROM stock_movements
  WHERE deleted_at IS NULL AND reference_id IS NOT NULL
),
net_by_ref AS (
  SELECT organization_id, variant_id, reference_id::text AS reference_id,
         SUM(quantity)::numeric AS net_qty,
         MIN(id::text) AS sample_movement_id,
         BOOL_OR(movement_type IN (
           'purchase','sale','purchase_return','sale_return',
           'purchase_increase','purchase_decrease','purchase_edit',
           'sale_update_increase','sale_update_decrease','reconciliation',
           'restore_purchase','restore_sale','restore_sale_return','restore_purchase_return'
         )) AS has_forward
  FROM live_mov
  GROUP BY 1, 2, 3
),
orphans AS (
  SELECT n.*
  FROM net_by_ref n
  WHERE ABS(n.net_qty) > 0.0001 AND n.has_forward
    AND NOT EXISTS (SELECT 1 FROM purchase_bills pb WHERE pb.id::text = n.reference_id)
    AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id::text = n.reference_id)
    AND NOT EXISTS (SELECT 1 FROM purchase_returns pr WHERE pr.id::text = n.reference_id)
    AND NOT EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.id::text = n.reference_id)
)
SELECT organization_id, COUNT(*) AS violation_count,
       (ARRAY_AGG(sample_movement_id))[1:5] AS sample_ids
FROM orphans
GROUP BY organization_id
ORDER BY violation_count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- I) INV-03 document drift — per org via RPC (ONLY if control B shows drift)
-- Start with VELVET alone for timing; then decide whether to CROSS JOIN all orgs.
-- ─────────────────────────────────────────────────────────────────────────────
EXPLAIN ANALYZE
SELECT COUNT(*) AS velvet_drift_variants
FROM public._get_stock_reconciliation_rows('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid) r
WHERE ABS(r.out_drift) > 0.0001
  AND COALESCE(r.out_stored_stock_qty, 0) < 999999;

-- ─────────────────────────────────────────────────────────────────────────────
-- J) INV-05 — SARASWATI / org 5e769632 only first (timing + positive control)
-- ─────────────────────────────────────────────────────────────────────────────
-- Paste the INV-05 per-org template from data-invariants-phase1-sql.sql
-- with :org_id = '5e769632-a203-4a47-9d52-8c2bbdd1b23b'
-- Expect |divergence| >> 1 for supplier 27a7a71f-…
;