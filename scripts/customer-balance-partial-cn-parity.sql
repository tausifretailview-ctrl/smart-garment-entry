-- Partial CN parity gate — prevents Farhaan Fab-style drift from recurring.
--
-- Run ONE block at a time in Supabase SQL editor.
-- Requires migrations through 20260823180000_fix_cn_receipt_double_count_v2_reconcile.sql.
--
-- SQL EDITOR AUTH (read first):
--   get_customer_true_outstanding → FAILS with 42501 Authentication required
--   (assert_org_member). Do NOT use it here.
--   reconcile_customer_balance(customer_id, org_id) → OK when auth.uid() IS NULL
--   (postgres / dashboard SQL editor). Canonical balance = SUM(amount) from that RPC.
--   get_customer_party_balances(org_id) → OK (same auth pattern).
--
-- Invariants this script guards:
--   1) partially_adjusted / adjusted remainder → pending_sale_returns uses CAB, not full net
--   2) credit_note_adjustment memo receipts excluded from receipt_payments (not double with SRA)
--   3) party signed_balance = SUM(reconcile_customer_balance) for partial-CN customers
--
-- Orgs (minimum coverage):
--   3fdca631-1e0c-4417-9704-421f5129ff67  ELLA NOOR (partial CN, CN memos)
--   697c451a-f863-4fe4-82f3-31859a9e5251  largest org smoke
--
-- Tip: SET statement_timeout = '120s'; before org-wide blocks on large tenants.


-- =============================================================================
-- DIAG) Auth context + required helpers
-- =============================================================================
SELECT
  current_user AS db_role,
  auth.uid() AS auth_uid,
  auth.role() AS auth_role,
  CASE
    WHEN auth.uid() IS NULL THEN 'Use reconcile_customer_balance SUM (this script)'
    ELSE 'Authenticated — reconcile_customer_balance also OK'
  END AS editor_hint,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_sale_return_remaining_credit_for_balance'
  ) AS remainder_helper_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_is_settlement_memo_receipt'
  ) AS memo_helper_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_get_customer_party_balances_rows_v2'
  ) AS party_v2_exists;


-- =============================================================================
-- 0) Canonical sign-off — Farhaan Fab (ELLA NOOR)
--     signed_balance and net_position must be -100 (Cr ₹100), not -2800.
-- =============================================================================
SELECT
  p.customer_name,
  p.signed_balance,
  p.net_position,
  canon.canonical_balance AS true_outstanding,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
WHERE p.customer_name ILIKE '%farhaan%fab%';


-- =============================================================================
-- 1) Per-customer reconcile breakdown — Farhaan Fab (must sum to -100)
-- =============================================================================
SELECT source, amount, detail
FROM public.reconcile_customer_balance(
  (SELECT id FROM public.customers
   WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
     AND customer_name ILIKE '%farhaan%fab%'
     AND deleted_at IS NULL
   LIMIT 1),
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
ORDER BY source;


-- =============================================================================
-- 2) Org-wide — partially_adjusted customers with remainder (party vs reconcile)
--     MUST return ZERO rows (|drift| > 0.01).
--     Uses LATERAL reconcile per partial-CN customer (small subset; SQL-editor safe).
-- =============================================================================
WITH partial_cn AS (
  SELECT DISTINCT sr.customer_id
  FROM public.sale_returns sr
  WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND sr.deleted_at IS NULL
    AND LOWER(TRIM(COALESCE(sr.credit_status, ''))) = 'partially_adjusted'
    AND COALESCE(sr.credit_available_balance, 0) > 0.01
    AND COALESCE(sr.refund_type, '') <> 'cash_refund'
),
party AS (
  SELECT p.customer_id, p.customer_name, p.signed_balance, p.net_position
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
  INNER JOIN partial_cn pc ON pc.customer_id = p.customer_id
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  p.net_position AS party_net,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
WHERE ABS(p.signed_balance - canon.canonical_balance) > 0.01
ORDER BY ABS(p.signed_balance - canon.canonical_balance) DESC;


-- =============================================================================
-- 3) CN memo double-count detector — customers with CN adjust receipts AND SRA > 0
--     MUST return ZERO rows after 20260823180000.
-- =============================================================================
WITH cn_customers AS (
  SELECT DISTINCT s.customer_id
  FROM public.voucher_entries ve
  JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
  WHERE ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND s.deleted_at IS NULL
    AND s.sale_return_adjust > 0.01
    AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
),
party AS (
  SELECT p.customer_id, p.customer_name, p.signed_balance
  FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) p
  INNER JOIN cn_customers cc ON cc.customer_id = p.customer_id
)
SELECT
  p.customer_name,
  p.signed_balance AS party_balance,
  canon.canonical_balance,
  ROUND(p.signed_balance - canon.canonical_balance, 2) AS drift,
  (
    SELECT COALESCE(SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)), 0)
    FROM public.voucher_entries ve
    JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
    WHERE s.customer_id = p.customer_id
      AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  ) AS cn_memo_total_at_risk
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) r
) canon
WHERE ABS(p.signed_balance - canon.canonical_balance) > 0.01
ORDER BY cn_memo_total_at_risk DESC;


