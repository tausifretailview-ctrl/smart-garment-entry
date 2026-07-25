-- =============================================================================
-- PREFLIGHT (run BEFORE applying fix_v_dashboard_sales_summary migration)
-- Multi-org: plain SUM(net_amount) vs v_dashboard_sales_summary.total_sales
-- =============================================================================
-- Run in Supabase SQL editor as postgres / service role (no auth RPC).
-- Expected BEFORE fix: difference_plain_minus_view > 0 for orgs with
-- same-day duplicate net_amount bills (sum(DISTINCT …) undercount).
-- Expected AFTER fix:  all differences = 0.
--
-- Date window editable below. Orgs = known samples + top active orgs by volume.
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-07-01' AS start_date,
    DATE '2026-07-24' AS end_date
),
known_orgs AS (
  SELECT * FROM (VALUES
    ('184c86d6-bd6f-4441-815f-07984697d884'::uuid, 'reported-bug-org'),
    ('dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid, 'Velvet'),
    ('4bc73037-e877-4123-9261-eb6e3876698c'::uuid, 'KS FOOTWEAR'),
    ('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid, 'ELLA NOOR')
  ) AS t(org_id, org_label)
),
-- Also pull a few high-volume orgs in the window (may overlap known list)
top_orgs AS (
  SELECT
    s.organization_id AS org_id,
    COALESCE(o.name, s.organization_id::text) AS org_label
  FROM public.sales s
  LEFT JOIN public.organizations o ON o.id = s.organization_id
  CROSS JOIN params p
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
  GROUP BY s.organization_id, o.name
  ORDER BY COUNT(*) DESC
  LIMIT 8
),
orgs AS (
  SELECT org_id, org_label FROM known_orgs
  UNION
  SELECT org_id, org_label FROM top_orgs
),
plain AS (
  SELECT
    s.organization_id,
    ROUND(COALESCE(SUM(s.net_amount), 0), 2) AS plain_sum,
    COUNT(*)::int AS invoice_count
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
    AND s.organization_id IN (SELECT org_id FROM orgs)
  GROUP BY s.organization_id
),
via_view AS (
  SELECT
    v.organization_id,
    ROUND(COALESCE(SUM(v.total_sales), 0), 2) AS view_sum,
    COALESCE(SUM(v.invoice_count), 0)::int AS view_invoice_count
  FROM public.v_dashboard_sales_summary v
  CROSS JOIN params p
  WHERE v.sale_day BETWEEN p.start_date AND p.end_date
    AND v.organization_id IN (SELECT org_id FROM orgs)
  GROUP BY v.organization_id
),
dup_loss AS (
  -- Amount that sum(DISTINCT net_amount) would drop (diagnostic only)
  SELECT
    organization_id,
    ROUND(COALESCE(SUM(lost), 0), 2) AS estimated_distinct_loss
  FROM (
    SELECT
      s.organization_id,
      (COUNT(*) - 1) * COALESCE(s.net_amount, 0) AS lost
    FROM public.sales s
    CROSS JOIN params p
    WHERE s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND (timezone('Asia/Kolkata', s.sale_date))::date BETWEEN p.start_date AND p.end_date
      AND s.organization_id IN (SELECT org_id FROM orgs)
    GROUP BY s.organization_id,
             (timezone('Asia/Kolkata', s.sale_date))::date,
             s.net_amount
    HAVING COUNT(*) > 1
  ) x
  GROUP BY organization_id
)
SELECT
  'PREFLIGHT_view_vs_plain'::text AS section,
  o.org_label,
  o.org_id,
  (SELECT start_date FROM params) AS start_date,
  (SELECT end_date FROM params) AS end_date,
  COALESCE(pl.invoice_count, 0) AS invoice_count,
  COALESCE(pl.plain_sum, 0) AS plain_sum_net_amount,
  COALESCE(vv.view_sum, 0) AS view_sum_total_sales,
  ROUND(COALESCE(pl.plain_sum, 0) - COALESCE(vv.view_sum, 0), 2) AS difference_plain_minus_view,
  COALESCE(d.estimated_distinct_loss, 0) AS estimated_distinct_loss,
  CASE
    WHEN ROUND(COALESCE(pl.plain_sum, 0) - COALESCE(vv.view_sum, 0), 2) = 0
      THEN 'OK'
    ELSE 'GAP — view undercounts'
  END AS status
FROM orgs o
LEFT JOIN plain pl ON pl.organization_id = o.org_id
LEFT JOIN via_view vv ON vv.organization_id = o.org_id
LEFT JOIN dup_loss d ON d.organization_id = o.org_id
ORDER BY ABS(ROUND(COALESCE(pl.plain_sum, 0) - COALESCE(vv.view_sum, 0), 2)) DESC,
         o.org_label;
