-- POS dashboard totals honor p_filters.salesmanFilter (sales.salesman names).
-- Empty or missing list = every salesman.
-- salesmanFilterApplied marks this build so the app can tell it apart from
-- older builds that ignore unknown JSON and count every salesman.
--
-- Written as one SQL statement with no semicolon inside the function body.
-- The Supabase SQL editor splits on semicolons and otherwise cuts the script
-- at the first line, which leaves $$ unclosed (error 42601).

CREATE OR REPLACE FUNCTION public.get_pos_dashboard_stats(
  p_organization_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
SELECT COALESCE((
  WITH params AS (
    SELECT
      NULLIF(trim(p_search), '') AS v_search,
      COALESCE(NULLIF(trim(p_filters->>'cancelFilter'), ''), 'active') AS v_cancel,
      COALESCE(NULLIF(trim(p_filters->>'paymentMethodFilter'), ''), 'all') AS v_payment_method,
      COALESCE(NULLIF(trim(p_filters->>'saleTypeFilter'), ''), 'all') AS v_sale_type,
      COALESCE(NULLIF(trim(p_filters->>'refundFilter'), ''), 'all') AS v_refund,
      COALESCE(NULLIF(trim(p_filters->>'creditNoteFilter'), ''), 'all') AS v_credit_note,
      COALESCE(NULLIF(trim(p_filters->>'userFilter'), ''), 'all') AS v_user,
      CASE
        WHEN jsonb_typeof(p_filters->'salesmanFilter') = 'array' THEN p_filters->'salesmanFilter'
        ELSE '[]'::jsonb
      END AS v_salesmen,
      COALESCE(p_filters->'paymentStatusFilter', '[]'::jsonb) AS v_payment_status,
      (NULLIF(trim(p_search), '') IS NOT NULL) AS v_bypass_dates
  ),
  guard AS MATERIALIZED (
    SELECT public.assert_org_member(p_organization_id) AS checked
  ),
  filtered_sales AS (
    SELECT
      s.id,
      s.gross_amount,
      s.discount_amount,
      s.flat_discount_amount,
      s.points_redeemed_amount,
      s.net_amount,
      s.paid_amount,
      s.payment_status,
      s.payment_method,
      s.sale_number,
      s.cash_amount,
      s.card_amount,
      s.upi_amount,
      s.refund_amount,
      s.credit_note_id,
      s.credit_note_amount,
      s.sale_return_adjust,
      s.round_off,
      s.total_qty,
      s.is_cancelled
    FROM public.sales s
    CROSS JOIN params p
    CROSS JOIN guard g
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND (
        p.v_sale_type = 'dc' AND s.sale_type = 'delivery_challan'
        OR p.v_sale_type = 'pos' AND s.sale_type = 'pos'
        OR p.v_sale_type NOT IN ('dc', 'pos')
          AND s.sale_type IN ('pos', 'delivery_challan')
      )
      AND (
        NOT p.v_bypass_dates
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        OR p.v_bypass_dates
      )
      AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND (
        p.v_search IS NULL
        OR s.sale_number ILIKE '%' || p.v_search || '%'
        OR s.customer_name ILIKE '%' || p.v_search || '%'
        OR s.customer_phone ILIKE '%' || p.v_search || '%'
        OR (
          p.v_search ~ '^\d{1,6}$'
          AND s.sale_number ILIKE '%/' || p.v_search
        )
      )
      AND (
        p.v_cancel = 'all'
        OR (p.v_cancel = 'cancelled' AND s.is_cancelled = true)
        OR (p.v_cancel = 'active' AND (s.is_cancelled IS NULL OR s.is_cancelled = false))
      )
      AND (p.v_user = 'all' OR p.v_user = '__pending__' OR s.created_by::text = p.v_user)
      AND (
        NOT (jsonb_typeof(p.v_salesmen) = 'array' AND jsonb_array_length(p.v_salesmen) > 0)
        OR s.salesman = ANY (SELECT jsonb_array_elements_text(p.v_salesmen))
      )
      AND (p.v_payment_method = 'all' OR s.payment_method = p.v_payment_method)
      AND (
        NOT (jsonb_typeof(p.v_payment_status) = 'array' AND jsonb_array_length(p.v_payment_status) > 0)
        OR s.payment_status = ANY (SELECT jsonb_array_elements_text(p.v_payment_status))
      )
      AND (
        p.v_sale_type <> 'cn'
        OR s.credit_note_id IS NOT NULL
        OR COALESCE(s.credit_note_amount, 0) > 0
      )
      AND (
        p.v_refund = 'all'
        OR (p.v_refund = 'with_refund' AND COALESCE(s.refund_amount, 0) > 0)
        OR (p.v_refund = 'without_refund' AND (s.refund_amount IS NULL OR s.refund_amount = 0))
      )
      AND (
        p.v_credit_note = 'all'
        OR (p.v_credit_note = 'with_credit_note' AND (s.credit_note_id IS NOT NULL OR COALESCE(s.credit_note_amount, 0) > 0))
        OR (
          p.v_credit_note = 'without_credit_note'
          AND s.credit_note_id IS NULL
          AND (s.credit_note_amount IS NULL OR s.credit_note_amount = 0)
        )
      )
  ),
  sale_metrics AS (
    SELECT
      fs.*,
      (
        fs.payment_status = 'hold'
        OR (
          fs.payment_status = 'pending'
          AND fs.sale_number LIKE 'Hold/%'
          AND fs.payment_method = 'pay_later'
        )
      ) AS is_hold,
      GREATEST(0, COALESCE(fs.net_amount, 0))::numeric AS net_amt,
      ROUND(
        (COALESCE(fs.cash_amount, 0) + COALESCE(fs.card_amount, 0) + COALESCE(fs.upi_amount, 0))::numeric,
        2
      ) AS tender_amt
    FROM filtered_sales fs
  ),
  computed AS (
    SELECT
      sm.*,
      CASE
        WHEN sm.is_hold THEN COALESCE(sm.paid_amount, 0)
        WHEN sm.tender_amt <= 0.01 THEN LEAST(sm.net_amt, GREATEST(0, COALESCE(sm.paid_amount, 0)))
        ELSE LEAST(sm.net_amt, GREATEST(COALESCE(sm.paid_amount, 0), sm.tender_amt))
      END AS effective_paid
    FROM sale_metrics sm
  ),
  classified AS (
    SELECT
      c.*,
      (
        NOT c.is_hold
        AND c.effective_paid + COALESCE(c.sale_return_adjust, 0) >= c.net_amt - 0.01
      ) AS is_completed,
      GREATEST(
        0,
        c.net_amt - c.effective_paid - COALESCE(c.sale_return_adjust, 0)
      ) AS outstanding
    FROM computed c
  )
  SELECT json_build_object(
    'totalBills', COUNT(*)::integer,
    'totalQty', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(total_qty, 0) ELSE 0 END), 0)::integer,
    'totalAmount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN
        CASE
          WHEN COALESCE(gross_amount, 0) > 0 THEN COALESCE(gross_amount, 0)
          ELSE COALESCE(net_amt, 0)
        END
      ELSE 0 END
    ), 0),
    'totalDiscount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN
        COALESCE(discount_amount, 0) + COALESCE(flat_discount_amount, 0) + COALESCE(points_redeemed_amount, 0)
      ELSE 0 END
    ), 0),
    'netSale', COALESCE(SUM(CASE WHEN NOT is_hold THEN net_amt ELSE 0 END), 0),
    'completedCount', COUNT(*) FILTER (WHERE NOT is_hold AND is_completed)::integer,
    'completedAmount', COALESCE(SUM(CASE WHEN NOT is_hold AND is_completed THEN net_amt ELSE 0 END), 0),
    'pendingCount', COUNT(*) FILTER (WHERE NOT is_hold AND NOT is_completed)::integer,
    'pendingAmount', COALESCE(SUM(CASE WHEN NOT is_hold AND NOT is_completed THEN outstanding ELSE 0 END), 0),
    'holdCount', COUNT(*) FILTER (WHERE is_hold)::integer,
    'holdAmount', COALESCE(SUM(CASE WHEN is_hold THEN net_amt ELSE 0 END), 0),
    'refundCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(refund_amount, 0) > 0)::integer,
    'refundAmount', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(refund_amount, 0) ELSE 0 END), 0),
    'creditNoteCount', COUNT(*) FILTER (
      WHERE NOT is_hold AND (credit_note_id IS NOT NULL OR COALESCE(credit_note_amount, 0) > 0)
    )::integer,
    'creditNoteAmount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN COALESCE(credit_note_amount, 0) ELSE 0 END
    ), 0),
    'totalCash', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(cash_amount, 0) ELSE 0 END), 0),
    'totalCard', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(card_amount, 0) ELSE 0 END), 0),
    'totalUpi', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(upi_amount, 0) ELSE 0 END), 0),
    'totalBalance', COALESCE(SUM(CASE WHEN NOT is_hold THEN outstanding ELSE 0 END), 0),
    'totalSaleReturnAdjust', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(sale_return_adjust, 0) ELSE 0 END), 0),
    'totalRoundOff', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(round_off, 0) ELSE 0 END), 0),
    'cashBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(cash_amount, 0) > 0)::integer,
    'cardBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(card_amount, 0) > 0)::integer,
    'upiBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(upi_amount, 0) > 0)::integer,
    'salesmanFilterApplied', true
  )
  FROM classified
), json_build_object(
  'totalBills', 0,
  'totalQty', 0,
  'totalAmount', 0,
  'totalDiscount', 0,
  'netSale', 0,
  'completedCount', 0,
  'completedAmount', 0,
  'pendingCount', 0,
  'pendingAmount', 0,
  'holdCount', 0,
  'holdAmount', 0,
  'refundCount', 0,
  'refundAmount', 0,
  'creditNoteCount', 0,
  'creditNoteAmount', 0,
  'totalCash', 0,
  'totalCard', 0,
  'totalUpi', 0,
  'totalBalance', 0,
  'totalSaleReturnAdjust', 0,
  'totalRoundOff', 0,
  'cashBillCount', 0,
  'cardBillCount', 0,
  'upiBillCount', 0,
  'salesmanFilterApplied', true
))
$fn$
;

REVOKE ALL ON FUNCTION public.get_pos_dashboard_stats(
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  uuid
) FROM PUBLIC, anon
;

GRANT EXECUTE ON FUNCTION public.get_pos_dashboard_stats(
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  uuid
) TO authenticated, service_role
;
