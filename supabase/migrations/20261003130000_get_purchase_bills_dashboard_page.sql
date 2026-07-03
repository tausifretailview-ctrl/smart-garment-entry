-- Purchase Bill Dashboard: paginated list + summary in one call.
-- Uses purchase_bills.total_items (denormalized) — no purchase_items(count) LATERAL embed.

CREATE OR REPLACE FUNCTION public.get_purchase_bills_dashboard_page(
  p_org_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_payment_status_filter text DEFAULT 'all',
  p_dc_filter text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_sort_asc boolean DEFAULT false,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(p_search), '');
  v_skip_date boolean := v_search IS NOT NULL AND v_search ~ '^\d{4,}$';
  v_result json;
BEGIN
  PERFORM public.assert_org_member(p_org_id);

  WITH filtered_bills AS (
    SELECT
      b.id,
      b.supplier_id,
      b.supplier_name,
      b.supplier_invoice_no,
      b.software_bill_no,
      b.bill_date,
      b.bill_entry_at,
      b.gross_amount,
      b.discount_amount,
      b.gst_amount,
      b.net_amount,
      b.notes,
      b.created_at,
      b.created_by,
      b.payment_status,
      b.paid_amount,
      b.total_qty,
      b.total_items,
      b.is_dc_purchase,
      b.bill_image_url,
      b.is_locked,
      b.is_cancelled,
      b.cancelled_at,
      b.cancelled_reason
    FROM public.purchase_bills b
    WHERE b.organization_id = p_org_id
      AND b.deleted_at IS NULL
      AND (v_skip_date OR p_start_date IS NULL OR b.bill_date >= p_start_date)
      AND (v_skip_date OR p_end_date IS NULL OR b.bill_date <= p_end_date)
      AND (
        v_search IS NULL
        OR b.software_bill_no ILIKE '%' || v_search || '%'
        OR b.supplier_invoice_no ILIKE '%' || v_search || '%'
        OR b.supplier_name ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.purchase_items pi
          WHERE pi.bill_id = b.id
            AND pi.deleted_at IS NULL
            AND (
              pi.product_name ILIKE '%' || v_search || '%'
              OR pi.brand ILIKE '%' || v_search || '%'
              OR pi.barcode ILIKE '%' || v_search || '%'
              OR pi.style ILIKE '%' || v_search || '%'
              OR pi.category ILIKE '%' || v_search || '%'
              OR pi.color ILIKE '%' || v_search || '%'
            )
        )
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
  ),
  summary AS (
    SELECT
      COUNT(*)::bigint AS total_count,
      COALESCE(SUM(f.net_amount), 0)::numeric AS total_amount,
      COALESCE(SUM(
        CASE
          WHEN (
            f.net_amount <= 0.01
            OR COALESCE(f.paid_amount, 0) >= f.net_amount - 0.01
            OR LOWER(COALESCE(f.payment_status, '')) = 'paid'
          ) THEN f.net_amount
          ELSE 0
        END
      ), 0)::numeric AS paid_amount,
      COALESCE(SUM(
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
      ), 0)::numeric AS partial_amount,
      COALESCE(SUM(
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
      ), 0)::numeric AS unpaid_amount
    FROM filtered_bills f
  ),
  paged AS (
    SELECT *
    FROM filtered_bills
    ORDER BY
      CASE WHEN p_sort_asc THEN bill_date END ASC NULLS LAST,
      CASE WHEN NOT p_sort_asc THEN bill_date END DESC NULLS LAST,
      CASE WHEN p_sort_asc THEN created_at END ASC NULLS LAST,
      CASE WHEN NOT p_sort_asc THEN created_at END DESC NULLS LAST,
      id ASC
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  )
  SELECT json_build_object(
    'bills', COALESCE(
      (
        SELECT json_agg(to_jsonb(p) ORDER BY
          CASE WHEN p_sort_asc THEN p.bill_date END ASC NULLS LAST,
          CASE WHEN NOT p_sort_asc THEN p.bill_date END DESC NULLS LAST,
          p.id ASC
        )
        FROM paged p
      ),
      '[]'::json
    ),
    'total_count', (SELECT total_count FROM summary),
    'summary', (
      SELECT json_build_object(
        'total_count', s.total_count,
        'total_amount', s.total_amount,
        'paid_amount', s.paid_amount,
        'partial_amount', s.partial_amount,
        'unpaid_amount', s.unpaid_amount
      )
      FROM summary s
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, json_build_object(
    'bills', '[]'::json,
    'total_count', 0,
    'summary', json_build_object(
      'total_count', 0,
      'total_amount', 0,
      'paid_amount', 0,
      'partial_amount', 0,
      'unpaid_amount', 0
    )
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_purchase_bills_dashboard_page(
  uuid, date, date, text, text, text, boolean, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_purchase_bills_dashboard_page(
  uuid, date, date, text, text, text, boolean, integer, integer
) TO authenticated, service_role;
