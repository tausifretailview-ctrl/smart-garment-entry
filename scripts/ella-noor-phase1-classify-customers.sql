-- =============================================================================
-- ELLA NOOR — Phase 1: classify non-settled customers & deep-dive queue
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- READ-ONLY. Run ONE section at a time in Supabase SQL editor.
-- Works without JWT (uses _get_customer_party_balances_rows, not assert_org_member).
-- =============================================================================

SET statement_timeout = '120s';


-- -----------------------------------------------------------------------------
-- 1A) All non-settled customers — canonical party balances (export CSV)
-- -----------------------------------------------------------------------------
SELECT
  out_customer_id AS customer_id,
  out_customer_name AS customer_name,
  out_signed_balance AS signed_balance,
  out_direction AS direction,
  out_advance_available AS advance_available,
  out_net_position AS net_position
FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE ABS(out_signed_balance) > 0.01
   OR COALESCE(out_advance_available, 0) > 0.01
ORDER BY ABS(out_signed_balance) DESC;


-- -----------------------------------------------------------------------------
-- 1B) Paid_amount drift — invoices needing settlement resync (Phase 1 batch R5)
-- Pass: review list; repair via compute_sale_settlement per sale (not hand-edit)
-- -----------------------------------------------------------------------------
SELECT
  s.sale_number,
  c.customer_name,
  s.payment_status,
  s.net_amount,
  s.sale_return_adjust,
  s.paid_amount AS recorded_paid,
  cs.new_paid AS expected_paid,
  ROUND(s.paid_amount - cs.new_paid, 2) AS drift
FROM public.sales s
JOIN public.customers c ON c.id = s.customer_id
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
  AND ABS(s.paid_amount - cs.new_paid) > 0.99
ORDER BY ABS(s.paid_amount - cs.new_paid) DESC
LIMIT 100;


-- -----------------------------------------------------------------------------
-- 1C) CN double-apply queue (P0/P1) — sales with SRA + CN voucher + open return pool
-- -----------------------------------------------------------------------------
WITH cn_on_sales AS (
  SELECT s.customer_id,
         SUM(ve.total_amount) AS cn_voucher_applied
  FROM public.voucher_entries ve
  JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
  WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt')
    AND s.deleted_at IS NULL
  GROUP BY s.customer_id
),
pending_sr AS (
  SELECT customer_id,
         SUM(COALESCE(credit_available_balance, net_amount, 0)) AS pending_cab
  FROM public.sale_returns
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND deleted_at IS NULL
    AND LOWER(COALESCE(credit_status, '')) IN ('pending', 'partially_adjusted')
  GROUP BY customer_id
),
sra_totals AS (
  SELECT customer_id, SUM(COALESCE(sale_return_adjust, 0)) AS total_sra
  FROM public.sales
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND deleted_at IS NULL
  GROUP BY customer_id
)
SELECT
  c.customer_name,
  c.id AS customer_id,
  ROUND(COALESCE(cn.cn_voucher_applied, 0), 2) AS cn_vouchers_on_sales,
  ROUND(COALESCE(sr.total_sra, 0), 2) AS sale_return_adjust_total,
  ROUND(COALESCE(ps.pending_cab, 0), 2) AS pending_return_pool,
  ROUND(COALESCE(cn.cn_voucher_applied, 0) + COALESCE(ps.pending_cab, 0), 2) AS double_count_ceiling,
  pb.out_signed_balance AS party_balance
FROM public.customers c
LEFT JOIN cn_on_sales cn ON cn.customer_id = c.id
LEFT JOIN pending_sr ps ON ps.customer_id = c.id
LEFT JOIN sra_totals sr ON sr.customer_id = c.id
LEFT JOIN public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) pb
  ON pb.out_customer_id = c.id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND (
    COALESCE(cn.cn_voucher_applied, 0) > 500
    AND COALESCE(ps.pending_cab, 0) > 500
  )
ORDER BY double_count_ceiling DESC;


-- -----------------------------------------------------------------------------
-- 1D) Advance outliers — pool + Cr balance (Anusha pattern)
-- -----------------------------------------------------------------------------
SELECT
  c.customer_name,
  c.id AS customer_id,
  pb.out_signed_balance AS party_balance,
  pb.out_advance_available AS advance_available,
  ROUND(COALESCE(SUM(ca.amount), 0), 2) AS advance_booked,
  ROUND(COALESCE(SUM(ca.used_amount), 0), 2) AS advance_used,
  ROUND(COALESCE(SUM(ca.amount - ca.used_amount), 0), 2) AS advance_unused_raw,
  (
    SELECT ROUND(COALESCE(SUM(ar.refund_amount), 0), 2)
    FROM public.advance_refunds ar
    JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
    WHERE ca2.customer_id = c.id
  ) AS advance_refunded
