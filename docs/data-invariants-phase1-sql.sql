-- =============================================================================
-- Data invariants — Phase 1 read-only SQL pack (2026-07)
-- Detection only. No UPDATE / INSERT / DELETE / DDL.
-- Run each section separately in Supabase SQL editor; export CSV per result.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- INV-01  Sale totals reconcile
-- Identity (as specified): gross_amount - discount_amount ≈ net_amount (±0.01)
-- NOTE: app also has flat_discount_amount / other_charges / round_off /
--       sale_return_adjust — see INV-01b in the markdown report.
-- ---------------------------------------------------------------------------
SELECT
  s.organization_id,
  COUNT(*) AS violation_count,
  ROUND(SUM(ABS(
    COALESCE(s.gross_amount, 0)
    - COALESCE(s.discount_amount, 0)
    - COALESCE(s.net_amount, 0)
  ))::numeric, 2) AS sum_abs_gap,
  (ARRAY_AGG(s.id ORDER BY ABS(
    COALESCE(s.gross_amount, 0) - COALESCE(s.discount_amount, 0) - COALESCE(s.net_amount, 0)
  ) DESC))[1:5] AS sample_ids
FROM sales s
WHERE s.deleted_at IS NULL
  AND ABS(
    COALESCE(s.gross_amount, 0)
    - COALESCE(s.discount_amount, 0)
    - COALESCE(s.net_amount, 0)
  ) > 0.01
GROUP BY s.organization_id
ORDER BY violation_count DESC;

-- ---------------------------------------------------------------------------
-- INV-01b  Sale totals reconcile (richer identity — proposed)
-- gross - discount - flat_discount + other_charges + round_off ≈ net + sale_return_adjust
-- (POS: net is payable after S/R; merchandise ≈ net + sra)
-- ---------------------------------------------------------------------------
SELECT
  s.organization_id,
  COUNT(*) AS violation_count,
  (ARRAY_AGG(s.id ORDER BY ABS(
    COALESCE(s.gross_amount, 0)
    - COALESCE(s.discount_amount, 0)
    - COALESCE(s.flat_discount_amount, 0)
    + COALESCE(s.other_charges, 0)
    + COALESCE(s.round_off, 0)
    - (COALESCE(s.net_amount, 0) + COALESCE(s.sale_return_adjust, 0))
  ) DESC))[1:5] AS sample_ids
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

-- ---------------------------------------------------------------------------
-- INV-02  No headerless documents (live header, zero live lines)
-- ---------------------------------------------------------------------------
-- 02a sales
SELECT s.organization_id, COUNT(*) AS violation_count,
       (ARRAY_AGG(s.id))[1:5] AS sample_ids,
       ROUND(SUM(COALESCE(s.net_amount, 0))::numeric, 2) AS sum_net
FROM sales s
WHERE s.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sale_items si
    WHERE si.sale_id = s.id AND si.deleted_at IS NULL
  )
GROUP BY s.organization_id
ORDER BY violation_count DESC;

-- 02b purchase_bills
SELECT pb.organization_id, COUNT(*) AS violation_count,
       (ARRAY_AGG(pb.id))[1:5] AS sample_ids,
       ROUND(SUM(COALESCE(pb.net_amount, 0))::numeric, 2) AS sum_net
FROM purchase_bills pb
WHERE pb.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM purchase_items pi
    WHERE pi.bill_id = pb.id AND pi.deleted_at IS NULL
  )
GROUP BY pb.organization_id
ORDER BY violation_count DESC;

-- 02c purchase_returns  (known defect class: empty headers with money)
SELECT pr.organization_id, COUNT(*) AS violation_count,
       (ARRAY_AGG(pr.id))[1:5] AS sample_ids,
       ROUND(SUM(COALESCE(pr.net_amount, 0))::numeric, 2) AS sum_net
FROM purchase_returns pr
WHERE pr.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM purchase_return_items pri
    WHERE pri.return_id = pr.id AND pri.deleted_at IS NULL
  )
GROUP BY pr.organization_id
ORDER BY violation_count DESC;

-- 02d sale_returns
SELECT sr.organization_id, COUNT(*) AS violation_count,
       (ARRAY_AGG(sr.id))[1:5] AS sample_ids,
       ROUND(SUM(COALESCE(sr.net_amount, 0))::numeric, 2) AS sum_net
FROM sale_returns sr
WHERE sr.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sale_return_items sri
    WHERE sri.return_id = sr.id AND sri.deleted_at IS NULL
  )
GROUP BY sr.organization_id
ORDER BY violation_count DESC;

