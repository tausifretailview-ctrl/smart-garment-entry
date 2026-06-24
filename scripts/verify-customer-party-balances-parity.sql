-- Parity gate for get_customer_party_balances vs canonical reconcile_customer_balances.
-- Run in Supabase SQL editor AFTER applying migrations through
-- 20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql.
--
-- Org: ELLA NOOR 3fdca631-1e0c-4417-9704-421f5129ff67

-- =============================================================================
-- 0a) Six-customer sign-off — drift must be 0
--     SHEHNAZ HALAI, Fariba Qureshi, Sana Nasir, Shumama Baireli, Samiya Nursumar, ALOK
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE customer_id = 'a7b7e39c-fde8-4df5-8ac5-cb312460234e'::uuid
     OR customer_name = 'Fariba Qureshi'
     OR customer_name ILIKE '%sana%nasir%'
     OR customer_name ILIKE '%shumama%baireli%'
     OR customer_name ILIKE '%samiya%nursumar%'
     OR customer_name ILIKE '%alok%kumar%tazim%'
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid), 2) AS drift,
  p.advance_available AS party_advance,
  public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance
FROM party p
ORDER BY p.customer_name;


-- =============================================================================
-- 0) Three-customer sign-off (ELLA NOOR): Samiya, ALOK, SHEHNAZ HALAI — drift must be 0
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE customer_name ILIKE '%samiya%'
     OR customer_name ILIKE '%alok%kumar%tazim%'
     OR customer_id = 'a7b7e39c-fde8-4df5-8ac5-cb312460234e'::uuid
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid), 2) AS drift,
  p.advance_available AS party_advance,
  public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance
FROM party p
ORDER BY p.customer_name;


-- =============================================================================
-- 1) Full org drift vs get_customer_true_outstanding (canonical per-customer gate)
--    Must return ZERO rows (|drift| > 0.01)
-- =============================================================================
WITH party AS (
  SELECT customer_id, signed_balance, advance_available, total_dr, total_cr, net_receivable
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
),
canonical AS (
  SELECT
    c.id AS customer_id,
    public.get_customer_true_outstanding(c.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)::numeric AS calculated_balance,
    public._customer_advance_available(c.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)::numeric AS canon_advance
  FROM public.customers c
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
)
SELECT
  COALESCE(p.customer_id, c.customer_id) AS customer_id,
  cu.customer_name,
  p.signed_balance AS party_balance,
  c.calculated_balance AS canonical_balance,
  ROUND(COALESCE(p.signed_balance, 0) - COALESCE(c.calculated_balance, 0), 2) AS drift,
  p.advance_available AS party_advance,
  c.canon_advance AS canonical_advance,
  ROUND(COALESCE(p.advance_available, 0) - COALESCE(c.canon_advance, 0), 2) AS advance_drift
FROM party p
FULL OUTER JOIN canonical c ON c.customer_id = p.customer_id
LEFT JOIN public.customers cu ON cu.id = COALESCE(p.customer_id, c.customer_id)
WHERE ABS(COALESCE(p.signed_balance, 0) - COALESCE(c.calculated_balance, 0)) > 0.01
   OR ABS(COALESCE(p.advance_available, 0) - COALESCE(c.canon_advance, 0)) > 0.01
ORDER BY ABS(COALESCE(p.signed_balance, 0) - COALESCE(c.calculated_balance, 0)) DESC;


-- =============================================================================
-- 1b) Subset check: party vs reconcile_customer_balances rows (org list RPC)
-- =============================================================================
WITH party AS (
  SELECT customer_id, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
),
reconcile AS (
  SELECT customer_id, calculated_balance, advance_available AS reconcile_advance
  FROM public.reconcile_customer_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  r.customer_id,
  cu.customer_name,
  r.calculated_balance,
  p.signed_balance,
  ROUND(r.calculated_balance - p.signed_balance, 2) AS drift
FROM reconcile r
JOIN party p ON p.customer_id = r.customer_id
JOIN public.customers cu ON cu.id = r.customer_id
WHERE ABS(r.calculated_balance - p.signed_balance) > 0.01
   OR ABS(COALESCE(r.reconcile_advance, 0) - COALESCE(p.advance_available, 0)) > 0.01;


-- =============================================================================
-- 2) Customers in reconcile but missing from party list (should be none — party returns ALL customers)
-- =============================================================================
SELECT c.id, c.customer_name
FROM public.customers c
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
    WHERE p.customer_id = c.id
  );