FROM public.customers c
JOIN public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) pb
  ON pb.out_customer_id = c.id
LEFT JOIN public.customer_advances ca ON ca.customer_id = c.id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
GROUP BY c.id, c.customer_name, pb.out_signed_balance, pb.out_advance_available
HAVING COALESCE(pb.out_advance_available, 0) > 500
   AND pb.out_signed_balance < -500
ORDER BY pb.out_advance_available DESC;


-- -----------------------------------------------------------------------------
-- 1E) Advance refund exceeds booking remainder (org-wide scan)
-- -----------------------------------------------------------------------------
SELECT
  c.customer_name,
  ca.advance_number,
  ca.amount AS booked,
  ca.used_amount,
  ca.amount - ca.used_amount AS remainder_at_booking,
  COALESCE(ref.total_refunded, 0) AS total_refunded,
  COALESCE(ref.total_refunded, 0) - GREATEST(0, ca.amount - ca.used_amount) AS over_refund
FROM public.customer_advances ca
JOIN public.customers c ON c.id = ca.customer_id
LEFT JOIN (
  SELECT advance_id, SUM(refund_amount) AS total_refunded
  FROM public.advance_refunds
  GROUP BY advance_id
) ref ON ref.advance_id = ca.id
WHERE ca.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND COALESCE(ref.total_refunded, 0) > GREATEST(0, ca.amount - ca.used_amount) + 0.01
ORDER BY over_refund DESC
LIMIT 100;


-- -----------------------------------------------------------------------------
-- 1F) Per-customer component breakdown — CHANGE name pattern on line 3 only
-- (Use when reconcile_customer_balance fails with Authentication required)
-- -----------------------------------------------------------------------------
WITH target AS (
  SELECT c.id, c.customer_name, COALESCE(c.opening_balance, 0) AS opening_balance
  FROM public.customers c
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
    AND c.customer_name ILIKE '%shumama%baireli%'  -- <<< CHANGE THIS
  LIMIT 1
),
party AS (
  SELECT p.out_signed_balance, p.out_advance_available
  FROM target t
  JOIN public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
    ON p.out_customer_id = t.id
)
SELECT t.customer_name, src.source, src.amount, src.detail
FROM target t
CROSS JOIN party p
CROSS JOIN LATERAL (
  SELECT 'party_rpc (canonical)' AS source, p.out_signed_balance AS amount, 'Customer Balances' AS detail
  UNION ALL SELECT 'opening_balance', t.opening_balance, 'customers'
  UNION ALL SELECT 'total_invoiced', COALESCE((
    SELECT SUM(s.net_amount) FROM public.sales s
    WHERE s.customer_id = t.id AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled,false)=false
      AND COALESCE(s.payment_status,'') NOT IN ('cancelled','hold')), 0), 'sales.net_amount'
  UNION ALL SELECT 'sale_return_adjust', -COALESCE((
    SELECT SUM(s.sale_return_adjust) FROM public.sales s
    WHERE s.customer_id = t.id AND s.deleted_at IS NULL), 0), 'sales.sale_return_adjust'
  UNION ALL SELECT 'return_pool_credit', -COALESCE((
    SELECT SUM(GREATEST(0, COALESCE(sr.credit_available_balance, sr.net_amount)))
    FROM public.sale_returns sr
    WHERE sr.customer_id = t.id AND sr.deleted_at IS NULL
      AND LOWER(COALESCE(sr.credit_status,'')) NOT IN ('refunded')), 0), 'sale_returns CAB'
  UNION ALL SELECT 'cn_vouchers_applied', -COALESCE((
    SELECT SUM(ve.total_amount) FROM public.voucher_entries ve
    JOIN public.sales s ON s.id = ve.reference_id
    WHERE s.customer_id = t.id AND ve.deleted_at IS NULL
      AND ve.voucher_type='receipt'
      AND LOWER(COALESCE(ve.payment_method,''))='credit_note_adjustment'), 0), 'CN receipts'
  UNION ALL SELECT 'advance_used', -COALESCE((
    SELECT SUM(ca.used_amount) FROM public.customer_advances ca
    WHERE ca.customer_id = t.id), 0), 'customer_advances.used'
  UNION ALL SELECT 'unused_advance', -COALESCE((
    SELECT GREATEST(0, SUM(ca.amount)-SUM(ca.used_amount)-COALESCE((
      SELECT SUM(ar.refund_amount) FROM public.advance_refunds ar
      JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
      WHERE ca2.customer_id = t.id),0))
    FROM public.customer_advances ca WHERE ca.customer_id = t.id), 0), 'advance pool'
) src
ORDER BY source;


