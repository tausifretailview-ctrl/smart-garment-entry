-- Sales Invoice Dashboard stats: optional top-level search/customer params so
-- "All Time + customer search" aggregates a narrow row set (not full org history).
-- Backward compatible: new params default NULL; p_filters->>'search' still honored.

DROP FUNCTION IF EXISTS public.get_invoice_dashboard_stats(uuid, timestamptz, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.get_invoice_dashboard_stats(
  p_organization_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_search text := COALESCE(
    NULLIF(trim(p_search), ''),
    NULLIF(trim(COALESCE(p_filters->>'search', '')), '')
  );
  v_delivery text := COALESCE(NULLIF(trim(p_filters->>'deliveryFilter'), ''), 'all');
  v_shop text := COALESCE(NULLIF(trim(p_filters->>'shopFilter'), ''), 'all');
  v_user text := COALESCE(NULLIF(trim(p_filters->>'userFilter'), ''), 'all');
  v_voucher_from date := NULLIF(trim(COALESCE(p_filters->>'voucherDateFrom', '')), '')::date;
  v_voucher_to date := NULLIF(trim(COALESCE(p_filters->>'voucherDateTo', '')), '')::date;
  v_payment_filter jsonb := COALESCE(p_filters->'paymentStatusFilter', '[]'::jsonb);
  v_has_payment_filter boolean := jsonb_array_length(COALESCE(p_filters->'paymentStatusFilter', '[]'::jsonb)) > 0;
  v_has_narrow_scope boolean := (v_search IS NOT NULL OR p_customer_id IS NOT NULL);
  v_result json;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  WITH filtered_sales AS (
    SELECT
      s.id,
      s.sale_number,
      s.customer_id,
      s.net_amount,
      s.sale_return_adjust,
      s.paid_amount,
      s.discount_amount,
      s.flat_discount_amount,
      s.total_qty,
      s.delivery_status,
      s.payment_status,
      s.is_cancelled
    FROM sales s
    WHERE s.organization_id = p_organization_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
      AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
      AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND (v_delivery = 'all' OR s.delivery_status = v_delivery)
      AND (v_shop = 'all' OR s.shop_name = v_shop)
      AND (v_user = 'all' OR v_user = '__pending__' OR s.created_by::text = v_user)
      AND (
        v_search IS NULL
        OR s.sale_number ILIKE '%' || v_search || '%'
        OR s.customer_name ILIKE '%' || v_search || '%'
        OR s.customer_phone ILIKE '%' || v_search || '%'
        OR s.salesman ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1
          FROM sale_items si
          WHERE si.sale_id = s.id
            AND si.deleted_at IS NULL
            AND (
              si.barcode ILIKE '%' || v_search || '%'
              OR si.product_name ILIKE '%' || v_search || '%'
              OR si.size ILIKE '%' || v_search || '%'
              OR si.color ILIKE '%' || v_search || '%'
            )
        )
      )
  ),
  items_gross AS (
    SELECT
      si.sale_id,
      SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS items_gross
    FROM sale_items si
    INNER JOIN filtered_sales fs ON fs.id = si.sale_id
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  receipt_rows AS (
    SELECT
      ve.reference_id,
      ve.reference_type,
      ve.total_amount,
      ve.discount_amount,
      ve.payment_method,
      ve.description
    FROM voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND lower(ve.voucher_type) = 'receipt'
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.reference_type, '')) IN (
        'sale', 'customer', 'customer_payment', 'customerreceipt'
      )
      AND (v_voucher_from IS NULL OR ve.voucher_date >= v_voucher_from)
      AND (v_voucher_to IS NULL OR ve.voucher_date <= v_voucher_to)
      AND (
        (
          NOT v_has_narrow_scope
          AND (
            ve.reference_id IN (SELECT fs.id::text FROM filtered_sales fs)
            OR ve.reference_id IN (
              SELECT fs.customer_id::text
              FROM filtered_sales fs
              WHERE fs.customer_id IS NOT NULL
            )
            OR EXISTS (
              SELECT 1
              FROM filtered_sales fs2
              WHERE fs2.sale_number IS NOT NULL
                AND btrim(fs2.sale_number) <> ''
                AND ve.description ILIKE '%' || fs2.sale_number || '%'
            )
          )
        )
        OR (
          v_has_narrow_scope
          AND EXISTS (
            SELECT 1
            FROM filtered_sales fs
            WHERE ve.reference_id = fs.id::text
              OR (
                fs.customer_id IS NOT NULL
                AND ve.reference_id = fs.customer_id::text
              )
              OR (
                fs.sale_number IS NOT NULL
                AND btrim(fs.sale_number) <> ''
                AND ve.description ILIKE '%' || fs.sale_number || '%'
              )
          )
        )
      )
  ),
  receipt_attributed AS (
    SELECT
      fs.id AS sale_id,
      CASE
        WHEN (
          rr.payment_method = 'advance_adjustment'
          OR lower(COALESCE(rr.description, '')) LIKE '%adjusted from advance balance%'
          OR lower(COALESCE(rr.description, '')) LIKE '%advance adjusted%'
        ) THEN COALESCE(rr.total_amount, 0)
        ELSE 0
      END AS adv_amt,
      CASE
        WHEN (
          rr.payment_method = 'credit_note_adjustment'
          OR lower(COALESCE(rr.description, '')) LIKE '%credit note adjusted%'
          OR lower(COALESCE(rr.description, '')) LIKE '%cn adjusted%'
        ) THEN COALESCE(rr.total_amount, 0)
        ELSE 0
      END AS cn_amt,
      CASE
        WHEN NOT (
          rr.payment_method = 'advance_adjustment'
          OR lower(COALESCE(rr.description, '')) LIKE '%adjusted from advance balance%'
          OR lower(COALESCE(rr.description, '')) LIKE '%advance adjusted%'
          OR rr.payment_method = 'credit_note_adjustment'
          OR lower(COALESCE(rr.description, '')) LIKE '%credit note adjusted%'
          OR lower(COALESCE(rr.description, '')) LIKE '%cn adjusted%'
        ) THEN COALESCE(rr.total_amount, 0)
        ELSE 0
      END AS cash_amt,
      CASE
        WHEN NOT (
          rr.payment_method = 'advance_adjustment'
          OR lower(COALESCE(rr.description, '')) LIKE '%adjusted from advance balance%'
          OR lower(COALESCE(rr.description, '')) LIKE '%advance adjusted%'
          OR rr.payment_method = 'credit_note_adjustment'
          OR lower(COALESCE(rr.description, '')) LIKE '%credit note adjusted%'
          OR lower(COALESCE(rr.description, '')) LIKE '%cn adjusted%'
        ) THEN COALESCE(rr.discount_amount, 0)
        ELSE 0
      END AS discount_amt
    FROM filtered_sales fs
    INNER JOIN receipt_rows rr ON (
      rr.reference_id = fs.id::text
      OR (
        fs.customer_id IS NOT NULL
        AND rr.reference_id = fs.customer_id::text
        AND fs.sale_number IS NOT NULL
        AND btrim(fs.sale_number) <> ''
        AND rr.description ILIKE '%' || fs.sale_number || '%'
      )
      OR (
        fs.sale_number IS NOT NULL
        AND btrim(fs.sale_number) <> ''
        AND rr.description ILIKE '%' || fs.sale_number || '%'
      )
    )
  ),
  receipt_splits AS (
    SELECT
      sale_id,
      COALESCE(SUM(cash_amt), 0) AS cash,
      COALESCE(SUM(cn_amt), 0) AS cn,
      COALESCE(SUM(adv_amt), 0) AS adv,
      COALESCE(SUM(discount_amt), 0) AS discount
    FROM receipt_attributed
    GROUP BY sale_id
  ),
  reconciled AS (
    SELECT
      fs.*,
      ig.items_gross,
      COALESCE(rs.cash, 0) AS split_cash,
      COALESCE(rs.cn, 0) AS split_cn,
      COALESCE(rs.adv, 0) AS split_adv,
      COALESCE(rs.discount, 0) AS split_discount,
      public.invoice_reconcile_outstanding(
        COALESCE(fs.net_amount, 0),
        COALESCE(fs.sale_return_adjust, 0),
        GREATEST(
          0,
          COALESCE(fs.paid_amount, 0)
            - (COALESCE(rs.cash, 0) + COALESCE(rs.adv, 0) + COALESCE(rs.cn, 0))
        ),
        COALESCE(rs.cash, 0),
        COALESCE(rs.cn, 0),
        COALESCE(rs.adv, 0),
        COALESCE(rs.discount, 0),
        ig.items_gross
      ) AS outstanding,
      CASE
        WHEN fs.is_cancelled = true OR fs.payment_status = 'cancelled' THEN 'cancelled'::text
        WHEN fs.payment_status = 'hold' THEN 'hold'::text
        WHEN public.invoice_reconcile_outstanding(
          COALESCE(fs.net_amount, 0),
          COALESCE(fs.sale_return_adjust, 0),
          GREATEST(
            0,
            COALESCE(fs.paid_amount, 0)
              - (COALESCE(rs.cash, 0) + COALESCE(rs.adv, 0) + COALESCE(rs.cn, 0))
          ),
          COALESCE(rs.cash, 0),
          COALESCE(rs.cn, 0),
          COALESCE(rs.adv, 0),
          COALESCE(rs.discount, 0),
          ig.items_gross
        ) <= 0.01 THEN 'completed'::text
        WHEN COALESCE(rs.cash, 0) > 0.01
          OR COALESCE(rs.adv, 0) > 0.01
          OR GREATEST(0, COALESCE(rs.cn, 0) - GREATEST(0, COALESCE(fs.sale_return_adjust, 0))) > 0.01
          THEN 'partial'::text
        ELSE 'pending'::text
      END AS derived_status
    FROM filtered_sales fs
    LEFT JOIN items_gross ig ON ig.sale_id = fs.id
    LEFT JOIN receipt_splits rs ON rs.sale_id = fs.id
  ),
  stats_rows AS (
    SELECT r.*
    FROM reconciled r
    WHERE
      CASE
        WHEN NOT v_has_payment_filter THEN
          r.is_cancelled IS NOT TRUE
          AND r.payment_status <> 'cancelled'
          AND r.payment_status <> 'hold'
        WHEN v_payment_filter ? 'cancelled' AND jsonb_array_length(v_payment_filter) = 1 THEN
          r.is_cancelled = true OR r.payment_status = 'cancelled'
        WHEN v_payment_filter ? 'cancelled' THEN
          (r.is_cancelled = true OR r.payment_status = 'cancelled')
          OR (
            r.derived_status = ANY (SELECT jsonb_array_elements_text(v_payment_filter))
            AND r.is_cancelled IS NOT TRUE
          )
        ELSE
          r.derived_status = ANY (SELECT jsonb_array_elements_text(v_payment_filter))
          AND r.is_cancelled IS NOT TRUE
      END
  )
  SELECT json_build_object(
    'totalInvoices', COUNT(*)::integer,
    'totalAmount', COALESCE(SUM(GREATEST(0, COALESCE(net_amount, 0))), 0),
    'totalDiscount', COALESCE(SUM(COALESCE(discount_amount, 0) + COALESCE(flat_discount_amount, 0)), 0),
    'totalQty', COALESCE(SUM(COALESCE(total_qty, 0)), 0)::integer,
    'pendingAmount', COALESCE(SUM(
      CASE WHEN is_cancelled = true THEN 0 ELSE outstanding END
    ), 0),
    'deliveredCount', COUNT(*) FILTER (WHERE delivery_status = 'delivered')::integer,
    'deliveredAmount', COALESCE(SUM(GREATEST(0, COALESCE(net_amount, 0))) FILTER (WHERE delivery_status = 'delivered'), 0),
    'undeliveredCount', COUNT(*) FILTER (WHERE COALESCE(delivery_status, 'undelivered') <> 'delivered')::integer,
    'undeliveredAmount', COALESCE(SUM(GREATEST(0, COALESCE(net_amount, 0))) FILTER (WHERE COALESCE(delivery_status, 'undelivered') <> 'delivered'), 0)
  )
  INTO v_result
  FROM stats_rows;

  RETURN COALESCE(v_result, json_build_object(
    'totalInvoices', 0,
    'totalAmount', 0,
    'totalDiscount', 0,
    'totalQty', 0,
    'pendingAmount', 0,
    'deliveredCount', 0,
    'deliveredAmount', 0,
    'undeliveredCount', 0,
    'undeliveredAmount', 0
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_dashboard_stats(
  uuid,
  timestamptz,
  timestamptz,
  jsonb,
  text,
  uuid
) TO authenticated;