-- =============================================================================
-- 3) Grand totals vs get_organization_receivables_summary
-- =============================================================================
WITH party AS (
  SELECT total_dr, total_cr, net_receivable
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  LIMIT 1
),
summary AS (
  SELECT gross_receivable_dr, customer_credit_pool_cr, net_receivable
  FROM public.get_organization_receivables_summary('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
)
SELECT
  p.total_dr AS party_total_dr,
  s.gross_receivable_dr AS summary_total_dr,
  ROUND(p.total_dr - s.gross_receivable_dr, 2) AS dr_drift,
  p.total_cr AS party_total_cr,
  s.customer_credit_pool_cr AS summary_total_cr,
  ROUND(p.total_cr - s.customer_credit_pool_cr, 2) AS cr_drift,
  p.net_receivable AS party_net,
  s.net_receivable AS summary_net,
  ROUND(p.net_receivable - s.net_receivable, 2) AS net_drift
FROM party p
CROSS JOIN summary s;


-- =============================================================================
-- 4) Sample 5+ customers for manual sign-off (advance / credit / CN / debtor / settled)
--    Edit the IN list or use the auto-pick query below.
-- =============================================================================
WITH picks AS (
  SELECT customer_id, calculated_balance, advance_available, notes
  FROM public.reconcile_customer_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  ORDER BY
    CASE
      WHEN advance_available > 0.01 THEN 0
      WHEN calculated_balance < -0.5 THEN 1
      WHEN calculated_balance > 100000 THEN 2
      WHEN ABS(calculated_balance) <= 0.5 THEN 3
      ELSE 4
    END,
    ABS(calculated_balance) DESC
  LIMIT 8
)
SELECT
  pk.customer_id,
  cu.customer_name,
  pk.calculated_balance AS canonical_balance,
  pb.signed_balance AS party_balance,
  ROUND(pk.calculated_balance - pb.signed_balance, 2) AS drift,
  pk.advance_available AS canonical_advance,
  pb.advance_available AS party_advance,
  pb.direction,
  pb.net_position,
  pk.notes AS reconcile_notes
FROM picks pk
JOIN public.customers cu ON cu.id = pk.customer_id
JOIN public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) pb ON pb.customer_id = pk.customer_id
ORDER BY ABS(pk.calculated_balance) DESC;


-- =============================================================================
-- 5) Performance smoke — should complete without statement_timeout on large orgs
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*), SUM(signed_balance)
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid);


-- =============================================================================
-- 6) KS FOOTWEAR POS org — VAVIA + JOHNSON + full-org drift gate
--    Org: 4bc73037-e877-4123-9261-eb6e3876698c
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance
  FROM public.get_customer_party_balances('4bc73037-e877-4123-9261-eb6e3876698c'::uuid)
  WHERE customer_id IN (
    'a5727aac-8f3a-41c9-a8a5-f4af37ba160f'::uuid,
    '970cffc5-4d1e-4ac0-bf4a-70d4188f5690'::uuid
  )
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid), 2) AS drift
FROM party p
ORDER BY p.customer_name;


-- KS FOOTWEAR full org — must return ZERO rows (|drift| > 0.01)
WITH party AS (
  SELECT customer_id, signed_balance
  FROM public.get_customer_party_balances('4bc73037-e877-4123-9261-eb6e3876698c'::uuid)
),
canonical AS (
  SELECT
    c.id AS customer_id,
    public.get_customer_true_outstanding(c.id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid)::numeric AS calculated_balance
  FROM public.customers c
  WHERE c.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
    AND c.deleted_at IS NULL
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  c.calculated_balance AS canonical_balance,
  ROUND(COALESCE(p.signed_balance, 0) - COALESCE(c.calculated_balance, 0), 2) AS drift
FROM party p
FULL OUTER JOIN canonical c ON c.customer_id = p.customer_id
LEFT JOIN public.customers cu ON cu.id = COALESCE(p.customer_id, c.customer_id)
WHERE ABS(COALESCE(p.signed_balance, 0) - COALESCE(c.calculated_balance, 0)) > 0.01
ORDER BY ABS(COALESCE(p.signed_balance, 0) - COALESCE(c.calculated_balance, 0)) DESC;
