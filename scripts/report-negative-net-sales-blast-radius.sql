-- =============================================================================
-- PHASE 2 — Blast radius: sales with net_amount < 0 (READ-ONLY)
-- =============================================================================
-- Run in Supabase SQL editor (postgres / service role). No mutations.
-- Groups by organization: count + total negative value.
-- =============================================================================

-- (1) Per-org summary
SELECT
  'NEGATIVE_NET_BY_ORG'::text AS section,
  s.organization_id,
  COALESCE(o.name, s.organization_id::text) AS org_name,
  COUNT(*)::int AS negative_net_count,
  ROUND(SUM(s.net_amount), 2) AS total_negative_net,
  ROUND(SUM(ABS(s.net_amount)), 2) AS total_abs_negative_net,
  ROUND(SUM(COALESCE(s.sale_return_adjust, 0)), 2) AS total_sr_adjust_on_those_bills,
  ROUND(SUM(COALESCE(s.gross_amount, 0)), 2) AS total_gross_on_those_bills,
  MIN((timezone('Asia/Kolkata', s.sale_date))::date) AS earliest_sale_day_ist,
  MAX((timezone('Asia/Kolkata', s.sale_date))::date) AS latest_sale_day_ist
FROM public.sales s
LEFT JOIN public.organizations o ON o.id = s.organization_id
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.net_amount, 0) < 0
GROUP BY s.organization_id, o.name
ORDER BY total_abs_negative_net DESC;


-- (2) Grand total across all orgs
SELECT
  'NEGATIVE_NET_GRAND_TOTAL'::text AS section,
  COUNT(*)::int AS negative_net_count,
  ROUND(SUM(s.net_amount), 2) AS total_negative_net,
  ROUND(SUM(ABS(s.net_amount)), 2) AS total_abs_negative_net,
  COUNT(DISTINCT s.organization_id)::int AS org_count
FROM public.sales s
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.net_amount, 0) < 0;


-- (3) Sample detail (top 50 by most negative) — for repair review
SELECT
  'NEGATIVE_NET_SAMPLE'::text AS section,
  s.organization_id,
  COALESCE(o.name, '') AS org_name,
  s.id AS sale_id,
  s.sale_number,
  s.sale_type,
  (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day_ist,
  s.customer_id,
  s.customer_name,
  s.gross_amount,
  s.discount_amount,
  s.flat_discount_amount,
  s.sale_return_adjust,
  s.net_amount,
  s.paid_amount,
  s.cash_amount,
  s.card_amount,
  s.upi_amount,
  s.refund_amount,
  s.payment_method,
  s.payment_status,
  -- Suggested Phase-3 cap: apply at most gross (or bill-before-sr); excess = sr - max(0, gross)
  ROUND(
    GREATEST(0, COALESCE(s.sale_return_adjust, 0) - GREATEST(0, COALESCE(s.gross_amount, 0))),
    2
  ) AS suggested_excess_credit_to_restore
FROM public.sales s
LEFT JOIN public.organizations o ON o.id = s.organization_id
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.net_amount, 0) < 0
ORDER BY s.net_amount ASC
LIMIT 50;