-- -----------------------------------------------------------------------------
-- 1G) P0/P1 quick list — party balance + return pool + CN flags
-- -----------------------------------------------------------------------------
WITH party AS (
  SELECT out_customer_id, out_customer_name, out_signed_balance, out_direction
  FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE out_customer_name ILIKE ANY (ARRAY[
    '%Sumaiya Chhapra%', '%Tanvi Taufu%', '%SHUMAMA BAIRELI%',
    '%Saba Ali%', '%Siya Kapoor%', '%Sharmin Mewara%', '%Hanif bhai%',
    '%KHADIJA SHEIKH%', '%MAHENOOR KAS%', '%Anusha Pathan%', '%NASIM VAPI%'
  ])
),
ret AS (
  SELECT sr.customer_id,
         SUM(COALESCE(sr.credit_available_balance, sr.net_amount, 0)) AS return_pool,
         COUNT(*) FILTER (WHERE LOWER(COALESCE(sr.credit_status,'')) = 'pending') AS pending_returns
  FROM public.sale_returns sr
  WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND sr.deleted_at IS NULL
  GROUP BY sr.customer_id
)
SELECT
  p.out_customer_name,
  p.out_signed_balance,
  p.out_direction,
  ROUND(COALESCE(r.return_pool, 0), 2) AS return_pool,
  COALESCE(r.pending_returns, 0) AS pending_return_count
FROM party p
LEFT JOIN ret r ON r.customer_id = p.out_customer_id
ORDER BY ABS(p.out_signed_balance) DESC;


-- -----------------------------------------------------------------------------
-- 1F-batch) Per-customer component breakdown for MULTIPLE names at once
-- Edit the name_patterns array below — do NOT paste bare AND lines into SQL editor
-- -----------------------------------------------------------------------------
WITH name_patterns AS (
  SELECT unnest(ARRAY[
    '%Sharmin Mewara%',
    '%Saba Ali%',
    '%Siya Kapoor%',
    '%Anusha Pathan%',
    '%Hanif bhai%'
  ]) AS pattern
),
target AS (
  SELECT DISTINCT ON (c.id)
    c.id,
    c.customer_name,
    COALESCE(c.opening_balance, 0) AS opening_balance
  FROM public.customers c
  CROSS JOIN name_patterns np
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
    AND c.customer_name ILIKE np.pattern
  ORDER BY c.id, c.customer_name
),
party AS (
  SELECT p.out_customer_id, p.out_signed_balance, p.out_advance_available
  FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
  WHERE p.out_customer_id IN (SELECT id FROM target)
)
SELECT
  t.customer_name,
  src.source,
  src.amount,
  src.detail
FROM target t
JOIN party p ON p.out_customer_id = t.id
CROSS JOIN LATERAL (
  SELECT 'party_rpc (canonical)' AS source, p.out_signed_balance AS amount, 'Customer Balances' AS detail
  UNION ALL SELECT 'opening_balance', t.opening_balance, 'customers'
  UNION ALL SELECT 'total_invoiced', COALESCE((
    SELECT SUM(s.net_amount) FROM public.sales s
    WHERE s.customer_id = t.id AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')), 0), 'sales.net_amount'
  UNION ALL SELECT 'sale_return_adjust', -COALESCE((
    SELECT SUM(s.sale_return_adjust) FROM public.sales s
    WHERE s.customer_id = t.id AND s.deleted_at IS NULL), 0), 'sales.sale_return_adjust'
  UNION ALL SELECT 'return_pool_credit', -COALESCE((
    SELECT SUM(GREATEST(0, COALESCE(sr.credit_available_balance, sr.net_amount)))
    FROM public.sale_returns sr
    WHERE sr.customer_id = t.id AND sr.deleted_at IS NULL
      AND LOWER(COALESCE(sr.credit_status, '')) NOT IN ('refunded')), 0), 'sale_returns CAB'
  UNION ALL SELECT 'cn_vouchers_applied', -COALESCE((
    SELECT SUM(ve.total_amount) FROM public.voucher_entries ve
    JOIN public.sales s ON s.id = ve.reference_id
    WHERE s.customer_id = t.id AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'), 0), 'CN receipts'
  UNION ALL SELECT 'advance_used', -COALESCE((
    SELECT SUM(ca.used_amount) FROM public.customer_advances ca
    WHERE ca.customer_id = t.id), 0), 'customer_advances.used'
  UNION ALL SELECT 'unused_advance', -COALESCE((
    SELECT GREATEST(0, SUM(ca.amount) - SUM(ca.used_amount) - COALESCE((
      SELECT SUM(ar.refund_amount) FROM public.advance_refunds ar
      JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
      WHERE ca2.customer_id = t.id), 0))
    FROM public.customer_advances ca WHERE ca.customer_id = t.id), 0), 'advance pool'
) src
ORDER BY t.customer_name, src.source;
