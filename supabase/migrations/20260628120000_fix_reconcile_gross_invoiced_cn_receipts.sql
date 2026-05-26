-- Align SQL outstanding with client ledger:
-- 1) total_invoiced = gross (net + sale_return_adjust) then subtract S/R adjust line (matches computeCustomerBalanceCore).
-- 2) Exclude CN application receipts from receipt_payments (memo-only; already in sales.sale_return_adjust).

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
DECLARE
  v_pending_exposed numeric;
  v_total_sra numeric;
  v_linked_absorb numeric;
  v_pending_net numeric;
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
    COALESCE(SUM(s.net_amount + COALESCE(s.sale_return_adjust, 0)), 0)::numeric,
    'sales gross (net_amount + sale_return_adjust) — matches client audit formula'::text
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
    'voucher_entries receipt (excl advance/CN application memos)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND lower(COALESCE(ve.payment_method, '')) NOT IN ('advance_adjustment', 'credit_note_adjustment')
    AND NOT (
      lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE '%credit note adjusted%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE '%cn adjusted%'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND s.customer_id = p_customer_id
          AND s.id::text = ve.reference_id::text
      )
      OR (
        lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text)
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text
        )
      )
    );

  RETURN QUERY
  SELECT
    'paid_at_sale_drift'::text,
    (-COALESCE(SUM(sub.drift), 0))::numeric,
    'POS pay-at-sale minus receipt vouchers on same sale (cash + settlement discount)'::text
  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(
        COALESCE(s.paid_amount, 0),
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
      )
      - COALESCE((
        SELECT SUM(
          GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
        )
        FROM public.voucher_entries ve
        WHERE ve.organization_id = p_organization_id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
      ), 0)
    ) AS drift
    FROM public.sales s
    WHERE s.customer_id = p_customer_id
      AND s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  ) sub
  WHERE sub.drift > 0;

  SELECT COALESCE(SUM(
    GREATEST(
      0::numeric,
      COALESCE(sr.net_amount, 0)
        - COALESCE(
          (
            SELECT s.sale_return_adjust
            FROM public.sales s
            WHERE s.id = sr.linked_sale_id
              AND s.organization_id = p_organization_id
              AND s.deleted_at IS NULL
          ),
          0
        )
    )
  ), 0)
  INTO v_pending_exposed
  FROM public.sale_returns sr
  WHERE sr.customer_id = p_customer_id
    AND sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL
    AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending';

  SELECT COALESCE(SUM(s.sale_return_adjust), 0)
  INTO v_total_sra
  FROM public.sales s
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  SELECT COALESCE(SUM(
    LEAST(
      COALESCE(sr.net_amount, 0),
      COALESCE(
        (
          SELECT s.sale_return_adjust
          FROM public.sales s
          WHERE s.id = sr.linked_sale_id
            AND s.organization_id = p_organization_id
            AND s.deleted_at IS NULL
        ),
        0
      )
    )
  ), 0)
  INTO v_linked_absorb
  FROM public.sale_returns sr
  WHERE sr.customer_id = p_customer_id
    AND sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL
    AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
    AND sr.linked_sale_id IS NOT NULL;

  v_pending_net := GREATEST(0, v_pending_exposed - GREATEST(0, v_total_sra - v_linked_absorb));

  RETURN QUERY
  SELECT
    'pending_sale_returns'::text,
    (-v_pending_net)::numeric,
    'sale_returns pending — net of invoice sale_return_adjust pool (matches client ledger)'::text;

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
    AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text);

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
    AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text);

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
  'Lifetime outstanding components: gross invoiced minus S/R adjust, receipts excl CN/advance memos, pending SR net of S/R pool.';
