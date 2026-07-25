-- =============================================================================
-- PHASE 2 — Blast radius: sales with net_amount < 0 (READ-ONLY)
-- =============================================================================
-- Run in Supabase SQL editor (postgres / service role). No mutations.
-- Groups by organization: count + total negative value.
--
-- suggested_excess_credit_to_restore =
--   sale_return_adjust − GREATEST(0, gross − discount_amount − flat_discount_amount)
-- (max S/R that can apply after line+flat disc; before round/points)
-- =============================================================================

-- Shared expression for suggested excess (kept in sync across sections)
-- GREATEST(0, COALESCE(sale_return_adjust,0)
--   - GREATEST(0, COALESCE(gross_amount,0)
--       - COALESCE(discount_amount,0)
--       - COALESCE(flat_discount_amount,0)))


-- (1) Per-org summary (+ corrected excess rollup)
SELECT
  'NEGATIVE_NET_BY_ORG'::text AS section,
  s.organization_id,
  COALESCE(o.name, s.organization_id::text) AS org_name,
  COUNT(*)::int AS negative_net_count,
  ROUND(SUM(s.net_amount), 2) AS total_negative_net,
  ROUND(SUM(ABS(s.net_amount)), 2) AS total_abs_negative_net,
  ROUND(SUM(COALESCE(s.sale_return_adjust, 0)), 2) AS total_sr_adjust_on_those_bills,
  ROUND(SUM(COALESCE(s.gross_amount, 0)), 2) AS total_gross_on_those_bills,
  ROUND(SUM(COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0)), 2)
    AS total_line_plus_flat_discount,
  ROUND(
    SUM(
      GREATEST(
        0,
        COALESCE(s.sale_return_adjust, 0)
          - GREATEST(
              0,
              COALESCE(s.gross_amount, 0)
                - COALESCE(s.discount_amount, 0)
                - COALESCE(s.flat_discount_amount, 0)
            )
      )
    ),
    2
  ) AS total_suggested_excess_credit_to_restore,
  ROUND(SUM(COALESCE(s.refund_amount, 0)), 2) AS total_refund_amount_on_those_bills,
  COUNT(*) FILTER (WHERE COALESCE(s.refund_amount, 0) > 0)::int AS rows_with_refund_amount,
  MIN((timezone('Asia/Kolkata', s.sale_date))::date) AS earliest_sale_day_ist,
  MAX((timezone('Asia/Kolkata', s.sale_date))::date) AS latest_sale_day_ist
FROM public.sales s
LEFT JOIN public.organizations o ON o.id = s.organization_id
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.net_amount, 0) < 0
GROUP BY s.organization_id, o.name
ORDER BY total_abs_negative_net DESC;


-- (2) Grand total across all orgs (+ corrected excess)
SELECT
  'NEGATIVE_NET_GRAND_TOTAL'::text AS section,
  COUNT(*)::int AS negative_net_count,
  ROUND(SUM(s.net_amount), 2) AS total_negative_net,
  ROUND(SUM(ABS(s.net_amount)), 2) AS total_abs_negative_net,
  COUNT(DISTINCT s.organization_id)::int AS org_count,
  ROUND(
    SUM(
      GREATEST(
        0,
        COALESCE(s.sale_return_adjust, 0)
          - GREATEST(
              0,
              COALESCE(s.gross_amount, 0)
                - COALESCE(s.discount_amount, 0)
                - COALESCE(s.flat_discount_amount, 0)
            )
      )
    ),
    2
  ) AS total_suggested_excess_credit_to_restore,
  ROUND(SUM(COALESCE(s.refund_amount, 0)), 2) AS total_refund_amount_on_those_bills,
  COUNT(*) FILTER (WHERE COALESCE(s.refund_amount, 0) > 0)::int AS rows_with_refund_amount
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
  ROUND(
    GREATEST(
      0,
      COALESCE(s.gross_amount, 0)
        - COALESCE(s.discount_amount, 0)
        - COALESCE(s.flat_discount_amount, 0)
    ),
    2
  ) AS max_sr_after_discounts,
  ROUND(
    GREATEST(
      0,
      COALESCE(s.sale_return_adjust, 0)
        - GREATEST(
            0,
            COALESCE(s.gross_amount, 0)
              - COALESCE(s.discount_amount, 0)
              - COALESCE(s.flat_discount_amount, 0)
          )
    ),
    2
  ) AS suggested_excess_credit_to_restore
FROM public.sales s
LEFT JOIN public.organizations o ON o.id = s.organization_id
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.net_amount, 0) < 0
ORDER BY s.net_amount ASC
LIMIT 50;
