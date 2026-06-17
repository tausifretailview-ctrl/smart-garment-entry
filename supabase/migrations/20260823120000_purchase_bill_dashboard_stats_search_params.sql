-- Purchase bill dashboard tiles: optional search/supplier scope for All Time + search
-- (mirrors get_invoice_dashboard_stats narrow-scope pattern).

DROP FUNCTION IF EXISTS public.get_purchase_bill_dashboard_stats(uuid, date, date, text, text);

CREATE OR REPLACE FUNCTION public.get_purchase_bill_dashboard_stats(
  p_org_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_payment_status_filter text DEFAULT 'all',
  p_dc_filter text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  result json;
BEGIN
  WITH filtered_bills AS (
    SELECT
      b.net_amount,
      b.paid_amount,
      b.payment_status,
      b.is_cancelled
    FROM public.purchase_bills b
    WHERE b.organization_id = p_org_id
      AND b.deleted_at IS NULL
      AND (p_start_date IS NULL OR b.bill_date >= p_start_date)
      AND (p_end_date IS NULL OR b.bill_date <= p_end_date)
      AND (p_supplier_id IS NULL OR b.supplier_id = p_supplier_id)
      AND (
        v_search IS NULL
        OR b.software_bill_no ILIKE '%' || v_search || '%'
        OR b.supplier_invoice_no ILIKE '%' || v_search || '%'
        OR b.supplier_name ILIKE '%' || v_search || '%'
      )
      AND (
        p_payment_status_filter = 'all_including_cancelled'
        OR (p_payment_status_filter = 'cancelled' AND b.is_cancelled = true)
        OR (
          COALESCE(p_payment_status_filter, 'all') NOT IN ('cancelled', 'all_including_cancelled')
          AND (b.is_cancelled IS NULL OR b.is_cancelled = false)
          AND (
            COALESCE(p_payment_status_filter, 'all') = 'all'
            OR (
              p_payment_status_filter = 'not_paid'
              AND (
                b.payment_status IS NULL
                OR LOWER(b.payment_status) IN ('unpaid', 'pending')
              )
            )
            OR (
              p_payment_status_filter NOT IN ('all', 'not_paid')
              AND LOWER(COALESCE(b.payment_status, '')) = LOWER(p_payment_status_filter)
            )
          )
        )
      )
      AND (
        p_dc_filter IS NULL
        OR p_dc_filter = 'all'
        OR (p_dc_filter = 'dc' AND b.is_dc_purchase = true)
        OR (p_dc_filter = 'gst' AND (b.is_dc_purchase IS NULL OR b.is_dc_purchase = false))
      )
  )
  SELECT json_build_object(
    'total_count', COUNT(*)::bigint,
    'total_amount', COALESCE(SUM(f.net_amount), 0)::numeric,
    'paid_amount', COALESCE(SUM(
      CASE
        WHEN (
          f.net_amount <= 0.01
          OR COALESCE(f.paid_amount, 0) >= f.net_amount - 0.01
          OR LOWER(COALESCE(f.payment_status, '')) = 'paid'
        ) THEN f.net_amount
        ELSE 0
      END
    ), 0)::numeric,
    'partial_amount', COALESCE(SUM(
      CASE
        WHEN f.net_amount > 0.01
          AND COALESCE(f.paid_amount, 0) > 0.01
          AND COALESCE(f.paid_amount, 0) < f.net_amount - 0.01
          AND LOWER(COALESCE(f.payment_status, '')) NOT IN ('paid')
        THEN f.net_amount
        WHEN LOWER(COALESCE(f.payment_status, '')) = 'partial'
          AND NOT (
            f.net_amount <= 0.01
            OR COALESCE(f.paid_amount, 0) >= f.net_amount - 0.01
          )
        THEN f.net_amount
        ELSE 0
      END
    ), 0)::numeric,
    'unpaid_amount', COALESCE(SUM(
      CASE
        WHEN (
          f.net_amount > 0.01
          AND COALESCE(f.paid_amount, 0) <= 0.01
          AND LOWER(COALESCE(f.payment_status, '')) NOT IN ('paid', 'partial')
        ) OR (
          f.net_amount > 0.01
          AND COALESCE(f.paid_amount, 0) > 0.01
          AND COALESCE(f.paid_amount, 0) < f.net_amount - 0.01
          AND LOWER(COALESCE(f.payment_status, '')) = 'unpaid'
        )
        THEN f.net_amount
        ELSE 0
      END
    ), 0)::numeric
  )
  INTO result
  FROM filtered_bills f;

  RETURN COALESCE(result, json_build_object(
    'total_count', 0,
    'total_amount', 0,
    'paid_amount', 0,
    'partial_amount', 0,
    'unpaid_amount', 0
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_purchase_bill_dashboard_stats(
  uuid,
  date,
  date,
  text,
  text,
  text,
  uuid
) TO authenticated;