-- ---------------------------------------------------------------------------
-- INV-03  Stock vs DOCUMENT-based recompute (APPROVED — not movement-sum)
-- Formula: opening + purchases - sales - purchase_returns + sale_returns - pending_dc
-- Uses _get_stock_reconciliation_rows per org (excludes service/combo already).
-- Also exclude sentinel stock_qty >= 999999.
-- CONTROL (+): VELVET 697293ad-… must show drift ≠ 0
-- CONTROL (−): sample org with quiet inventory → 0 drifts after sentinel filter
-- ---------------------------------------------------------------------------
-- Cross-org rollup (may be slow — note runtime; iterate orgs if >40s):
SELECT
  o.id AS organization_id,
  COUNT(*) FILTER (WHERE ABS(r.out_drift) > 0.0001 AND COALESCE(r.out_stored_stock_qty,0) < 999999) AS violation_count,
  (ARRAY_AGG(r.out_variant_id ORDER BY ABS(r.out_drift) DESC)
    FILTER (WHERE ABS(r.out_drift) > 0.0001 AND COALESCE(r.out_stored_stock_qty,0) < 999999))[1:5] AS sample_ids
FROM organizations o
CROSS JOIN LATERAL public._get_stock_reconciliation_rows(o.id) r
GROUP BY o.id
HAVING COUNT(*) FILTER (WHERE ABS(r.out_drift) > 0.0001 AND COALESCE(r.out_stored_stock_qty,0) < 999999) > 0
ORDER BY violation_count DESC;

-- CONTROL (+): VELVET phantom variant must appear with drift
SELECT out_variant_id, out_barcode, out_stored_stock_qty, out_recomputed_stock_qty, out_drift
FROM public._get_stock_reconciliation_rows('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
WHERE out_variant_id = '697293ad-dfce-4a04-a685-ca52a4a85105'::uuid;

-- ---------------------------------------------------------------------------
-- INV-04  No orphaned stock movements (reference_id present, parent missing,
--         and net quantity for that reference_id on the variant ≠ 0)
-- CONTROL: org a1bac661-f294-4a95-a7a9-8c64e8864456 must return 0 rows
--          (9,493 purchase matched by 9,493 purchase_delete).
-- ---------------------------------------------------------------------------
WITH live_mov AS (
  SELECT
    sm.organization_id,
    sm.variant_id,
    sm.reference_id,
    sm.movement_type,
    sm.quantity,
    sm.id
  FROM stock_movements sm
  WHERE sm.deleted_at IS NULL
    AND sm.reference_id IS NOT NULL
),
net_by_ref AS (
  SELECT
    organization_id,
    variant_id,
    reference_id::text AS reference_id,
    SUM(quantity)::numeric AS net_qty,
    MIN(id::text) AS sample_movement_id,
    BOOL_OR(movement_type IN (
      'purchase', 'sale', 'purchase_return', 'sale_return',
      'purchase_increase', 'purchase_decrease', 'purchase_edit',
      'sale_update_increase', 'sale_update_decrease', 'reconciliation',
      'restore_purchase', 'restore_sale', 'restore_sale_return', 'restore_purchase_return'
    )) AS has_forward
  FROM live_mov
  GROUP BY 1, 2, 3
),
orphans AS (
  SELECT n.*
  FROM net_by_ref n
  WHERE ABS(n.net_qty) > 0.0001
    AND n.has_forward
    AND NOT EXISTS (SELECT 1 FROM purchase_bills pb WHERE pb.id::text = n.reference_id)
    AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id::text = n.reference_id)
    AND NOT EXISTS (SELECT 1 FROM purchase_returns pr WHERE pr.id::text = n.reference_id)
    AND NOT EXISTS (SELECT 1 FROM sale_returns sr WHERE sr.id::text = n.reference_id)
)
-- Control: this org must be absent / 0
SELECT organization_id, COUNT(*) AS violation_count,
       (ARRAY_AGG(sample_movement_id))[1:5] AS sample_ids
FROM orphans
GROUP BY organization_id
ORDER BY violation_count DESC;

-- Explicit control probe (must be 0):
SELECT COUNT(*) AS orphan_rows_control_org
FROM (
  SELECT 1
  FROM stock_movements sm
  WHERE sm.deleted_at IS NULL
    AND sm.organization_id = 'a1bac661-f294-4a95-a7a9-8c64e8864456'
    AND sm.reference_id IS NOT NULL
  GROUP BY sm.variant_id, sm.reference_id
  HAVING ABS(SUM(sm.quantity)) > 0.0001
    AND BOOL_OR(sm.movement_type = 'purchase')
    AND NOT EXISTS (
      SELECT 1 FROM purchase_bills pb WHERE pb.id = sm.reference_id
    )
) x;

