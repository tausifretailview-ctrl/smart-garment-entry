-- =============================================================================
-- ELLA NOOR — P0 customer component breakdown (Phase 1 §1F)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Run in Supabase SQL editor (no JWT). Same logic as phase1 §1F-batch but scoped
-- to the three P0 customers needing owner sign-off before R2 repair.
--
-- P0 customers:
--   Sumaiya Chhapra Bhabhi  ₹4,73,730 Dr  (recon gap ₹2,06,350)
--   Tanvi Taufu             ₹2,950 Dr      (return pool misalignment)
--   SHUMAMA BAIRELI         ₹1,58,700 Dr   (CN double-apply — R2)
-- =============================================================================

WITH name_patterns AS (
  SELECT unnest(ARRAY[
    '%Sumaiya Chhapra Bhabhi%',
    '%Tanvi Taufu%',
    '%SHUMAMA BAIRELI%'
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


-- -----------------------------------------------------------------------------
-- P0 recon gap vs party (requires auth-gated RPC — skip if 42501 in SQL editor)
-- Compare party RPC to reconcile_customer_balance when JWT available.
-- -----------------------------------------------------------------------------
