-- POS dashboard summary tiles: server aggregation with optional search/customer scope.
-- Column math mirrors computePosDashboardSummaryStats / posDashboardSettlement (no receipt RPC drift).

CREATE OR REPLACE FUNCTION public.get_pos_dashboard_stats(
  p_organization_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_cancel text := COALESCE(NULLIF(trim(p_filters->>'cancelFilter'), ''), 'active');
  v_payment_method text := COALESCE(NULLIF(trim(p_filters->>'paymentMethodFilter'), ''), 'all');
  v_sale_type text := COALESCE(NULLIF(trim(p_filters->>'saleTypeFilter'), ''), 'all');
  v_refund text := COALESCE(NULLIF(trim(p_filters->>'refundFilter'), ''), 'all');
  v_credit_note text := COALESCE(NULLIF(trim(p_filters->>'creditNoteFilter'), ''), 'all');
  v_user text := COALESCE(NULLIF(trim(p_filters->>'userFilter'), ''), 'all');
  v_payment_status jsonb := COALESCE(p_filters->'paymentStatusFilter', '[]'::jsonb);
  v_has_payment_status boolean := jsonb_array_length(COALESCE(p_filters->'paymentStatusFilter', '[]'::jsonb)) > 0;
  v_bypass_dates boolean := (v_search IS NOT NULL);
  v_result json;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  WITH filtered_sales AS (
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
      s.credit_amount,
      s.credit_note_amount,
      s.sale_return_adjust,
      s.round_off,
      s.total_qty,
      s.is_cancelled
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND (
        v_sale_type = 'dc' AND s.sale_type = 'delivery_challan'
        OR v_sale_type = 'pos' AND s.sale_type = 'pos'
        OR v_sale_type NOT IN ('dc', 'pos')
          AND s.sale_type IN ('pos', 'delivery_challan')
      )
      AND (
        NOT v_bypass_dates
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        OR v_bypass_dates
      )
      AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND (
        v_search IS NULL
        OR s.sale_number ILIKE '%' || v_search || '%'
        OR s.customer_name ILIKE '%' || v_search || '%'
        OR s.customer_phone ILIKE '%' || v_search || '%'
        OR (
          v_search ~ '^\d{1,6}$'
          AND s.sale_number ILIKE '%/' || v_search
        )
      )
      AND (
        v_cancel = 'all'
        OR (v_cancel = 'cancelled' AND s.is_cancelled = true)
        OR (v_cancel = 'active' AND (s.is_cancelled IS NULL OR s.is_cancelled = false))
      )
      AND (v_user = 'all' OR v_user = '__pending__' OR s.created_by::text = v_user)
      AND (v_payment_method = 'all' OR s.payment_method = v_payment_method)
      AND (
        NOT v_has_payment_status
        OR s.payment_status = ANY (SELECT jsonb_array_elements_text(v_payment_status))
      )
      AND (
        v_sale_type <> 'cn'
        OR s.credit_note_id IS NOT NULL
        OR COALESCE(s.credit_amount, 0) > 0
      )
      AND (
        v_refund = 'all'
        OR (v_refund = 'with_refund' AND COALESCE(s.refund_amount, 0) > 0)
        OR (v_refund = 'without_refund' AND (s.refund_amount IS NULL OR s.refund_amount = 0))
      )
      AND (
        v_credit_note = 'all'
        OR (v_credit_note = 'with_credit_note' AND (s.credit_note_id IS NOT NULL OR COALESCE(s.credit_amount, 0) > 0))
        OR (
          v_credit_note = 'without_credit_note'
          AND s.credit_note_id IS NULL
          AND (s.credit_amount IS NULL OR s.credit_amount = 0)
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
    'totalAmount', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(gross_amount, 0) ELSE 0 END), 0),
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
      WHERE NOT is_hold AND (credit_note_id IS NOT NULL OR COALESCE(credit_amount, 0) > 0)
    )::integer,
    'creditNoteAmount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN COALESCE(credit_note_amount, credit_amount, 0) ELSE 0 END
    ), 0),
    'totalCash', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(cash_amount, 0) ELSE 0 END), 0),
    'totalCard', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(card_amount, 0) ELSE 0 END), 0),
    'totalUpi', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(upi_amount, 0) ELSE 0 END), 0),
    'totalBalance', COALESCE(SUM(CASE WHEN NOT is_hold THEN outstanding ELSE 0 END), 0),
    'totalSaleReturnAdjust', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(sale_return_adjust, 0) ELSE 0 END), 0),
    'totalRoundOff', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(round_off, 0) ELSE 0 END), 0),
    'cashBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(cash_amount, 0) > 0)::integer,
    'cardBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(card_amount, 0) > 0)::integer,
    'upiBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(upi_amount, 0) > 0)::integer
  )
  INTO v_result
  FROM classified;

  RETURN COALESCE(v_result, json_build_object(
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
    'upiBillCount', 0
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pos_dashboard_stats(
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  uuid
) TO authenticated;
