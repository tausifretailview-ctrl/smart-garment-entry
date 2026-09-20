-- SECTION A — run first (no table locks). Safe under load.
-- After success, proname check should list _customer_advance_pool_cap and _customer_advance_applied_from_vouchers.

CREATE OR REPLACE FUNCTION public._customer_advance_pool_cap(
  p_organization_id uuid,
  p_customer_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(SUM(ca.amount), 0)
      FROM public.customer_advances ca
      WHERE ca.organization_id = p_organization_id
        AND ca.customer_id = p_customer_id
    )
    -
    (
      SELECT COALESCE(SUM(ar.refund_amount), 0)
      FROM public.advance_refunds ar
      INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
      WHERE ca.organization_id = p_organization_id
        AND ca.customer_id = p_customer_id
    ),
    0
  );
$$;

CREATE OR REPLACE FUNCTION public._customer_advance_applied_from_vouchers(
  p_organization_id uuid,
  p_customer_id uuid,
  p_exclude_voucher_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(SUM(ve.total_amount), 0)
  FROM public.voucher_entries ve
  LEFT JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND (
      lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      OR COALESCE(ve.description, '') ILIKE '%adjusted from advance balance%'
    )
    AND (
      (s.id IS NOT NULL AND s.customer_id = p_customer_id)
      OR (
        s.id IS NULL
        AND lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND ve.reference_id = p_customer_id
      )
    )
    AND (p_exclude_voucher_id IS NULL OR ve.id IS DISTINCT FROM p_exclude_voucher_id);
$$;
