-- Per-customer balance reconciliation (lifetime) aligned with customerAuditMath.computeCustomerOutstanding.
-- Does NOT include standalone sale_returns rows (pending/partial) — those affect running balance / buildAuditRows
-- but not the audit formula; including them would false-trigger integrity UI vs computeAuditFormulaOutstanding.
-- Receipt matching: sale-linked by reference_id = sales.id (any reference_type, incl. legacy 'customer' + sale id),
-- plus opening receipts: reference_type customer, reference_id = customer id, and reference_id is not a sale id.

CREATE OR REPLACE FUNCTION public.reconcile_customer_balance(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  source text,
  amount numeric,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found in organization' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    'opening_balance'::text,
    COALESCE(
      (SELECT c.opening_balance FROM public.customers c
       WHERE c.id = p_customer_id AND c.organization_id = p_organization_id AND c.deleted_at IS NULL),
      0
    )::numeric,
    'customers.opening_balance'::text;

  RETURN QUERY
  SELECT
    'balance_adjustment'::text,
    COALESCE(SUM(cba.outstanding_difference), 0)::numeric,
    'customer_balance_adjustments (sum outstanding_difference)'::text
  FROM public.customer_balance_adjustments cba
  WHERE cba.customer_id = p_customer_id
    AND cba.organization_id = p_organization_id;

  RETURN QUERY
  SELECT
    'total_invoiced'::text,
    COALESCE(SUM(s.net_amount), 0)::numeric,
    'sales.net_amount (excl cancelled/hold)'::text
  FROM public.sales s
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT
    'sale_return_adjust_on_invoices'::text,
    (-COALESCE(SUM(s.sale_return_adjust), 0))::numeric,
    'sales.sale_return_adjust (reduces receivable like audit formula)'::text
  FROM public.sales s
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT
    'receipt_payments'::text,
    (-COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0))::numeric,
    'voucher_entries receipt (sale-linked or opening; excl advance_application)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT (
      lower(COALESCE(ve.reference_type, '')) = 'sale'
      AND (
        lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND s.customer_id = p_customer_id
          AND s.id::text = ve.reference_id
      )
      OR (
        lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND trim(COALESCE(ve.reference_id, '')) = trim(p_customer_id::text)
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id
        )
      )
    );

  RETURN QUERY
  SELECT
    'credit_note_vouchers'::text,
    (-COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0))::numeric,
    'voucher_entries type=credit_note ref=customer'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND trim(COALESCE(ve.reference_id, '')) = trim(p_customer_id::text);

  RETURN QUERY
  SELECT
    'customer_payment_refunds'::text,
    (-COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0))::numeric,
    'voucher_entries type=payment ref=customer (reduces receivable)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND trim(COALESCE(ve.reference_id, '')) = trim(p_customer_id::text);

  RETURN QUERY
  SELECT
    'advances_applied'::text,
    (-COALESCE(SUM(ca.used_amount), 0))::numeric,
    'customer_advances.used_amount'::text
  FROM public.customer_advances ca
  WHERE ca.customer_id = p_customer_id
    AND ca.organization_id = p_organization_id;

  RETURN QUERY
  WITH adv AS (
    SELECT COALESCE(SUM(ca.amount), 0) AS total_amount,
           COALESCE(SUM(ca.used_amount), 0) AS total_used
    FROM public.customer_advances ca
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  ),
  ref AS (
    SELECT COALESCE(SUM(ar.refund_amount), 0) AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  )
  SELECT
    'unused_advances'::text,
    (-GREATEST(
      0::numeric,
      (SELECT total_amount - total_used FROM adv) - (SELECT total_refunds FROM ref)
    ))::numeric,
    'customer_advances unused net of refunds (matches customerAuditMath)'::text;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.reconcile_customer_balance(uuid, uuid) IS
  'Lifetime outstanding components matching customerAuditMath.computeCustomerOutstanding: SUM(amount) = true outstanding. '
  'Positive = customer owes (Dr). Excludes standalone sale_returns rows (see audit formula vs running ledger). '
  'Receipts: sale-linked by reference_id; opening receipts when reference_type=customer and reference_id is not a sale id.';

CREATE OR REPLACE FUNCTION public.get_customer_true_outstanding(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(r.amount), 0)::numeric
  FROM public.reconcile_customer_balance(p_customer_id, p_organization_id) AS r;
$$;

COMMENT ON FUNCTION public.get_customer_true_outstanding(uuid, uuid) IS
  'Single numeric lifetime outstanding from reconcile_customer_balance; compare to computeAuditFormulaOutstanding in app.';

GRANT EXECUTE ON FUNCTION public.reconcile_customer_balance(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_true_outstanding(uuid, uuid) TO authenticated, service_role;
