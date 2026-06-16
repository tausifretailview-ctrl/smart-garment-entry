-- Post-migration validation: advance double-count fix (20260817120000)
-- Run in Supabase SQL editor after applying migration.
-- Shumama: customer 224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9, org 3fdca631-1e0c-4417-9704-421f5129ff67

-- 1) Shumama: breakdown — receipt_payments should NOT include advance-application vouchers (~-440k gone)
SELECT source, amount, detail
FROM public.reconcile_customer_balance(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
ORDER BY source;

-- 2) Shumama: net outstanding (negative = customer in credit / Cr)
SELECT public.get_customer_true_outstanding(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
) AS true_outstanding;

-- 3) Shumama: snapshot must match reconcile sum
SELECT
  s.outstanding_dr,
  (SELECT COALESCE(SUM(r.amount), 0) FROM public.reconcile_customer_balance(
    '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r) AS reconcile_sum,
  s.outstanding_dr - (SELECT COALESCE(SUM(r.amount), 0) FROM public.reconcile_customer_balance(
    '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r) AS drift
FROM public.get_customer_financial_snapshot(
  '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
) s;

-- 4) Regression: all customers in org — snapshot.outstanding_dr must equal reconcile sum (drift < 0.01)
WITH org_id AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
customers AS (
  SELECT c.id AS customer_id
  FROM public.customers c, org_id o
  WHERE c.organization_id = o.id
    AND c.deleted_at IS NULL
),
checks AS (
  SELECT
    c.customer_id,
    cust.customer_name,
    snap.outstanding_dr,
    rec.reconcile_sum,
    ABS(snap.outstanding_dr - rec.reconcile_sum) AS drift
  FROM customers c
  INNER JOIN public.customers cust ON cust.id = c.customer_id
  CROSS JOIN LATERAL (
    SELECT s.outstanding_dr
    FROM public.get_customer_financial_snapshot(c.customer_id, (SELECT id FROM org_id)) s
  ) snap
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount), 0) AS reconcile_sum
    FROM public.reconcile_customer_balance(c.customer_id, (SELECT id FROM org_id)) r
  ) rec
)
SELECT *
FROM checks
WHERE drift > 0.01
ORDER BY drift DESC;

-- 5) Sample 5 customers (mix with/without advances) — manual eyeball
SELECT customer_name, outstanding_dr, reconcile_sum, drift
FROM (
  SELECT
    cust.customer_name,
    snap.outstanding_dr,
    rec.reconcile_sum,
    ABS(snap.outstanding_dr - rec.reconcile_sum) AS drift
  FROM public.customers cust
  CROSS JOIN LATERAL (
    SELECT s.outstanding_dr
    FROM public.get_customer_financial_snapshot(cust.id, cust.organization_id) s
  ) snap
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount), 0) AS reconcile_sum
    FROM public.reconcile_customer_balance(cust.id, cust.organization_id) r
  ) rec
  WHERE cust.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND cust.deleted_at IS NULL
  ORDER BY random()
  LIMIT 5
) sample;
