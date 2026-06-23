-- Set-based customer party balance list (Tally-style Balance List — customers only).
-- signed_balance inlines the SAME component sum as reconcile_customer_balance /
-- get_customer_true_outstanding (migration 20260817120000_fix_advance_double_count_outstanding).
-- No per-customer LATERAL calls to get_customer_true_outstanding.

CREATE OR REPLACE FUNCTION public.get_customer_party_balances(p_organization_id uuid)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  signed_balance numeric,
  advance_available numeric,
  direction text,
  net_position numeric,
  total_dr numeric,
  total_cr numeric,
  net_receivable numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH
  cust AS (
    SELECT
      c.id,
      c.customer_name,
      COALESCE(c.opening_balance, 0)::numeric AS opening_balance
    FROM public.customers c
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ),
  items_gross AS (
    SELECT
      si.sale_id,
      SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
    FROM public.sale_items si
    INNER JOIN public.sales s2
      ON s2.id = si.sale_id
     AND s2.organization_id = p_organization_id
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  valid_sales AS (
    SELECT s.*
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
  ),
  balance_adjustment AS (
    SELECT
      cba.customer_id,
      COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
    GROUP BY cba.customer_id
  ),
  total_invoiced AS (
    SELECT
      s.customer_id,
      COALESCE(SUM(s.net_amount), 0)::numeric AS amt
    FROM valid_sales s
    GROUP BY s.customer_id
  ),
  sale_return_adjust AS (
    SELECT
      s.customer_id,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(ig.gross, 0) > 0
               AND COALESCE(s.sale_return_adjust, 0) > 0
               AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
          THEN 0
          ELSE COALESCE(s.sale_return_adjust, 0)
        END
      ), 0)::numeric AS amt
    FROM valid_sales s
    LEFT JOIN items_gross ig ON ig.sale_id = s.id
    GROUP BY s.customer_id
  ),
  sale_receipt_vouchers AS (
    SELECT
      s.customer_id,
      GREATEST(
        0::numeric,
        COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
      )::numeric AS amt
    FROM public.voucher_entries ve
    INNER JOIN valid_sales s ON s.id::text = ve.reference_id::text
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND NOT (
        lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
      )
  ),
  opening_receipt_vouchers AS (
    SELECT
      ve.reference_id::uuid AS customer_id,
      GREATEST(
        0::numeric,
        COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
      )::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
      AND NOT EXISTS (
        SELECT 1
        FROM public.sales s2
        WHERE s2.id::text = ve.reference_id::text
      )
      AND NOT (
        lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
      )
  ),
  receipt_payments AS (
    SELECT u.customer_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT customer_id, amt FROM sale_receipt_vouchers
      UNION ALL
      SELECT customer_id, amt FROM opening_receipt_vouchers
    ) u
    WHERE u.customer_id IS NOT NULL
    GROUP BY u.customer_id
  ),
  sale_voucher_receipts AS (
    SELECT
      ve.reference_id::text AS sale_id,
      COALESCE(SUM(
        GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      ), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    GROUP BY ve.reference_id::text
  ),
  sale_drift_rows AS (
    SELECT
      s.customer_id,
      GREATEST(
        0::numeric,
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
          - COALESCE(svr.amt, 0)
      )::numeric AS drift
    FROM valid_sales s
    LEFT JOIN sale_voucher_receipts svr ON svr.sale_id = s.id::text
    WHERE (
      GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0)
    ) > 0.005
  ),
  paid_at_sale_drift AS (
    SELECT
      customer_id,
      COALESCE(SUM(drift), 0)::numeric AS amt
    FROM sale_drift_rows
    WHERE drift > 0
    GROUP BY customer_id
  ),
  pending_sale_returns AS (
    SELECT
      sr.customer_id,
      COALESCE(SUM(
        GREATEST(
          0::numeric,
          COALESCE(sr.net_amount, 0)
            - COALESCE(ls.sale_return_adjust, 0)
        )
      ), 0)::numeric AS amt
    FROM public.sale_returns sr
    LEFT JOIN public.sales ls
      ON ls.id = sr.linked_sale_id
     AND ls.organization_id = p_organization_id
     AND ls.deleted_at IS NULL
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
    GROUP BY sr.customer_id
  ),
  credit_note_vouchers AS (
    SELECT
      ve.reference_id::uuid AS customer_id,
      COALESCE(SUM(
        GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      ), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    GROUP BY ve.reference_id::uuid
  ),
  customer_payment_refunds AS (
    SELECT
      ve.reference_id::uuid AS customer_id,
      COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    GROUP BY ve.reference_id::uuid
  ),
  advances AS (
    SELECT
      ca.customer_id,
      COALESCE(SUM(ca.amount), 0)::numeric AS total_amount,
      COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used
    FROM public.customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  advance_refunds AS (
    SELECT
      ca.customer_id,
      COALESCE(SUM(ar.refund_amount), 0)::numeric AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  advance_available_calc AS (
    SELECT
      c.id AS customer_id,
      GREATEST(
        0::numeric,
        COALESCE(a.total_amount, 0) - COALESCE(a.total_used, 0) - COALESCE(ar.total_refunds, 0)
      )::numeric AS advance_available
    FROM cust c
    LEFT JOIN advances a ON a.customer_id = c.id
    LEFT JOIN advance_refunds ar ON ar.customer_id = c.id
  ),
  balances AS (
    SELECT
      c.id AS customer_id,
      c.customer_name,
      ROUND((
        c.opening_balance
        + COALESCE(ba.amt, 0)
        + COALESCE(ti.amt, 0)
        - COALESCE(sra.amt, 0)
        - COALESCE(rp.amt, 0)
        - COALESCE(psd.amt, 0)
        - COALESCE(psr.amt, 0)
        - COALESCE(cn.amt, 0)
        - COALESCE(cpr.amt, 0)
        - COALESCE(adv.total_used, 0)
        - COALESCE(aac.advance_available, 0)
      )::numeric, 2) AS signed_balance,
      ROUND(COALESCE(aac.advance_available, 0)::numeric, 2) AS advance_available
    FROM cust c
    LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
    LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
    LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
    LEFT JOIN receipt_payments rp ON rp.customer_id = c.id
    LEFT JOIN paid_at_sale_drift psd ON psd.customer_id = c.id
    LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
    LEFT JOIN credit_note_vouchers cn ON cn.customer_id = c.id
    LEFT JOIN customer_payment_refunds cpr ON cpr.customer_id = c.id
    LEFT JOIN advances adv ON adv.customer_id = c.id
    LEFT JOIN advance_available_calc aac ON aac.customer_id = c.id
  ),
  with_facets AS (
    SELECT
      b.*,
      CASE
        WHEN b.signed_balance > 0.5 THEN 'Dr'
        WHEN b.signed_balance < -0.5 THEN 'Cr'
        ELSE 'Settled'
      END AS direction,
      ROUND((b.signed_balance - b.advance_available)::numeric, 2) AS net_position
    FROM balances b
  )
  SELECT
    wf.customer_id,
    wf.customer_name,
    wf.signed_balance,
    wf.advance_available,
    wf.direction,
    wf.net_position,
    ROUND(COALESCE(SUM(GREATEST(wf.signed_balance, 0)) OVER (), 0)::numeric, 2) AS total_dr,
    ROUND(COALESCE(SUM(GREATEST(-wf.signed_balance, 0)) OVER (), 0)::numeric, 2) AS total_cr,
    ROUND(COALESCE(SUM(wf.signed_balance) OVER (), 0)::numeric, 2) AS net_receivable
  FROM with_facets wf
  ORDER BY wf.customer_name;
END;
$$;

COMMENT ON FUNCTION public.get_customer_party_balances(uuid) IS
  'Set-based customer balance list for Tally-style Balance List. signed_balance = SUM(reconcile_customer_balance components) '
  'matching get_customer_true_outstanding. advance_available is unused advance pool; net_position is secondary (signed − advance).';

GRANT EXECUTE ON FUNCTION public.get_customer_party_balances(uuid) TO authenticated, service_role;