-- ---------------------------------------------------------------------------
-- INV-05  Supplier snapshot vs bill subledger (simplified AO-pool FIFO)
-- Divergence |subledger_payable - snapshot_balance| > 1
-- Full formula is in get_supplier_party_balances; this is a detection proxy.
-- Prefer SECURITY DEFINER RPC in Phase 2 that reuses the app formula.
-- Bound: run per-org if CROSS JOIN is too heavy.
-- ---------------------------------------------------------------------------
-- Per-org template (replace :org_id):
/*
WITH bills AS (
  SELECT pb.supplier_id, pb.id AS bill_id,
         COALESCE(pb.net_amount,0)::numeric AS net,
         COALESCE(pb.paid_amount,0)::numeric AS paid,
         pb.bill_date
  FROM purchase_bills pb
  WHERE pb.organization_id = :org_id
    AND pb.deleted_at IS NULL
    AND pb.supplier_id IS NOT NULL
    AND (pb.is_cancelled IS NULL OR pb.is_cancelled = false)
),
bill_vouchers AS (
  SELECT trim(ve.reference_id::text) AS bill_id,
         SUM(GREATEST(0, COALESCE(ve.total_amount,0)+COALESCE(ve.discount_amount,0)))::numeric AS vpaid
  FROM voucher_entries ve
  WHERE ve.organization_id = :org_id
    AND ve.deleted_at IS NULL
    AND lower(ve.voucher_type)='payment'
    AND lower(COALESCE(ve.reference_type,'')) IN ('supplier','supplierpayment','supplier_payment','purchase')
  GROUP BY 1
),
raw AS (
  SELECT b.supplier_id, b.bill_id, b.bill_date,
         GREATEST(0, b.net - GREATEST(b.paid, COALESCE(bv.vpaid,0)))::numeric AS raw_os
  FROM bills b
  LEFT JOIN bill_vouchers bv ON bv.bill_id = trim(b.bill_id::text)
),
ao_pool AS (
  SELECT pr.supplier_id, SUM(COALESCE(pr.net_amount,0))::numeric AS credit_pool
  FROM purchase_returns pr
  WHERE pr.organization_id = :org_id
    AND pr.deleted_at IS NULL
    AND lower(trim(COALESCE(pr.credit_status,''))) = 'adjusted_outstanding'
  GROUP BY 1
),
ordered AS (
  SELECT r.*,
         COALESCE(a.credit_pool,0) AS pool,
         SUM(r.raw_os) OVER (
           PARTITION BY r.supplier_id
           ORDER BY r.bill_date NULLS FIRST, r.bill_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS cum_raw
  FROM raw r
  LEFT JOIN ao_pool a USING (supplier_id)
  WHERE r.raw_os > 0.01
),
allocated AS (
  SELECT supplier_id,
         SUM(GREATEST(0, raw_os - GREATEST(0, LEAST(raw_os, pool - (cum_raw - raw_os)))))::numeric AS subledger_payable
  FROM ordered
  GROUP BY 1
),
snap AS (
  SELECT out_supplier_id AS supplier_id, out_signed_balance AS snapshot_balance
  FROM _get_supplier_party_balances_rows(:org_id)
)
SELECT
  :org_id AS organization_id,
  s.supplier_id,
  s.snapshot_balance,
  COALESCE(a.subledger_payable, 0) AS subledger_payable,
  ROUND(COALESCE(a.subledger_payable,0) - s.snapshot_balance, 2) AS divergence
FROM snap s
LEFT JOIN allocated a USING (supplier_id)
WHERE ABS(COALESCE(a.subledger_payable,0) - s.snapshot_balance) > 1
ORDER BY ABS(COALESCE(a.subledger_payable,0) - s.snapshot_balance) DESC
LIMIT 50;
*/

-- ---------------------------------------------------------------------------
-- Sentinel / service inventory (for exception validation — expect many rows)
-- ---------------------------------------------------------------------------
SELECT
  pv.organization_id,
  COUNT(*) FILTER (WHERE COALESCE(p.product_type,'goods') IN ('service','combo')) AS service_combo_variants,
  COUNT(*) FILTER (WHERE COALESCE(pv.stock_qty,0) >= 999999) AS sentinel_qty_variants
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY pv.organization_id
ORDER BY sentinel_qty_variants DESC;
