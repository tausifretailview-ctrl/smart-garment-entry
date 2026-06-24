-- Parity gate for get_customer_party_balances vs canonical reconcile_customer_balance.
-- Run in Supabase SQL editor AFTER applying migrations through
-- 20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql.
--
-- IMPORTANT: Select and run ONE block at a time (do not Run entire file).
-- Heavy gates: run `SET statement_timeout = '120s';` first if you hit timeout.
--
-- Orgs:
--   ELLA NOOR (invoice) 3fdca631-1e0c-4417-9704-421f5129ff67
--   KS FOOTWEAR (POS)    4bc73037-e877-4123-9261-eb6e3876698c
--   Velvet (POS)         dafc3d0c-874e-4784-bac3-5eab5f3c85b5


-- =============================================================================
-- DIAG) Migration 20260911150000 applied? (paid_at_sale_drift per-sale subquery)
--     migration_applied should be TRUE before POS parity gates pass.
-- =============================================================================
SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%sub.customer_id AS cust_id%' AS migration_111500_applied,
  pg_get_functiondef(p.oid) LIKE '%sale_voucher_receipts%' AS still_has_old_sale_voucher_cte
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = '_get_customer_party_balances_rows';


-- =============================================================================
-- DIAG) Smoke — party RPC compiles and returns rows (pick org below)
-- =============================================================================
SELECT COUNT(*) AS party_row_count
FROM public.get_customer_party_balances('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid);


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
-- 1) ELLA NOOR — non-settled drift gate (fast; avoids per-customer loop on all parties)
--    Must return ZERO rows (|drift| > 0.01)
--    Tip: SET statement_timeout = '120s'; if this still times out on very large orgs.
-- =============================================================================
WITH party AS (
  SELECT customer_id, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01
     OR COALESCE(advance_available, 0) > 0.01
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid), 2) AS drift,
  p.advance_available AS party_advance,
  public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) AS canonical_advance,
  ROUND(
    COALESCE(p.advance_available, 0)
    - public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid),
    2
  ) AS advance_drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
WHERE ABS(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)) > 0.01
   OR ABS(
     COALESCE(p.advance_available, 0)
     - public._customer_advance_available(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
   ) > 0.01
ORDER BY ABS(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)) DESC;


-- =============================================================================
-- 1b) ELLA NOOR — party vs reconcile_customer_balances (non-settled only)
--     reconcile_customer_balances times out on full org in SQL editor; filter first.
-- =============================================================================
WITH party AS (
  SELECT customer_id, signed_balance, advance_available
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE ABS(signed_balance) > 0.01
     OR COALESCE(advance_available, 0) > 0.01
),
reconcile AS (
  SELECT r.customer_id, r.calculated_balance, r.advance_available AS reconcile_advance
  FROM public.reconcile_customer_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) r
  INNER JOIN party p ON p.customer_id = r.customer_id
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
-- 4) Sample customers for manual sign-off (advance / credit / CN / debtor / settled)
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
-- 5) Performance smoke — party RPC only (safe; reconcile full-org may timeout)
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*), SUM(signed_balance)
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid);


-- =============================================================================
-- 6) KS FOOTWEAR POS org — VAVIA + JOHNSON spot check (drift must be 0 after 111500)
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


-- KS FOOTWEAR — non-settled drift gate (must return ZERO rows)
WITH party AS (
  SELECT customer_id, signed_balance
  FROM public.get_customer_party_balances('4bc73037-e877-4123-9261-eb6e3876698c'::uuid)
  WHERE ABS(signed_balance) > 0.01
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid), 2) AS drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
WHERE ABS(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid)) > 0.01
ORDER BY ABS(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, '4bc73037-e877-4123-9261-eb6e3876698c'::uuid)) DESC;


-- =============================================================================
-- 7) Velvet POS org — RUSHITA + KALPANA + BEENA spot check (drift must be 0 after 111500)
--    Org: dafc3d0c-874e-4784-bac3-5eab5f3c85b5
-- =============================================================================
WITH party AS (
  SELECT customer_id, customer_name, signed_balance
  FROM public.get_customer_party_balances('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
  WHERE customer_name ILIKE '%rushita%sanghvi%'
     OR customer_name = 'KALPANA'
     OR customer_name ILIKE '%beena%shah%'
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid), 2) AS drift
FROM party p
ORDER BY p.customer_name;


-- Velvet — non-settled drift gate (must return ZERO rows; ~34 parties, not all 185)
WITH party AS (
  SELECT customer_id, signed_balance
  FROM public.get_customer_party_balances('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)
  WHERE ABS(signed_balance) > 0.01
)
SELECT
  cu.customer_name,
  p.signed_balance AS party_balance,
  public.get_customer_true_outstanding(p.customer_id, 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid) AS canonical_balance,
  ROUND(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid), 2) AS drift
FROM party p
JOIN public.customers cu ON cu.id = p.customer_id
WHERE ABS(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)) > 0.01
ORDER BY ABS(p.signed_balance - public.get_customer_true_outstanding(p.customer_id, 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid)) DESC;
