-- Dashboard perf: batch receipt fetch, purchase line-item search, scoped items_gross on invoice stats.
--
-- 1) get_sale_receipt_voucher_rows_batch — one SQL round-trip for dashboard receipt reconcile
-- 2) search_purchase_bill_ids — index-friendly line-item search (replaces per-bill EXISTS)
-- 3) get_purchase_bills_dashboard_page — uses search_purchase_bill_ids instead of correlated EXISTS
-- 4) get_invoice_dashboard_stats — scope items_gross to sale_return_adjust > 0 (output-identical)

-- ---------------------------------------------------------------------------
-- 1) Batch receipt rows for POS / invoice dashboard reconcile
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sale_receipt_voucher_rows_batch(
  p_organization_id uuid,
  p_sale_ids uuid[],
  p_customer_ids uuid[] DEFAULT NULL,
  p_voucher_date_from date DEFAULT NULL,
  p_voucher_date_to date DEFAULT NULL
)
RETURNS TABLE (
  reference_id uuid,
  reference_type text,
  total_amount numeric,
  discount_amount numeric,
  payment_method text,
  description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ve.reference_id,
    ve.reference_type,
    ve.total_amount,
    ve.discount_amount,
    ve.payment_method,
    ve.description
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND lower(COALESCE(ve.reference_type, '')) IN (
      'sale', 'customer', 'customer_payment', 'customerreceipt'
    )
    AND (
      (
        p_sale_ids IS NOT NULL
        AND cardinality(p_sale_ids) > 0
        AND ve.reference_id = ANY (p_sale_ids)
      )
      OR (
        p_customer_ids IS NOT NULL
        AND cardinality(p_customer_ids) > 0
        AND ve.reference_id = ANY (p_customer_ids)
        AND (p_voucher_date_from IS NULL OR ve.voucher_date >= p_voucher_date_from)
        AND (p_voucher_date_to IS NULL OR ve.voucher_date <= p_voucher_date_to)
      )
    );
$$;

COMMENT ON FUNCTION public.get_sale_receipt_voucher_rows_batch(uuid, uuid[], uuid[], date, date) IS
  'Dashboard batch: receipt voucher rows for sale-id + customer-id paths. '
  'Customer rows are voucher_date bounded; sale-id rows are not (matches client).';

REVOKE EXECUTE ON FUNCTION public.get_sale_receipt_voucher_rows_batch(uuid, uuid[], uuid[], date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sale_receipt_voucher_rows_batch(uuid, uuid[], uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sale_receipt_voucher_rows_batch(uuid, uuid[], uuid[], date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Purchase bill line-item search (UNION branches, capped)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_purchase_bill_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 500
)
RETURNS TABLE(bill_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_limit int;
  v_branch_cap int;
  v_skip_date boolean;
BEGIN
  PERFORM public.assert_org_member(p_org_id);

  v_q := btrim(COALESCE(p_search, ''));
  IF v_q = '' THEN
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(p_limit, 500), 1);
  v_branch_cap := v_limit;
  v_skip_date := v_q ~ '^\d{4,}$';

  RETURN QUERY
  SELECT u.bill_id
  FROM (
    (
      SELECT pi.bill_id
      FROM public.purchase_items pi
      INNER JOIN public.purchase_bills b ON b.id = pi.bill_id
      WHERE b.organization_id = p_org_id
        AND b.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND (v_skip_date OR p_date_from IS NULL OR b.bill_date >= p_date_from)
        AND (v_skip_date OR p_date_to IS NULL OR b.bill_date <= p_date_to)
        AND pi.product_name ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT pi.bill_id
      FROM public.purchase_items pi
      INNER JOIN public.purchase_bills b ON b.id = pi.bill_id
      WHERE b.organization_id = p_org_id
        AND b.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND (v_skip_date OR p_date_from IS NULL OR b.bill_date >= p_date_from)
        AND (v_skip_date OR p_date_to IS NULL OR b.bill_date <= p_date_to)
        AND pi.barcode ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT pi.bill_id
      FROM public.purchase_items pi
      INNER JOIN public.purchase_bills b ON b.id = pi.bill_id
      WHERE b.organization_id = p_org_id
        AND b.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND (v_skip_date OR p_date_from IS NULL OR b.bill_date >= p_date_from)
        AND (v_skip_date OR p_date_to IS NULL OR b.bill_date <= p_date_to)
        AND pi.brand ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT pi.bill_id
      FROM public.purchase_items pi
      INNER JOIN public.purchase_bills b ON b.id = pi.bill_id
      WHERE b.organization_id = p_org_id
        AND b.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND (v_skip_date OR p_date_from IS NULL OR b.bill_date >= p_date_from)
        AND (v_skip_date OR p_date_to IS NULL OR b.bill_date <= p_date_to)
        AND pi.style ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT pi.bill_id
      FROM public.purchase_items pi
      INNER JOIN public.purchase_bills b ON b.id = pi.bill_id
      WHERE b.organization_id = p_org_id
        AND b.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND (v_skip_date OR p_date_from IS NULL OR b.bill_date >= p_date_from)
        AND (v_skip_date OR p_date_to IS NULL OR b.bill_date <= p_date_to)
        AND pi.category ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT pi.bill_id
      FROM public.purchase_items pi
      INNER JOIN public.purchase_bills b ON b.id = pi.bill_id
      WHERE b.organization_id = p_org_id
        AND b.deleted_at IS NULL
        AND pi.deleted_at IS NULL
        AND (v_skip_date OR p_date_from IS NULL OR b.bill_date >= p_date_from)
        AND (v_skip_date OR p_date_to IS NULL OR b.bill_date <= p_date_to)
        AND pi.color ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
  ) u
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_purchase_bill_ids(uuid, text, date, date, int) IS
  'Purchase dashboard line-item search; UNION per column with cap (mirrors search_invoice_sale_ids).';

REVOKE EXECUTE ON FUNCTION public.search_purchase_bill_ids(uuid, text, date, date, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_purchase_bill_ids(uuid, text, date, date, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_purchase_bill_ids(uuid, text, date, date, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Purchase bills dashboard page — replace correlated EXISTS with search RPC
-- ---------------------------------------------------------------------------
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

  WITH line_item_bill_ids AS (
    SELECT s.bill_id
    FROM public.search_purchase_bill_ids(
      p_org_id,
      v_search,
      CASE WHEN v_skip_date THEN NULL::date ELSE p_start_date END,
      CASE WHEN v_skip_date THEN NULL::date ELSE p_end_date END,
      500
    ) s
    WHERE v_search IS NOT NULL
  ),
  filtered_bills AS (
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
      b.cancelled_reason,
      COALESCE(b.bill_entry_at, b.created_at) AS sort_entry_at
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
        OR b.id IN (SELECT bill_id FROM line_item_bill_ids)
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
    SELECT
      id,
      supplier_id,
      supplier_name,
      supplier_invoice_no,
      software_bill_no,
      bill_date,
      bill_entry_at,
      gross_amount,
      discount_amount,
      gst_amount,
      net_amount,
      notes,
      created_at,
      created_by,
      payment_status,
      paid_amount,
      total_qty,
      total_items,
      is_dc_purchase,
      bill_image_url,
      is_locked,
      is_cancelled,
      cancelled_at,
      cancelled_reason,
      sort_entry_at
    FROM filtered_bills
    ORDER BY
      CASE WHEN p_sort_asc THEN sort_entry_at END ASC NULLS LAST,
      CASE WHEN NOT p_sort_asc THEN sort_entry_at END DESC NULLS LAST,
      id ASC
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  )
  SELECT json_build_object(
    'bills', COALESCE(
      (
        SELECT json_agg(
          (to_jsonb(p) - 'sort_entry_at')
          ORDER BY
            CASE WHEN p_sort_asc THEN p.sort_entry_at END ASC NULLS LAST,
            CASE WHEN NOT p_sort_asc THEN p.sort_entry_at END DESC NULLS LAST,
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

COMMENT ON FUNCTION public.get_purchase_bills_dashboard_page(
  uuid, date, date, text, text, text, boolean, integer, integer
) IS
  'Purchase bill dashboard page. Line-item search via search_purchase_bill_ids (no per-bill EXISTS).';

REVOKE ALL ON FUNCTION public.get_purchase_bills_dashboard_page(
  uuid, date, date, text, text, text, boolean, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_purchase_bills_dashboard_page(
  uuid, date, date, text, text, text, boolean, integer, integer
) TO authenticated, service_role;
