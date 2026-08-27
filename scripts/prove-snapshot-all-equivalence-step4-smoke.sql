-- =============================================================================
-- STEP 4 smoke — one customer (SHUMAMA BAIRELI, ELLA NOOR)
-- Run first to confirm reconcile path works in SQL editor (~seconds).
-- =============================================================================

SET statement_timeout = '120s';

WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid AS customer_id
),
snap AS (
  SELECT outstanding_dr, advance_available, cn_available_total, cn_pending_count
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
  WHERE customer_id = (SELECT customer_id FROM params)
),
canon AS (
  SELECT
    (SELECT COALESCE(SUM(r.amount), 0)::numeric
     FROM public.reconcile_customer_balance(
       (SELECT customer_id FROM params),
       (SELECT org_id FROM params)
     ) r) AS outstanding_dr,
    public._customer_advance_available(
      (SELECT customer_id FROM params),
      (SELECT org_id FROM params)
    )::numeric AS advance_available,
    cn.cn_available_total,
    cn.cn_pending_count
  FROM public._customer_cn_available_total(
    (SELECT customer_id FROM params),
    (SELECT org_id FROM params)
  ) cn
)
SELECT
  c.customer_name,
  s.outstanding_dr AS snapshot_all_outstanding,
  c2.outstanding_dr AS reconcile_outstanding,
  ROUND(s.outstanding_dr - c2.outstanding_dr, 2) AS outstanding_drift,
  s.advance_available AS snapshot_advance,
  c2.advance_available AS reconcile_advance,
  ROUND(s.advance_available - c2.advance_available, 2) AS advance_drift
FROM canon c2
CROSS JOIN snap s
JOIN public.customers c ON c.id = (SELECT customer_id FROM params);