-- =============================================================================
-- 4) Inventory — all partially_adjusted remainders in org (informational)
-- =============================================================================
SELECT
  c.customer_name,
  sr.return_number,
  sr.net_amount,
  sr.credit_available_balance AS remainder,
  sr.credit_status,
  sr.linked_sale_id,
  s.sale_number AS linked_invoice,
  s.sale_return_adjust AS invoice_sra
FROM public.sale_returns sr
JOIN public.customers c
  ON c.id = sr.customer_id
 AND c.organization_id = sr.organization_id
LEFT JOIN public.sales s
  ON s.id = sr.linked_sale_id
 AND s.organization_id = sr.organization_id
WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND LOWER(TRIM(COALESCE(sr.credit_status, ''))) = 'partially_adjusted'
  AND COALESCE(sr.credit_available_balance, 0) > 0.01
ORDER BY c.customer_name, sr.return_number;


-- =============================================================================
-- 5) Fast gate — party RPC vs v2 (PASS: drift_count = 0)
-- =============================================================================
SELECT COUNT(*) AS drift_count
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) live
INNER JOIN public._get_customer_party_balances_rows_v2('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) v2
  ON v2.out_customer_id = live.customer_id
WHERE ABS(live.signed_balance - v2.out_signed_balance) > 0.01
   OR ABS(COALESCE(live.advance_available, 0) - COALESCE(v2.out_advance_available, 0)) > 0.01;


-- =============================================================================
-- 5-detail) Top drift rows (only if drift_count > 0)
-- =============================================================================
SELECT
  live.customer_name,
  live.signed_balance AS live_signed,
  v2.out_signed_balance AS v2_signed,
  ROUND(live.signed_balance - v2.out_signed_balance, 2) AS signed_drift
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) live
INNER JOIN public._get_customer_party_balances_rows_v2('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) v2
  ON v2.out_customer_id = live.customer_id
WHERE ABS(live.signed_balance - v2.out_signed_balance) > 0.01
ORDER BY ABS(live.signed_balance - v2.out_signed_balance) DESC
LIMIT 50;


-- =============================================================================
-- 6) Largest org smoke — partial-CN subset vs reconcile (optional)
--     Org: 697c451a-f863-4fe4-82f3-31859a9e5251
--     PASS: drift_count = 0
-- =============================================================================
WITH partial_cn AS (
  SELECT DISTINCT sr.customer_id
  FROM public.sale_returns sr
  WHERE sr.organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251'::uuid
    AND sr.deleted_at IS NULL
    AND LOWER(TRIM(COALESCE(sr.credit_status, ''))) = 'partially_adjusted'
    AND COALESCE(sr.credit_available_balance, 0) > 0.01
),
party AS (
  SELECT p.customer_id, p.signed_balance
  FROM public.get_customer_party_balances('697c451a-f863-4fe4-82f3-31859a9e5251'::uuid) p
  INNER JOIN partial_cn pc ON pc.customer_id = p.customer_id
)
SELECT COUNT(*) AS drift_count
FROM party p
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount), 0)::numeric AS canonical_balance
  FROM public.reconcile_customer_balance(
    p.customer_id,
    '697c451a-f863-4fe4-82f3-31859a9e5251'::uuid
  ) r
) canon
WHERE ABS(p.signed_balance - canon.canonical_balance) > 0.01;
