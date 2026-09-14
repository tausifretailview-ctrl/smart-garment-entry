-- =============================================================================
-- Verify items_gross scoping for get_invoice_dashboard_stats (ELLA NOOR)
-- =============================================================================
-- Org hard-coded. Run in Supabase SQL Editor.
--
-- Sections:
--   0) Session mint (required for RPC EXPLAIN / calls)
--   1) BEFORE apply — EXPLAIN + KPI JSON (save output)
--   2) Identity proof — scoped vs unscoped outstanding SUM (works BEFORE or AFTER)
--   3) AFTER apply — EXPLAIN + KPI JSON (must match §1 JSON; EXPLAIN should drop
--      sale_items work for sales with sale_return_adjust = 0)
--
-- Activity Center uses the same RPC with a broader/default filter set; §2 proves
-- outstanding identity independent of UI caller.
-- =============================================================================

-- 0a) Confirm org
SELECT id, name FROM public.organizations
WHERE id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid;

-- 0b) Volume in a typical 7-day window
SELECT
  count(*) AS invoice_count,
  count(*) FILTER (WHERE COALESCE(sale_return_adjust, 0) > 0) AS with_sra,
  count(*) FILTER (WHERE COALESCE(sale_return_adjust, 0) <= 0) AS without_sra
FROM public.sales
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sale_type = 'invoice'
  AND deleted_at IS NULL
  AND sale_date >= now() - interval '7 days'
  AND sale_date <= now();

-- 0c) Impersonate org member (run once per editor session before RPC calls)
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (
      SELECT om.user_id::text
      FROM public.organization_members om
      WHERE om.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      ORDER BY om.created_at
      LIMIT 1
    ),
    'role', 'authenticated'
  )::text,
  true
) AS jwt_claims_set;

SELECT auth.uid() AS impersonated_uid;

-- ---------------------------------------------------------------------------
-- 1) BEFORE (or AFTER) — wall-clock EXPLAIN of live RPC
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT public.get_invoice_dashboard_stats(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  now() - interval '7 days',
  now(),
  '{}'::jsonb,
  NULL,
  NULL
);

SELECT public.get_invoice_dashboard_stats(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  now() - interval '7 days',
  now(),
  '{}'::jsonb,
  NULL,
  NULL
) AS kpi_json;

-- ---------------------------------------------------------------------------
-- 2) Identity proof: scoped vs unscoped items_gross → same outstanding sum
--    Does not depend on the live function body (safe before/after migration).
-- ---------------------------------------------------------------------------
WITH filtered_sales AS (
  SELECT
    s.id,
    s.net_amount,
    s.sale_return_adjust,
    s.paid_amount
  FROM public.sales s
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND s.sale_type = 'invoice'
    AND s.deleted_at IS NULL
    AND s.sale_date >= now() - interval '7 days'
    AND s.sale_date <= now()
    AND COALESCE(s.is_cancelled, false) IS NOT TRUE
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
),
items_gross_unscoped AS (
  SELECT
    si.sale_id,
    SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS items_gross
  FROM public.sale_items si
  INNER JOIN filtered_sales fs ON fs.id = si.sale_id
  WHERE si.deleted_at IS NULL
  GROUP BY si.sale_id
),
items_gross_scoped AS (
  SELECT
    si.sale_id,
    SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS items_gross
  FROM public.sale_items si
  INNER JOIN filtered_sales fs ON fs.id = si.sale_id
  WHERE si.deleted_at IS NULL
    AND COALESCE(fs.sale_return_adjust, 0) > 0
  GROUP BY si.sale_id
),
compared AS (
  SELECT
    fs.id,
    public.invoice_reconcile_outstanding(
      COALESCE(fs.net_amount, 0),
      COALESCE(fs.sale_return_adjust, 0),
      COALESCE(fs.paid_amount, 0),
      0, 0, 0, 0,
      igu.items_gross
    ) AS outstanding_unscoped,
    public.invoice_reconcile_outstanding(
      COALESCE(fs.net_amount, 0),
      COALESCE(fs.sale_return_adjust, 0),
      COALESCE(fs.paid_amount, 0),
      0, 0, 0, 0,
      igs.items_gross
    ) AS outstanding_scoped
  FROM filtered_sales fs
  LEFT JOIN items_gross_unscoped igu ON igu.sale_id = fs.id
  LEFT JOIN items_gross_scoped igs ON igs.sale_id = fs.id
)
SELECT
  count(*) AS rows_compared,
  count(*) FILTER (WHERE outstanding_unscoped IS DISTINCT FROM outstanding_scoped) AS mismatches,
  COALESCE(SUM(outstanding_unscoped), 0) AS pending_unscoped,
  COALESCE(SUM(outstanding_scoped), 0) AS pending_scoped,
  (SELECT count(*) FROM items_gross_unscoped) AS unscoped_sale_item_groups,
  (SELECT count(*) FROM items_gross_scoped) AS scoped_sale_item_groups
FROM compared;
-- Expect mismatches = 0 and pending_unscoped = pending_scoped.
-- scoped_sale_item_groups should be << unscoped_sale_item_groups on busy orgs.

-- ---------------------------------------------------------------------------
-- 3) AFTER apply — re-run §1 EXPLAIN + kpi_json; JSON must match pre-apply.
-- ---------------------------------------------------------------------------
