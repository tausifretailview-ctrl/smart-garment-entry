-- Fix signed_balance drift vs get_customer_true_outstanding.
-- Root cause: PL/pgSQL RETURNS TABLE output variables (signed_balance, advance_available, …)
-- shadow terms inside RETURN QUERY WITH (receipt_payments / unused advance pool silently zeroed).
-- Fix: move set-based math to LANGUAGE sql helper; plpgsql wrapper only does auth + RETURN QUERY.
-- Sale-population rules match reconcile_customer_balance exactly:
--   total_invoiced / sale_return_adjust / paid_at_sale_drift → valid_sales (excl cancelled/hold)
--   sale_receipt_vouchers → sales with deleted_at IS NULL only (receipt EXISTS path; incl cancelled/hold)
--
-- Parity gate org (ELLA NOOR): 3fdca631-1e0c-4417-9704-421f5129ff67

CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows(p_organization_id uuid)
RETURNS TABLE (
  out_customer_id uuid,
  out_customer_name text,
  out_signed_balance numeric,
  out_advance_available numeric,
  out_direction text,
  out_net_position numeric,
  out_total_dr numeric,
  out_total_cr numeric,
  out_net_receivable numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    INNER JOIN public.sales s
      ON s.organization_id = p_organization_id
     AND s.deleted_at IS NULL
     AND s.customer_id IS NOT NULL
     AND s.id::text = ve.reference_id::text
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
      ve.reference_id::uuid AS cust_id,
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
    SELECT u.cust_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT srv.customer_id AS cust_id, srv.amt FROM sale_receipt_vouchers srv
      UNION ALL
      SELECT orv.cust_id AS cust_id, orv.amt FROM opening_receipt_vouchers orv
    ) u
    WHERE u.cust_id IS NOT NULL
    GROUP BY u.cust_id
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
      sdr.customer_id AS cust_id,
      COALESCE(SUM(sdr.drift), 0)::numeric AS amt
    FROM sale_drift_rows sdr
    WHERE sdr.drift > 0
    GROUP BY sdr.customer_id
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
  customer_advance_totals AS (
    SELECT
      ca.customer_id AS cust_id,
      COALESCE(SUM(ca.amount), 0)::numeric AS total_amount,
      COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used
    FROM public.customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  customer_advance_refund_totals AS (
    SELECT
      ca.customer_id AS cust_id,
      COALESCE(SUM(ar.refund_amount), 0)::numeric AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  customer_advance_pools AS (
    SELECT
      COALESCE(cat.cust_id, crt.cust_id) AS cust_id,
      COALESCE(cat.total_used, 0)::numeric AS total_used,
      GREATEST(
        0::numeric,
        COALESCE(cat.total_amount, 0)
          - COALESCE(cat.total_used, 0)
          - COALESCE(crt.total_refunds, 0)
      )::numeric AS unused_pool
    FROM customer_advance_totals cat
    FULL OUTER JOIN customer_advance_refund_totals crt ON crt.cust_id = cat.cust_id
  ),
  balances AS (
    SELECT
      c.id AS cust_id,
      c.customer_name AS party_name,
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
        - COALESCE(cap.total_used, 0)
        - COALESCE(cap.unused_pool, 0)
      )::numeric, 2) AS bal_signed,
      ROUND(COALESCE(cap.unused_pool, 0)::numeric, 2) AS unused_advance_pool
    FROM cust c
    LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
    LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
    LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
    LEFT JOIN receipt_payments rp ON rp.cust_id = c.id
    LEFT JOIN paid_at_sale_drift psd ON psd.cust_id = c.id
    LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
    LEFT JOIN credit_note_vouchers cn ON cn.customer_id = c.id
    LEFT JOIN customer_payment_refunds cpr ON cpr.customer_id = c.id
    LEFT JOIN customer_advance_pools cap ON cap.cust_id = c.id
  ),
  with_facets AS (
    SELECT
      b.cust_id,
      b.party_name,
      b.bal_signed,
      b.unused_advance_pool,
      CASE
        WHEN b.bal_signed > 0.5 THEN 'Dr'
        WHEN b.bal_signed < -0.5 THEN 'Cr'
        ELSE 'Settled'
      END AS dir_label,
      ROUND((b.bal_signed - b.unused_advance_pool)::numeric, 2) AS net_pos
    FROM balances b
  )
  SELECT
    wf.cust_id,
    wf.party_name,
    wf.bal_signed,
    wf.unused_advance_pool,
    wf.dir_label,
    wf.net_pos,
    ROUND(COALESCE(SUM(GREATEST(wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(GREATEST(-wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(wf.bal_signed) OVER (), 0)::numeric, 2)
  FROM with_facets wf
  ORDER BY wf.party_name;
$$;

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
  SELECT
    r.out_customer_id,
    r.out_customer_name,
    r.out_signed_balance,
    r.out_advance_available,
    r.out_direction,
    r.out_net_position,
    r.out_total_dr,
    r.out_total_cr,
    r.out_net_receivable
  FROM public._get_customer_party_balances_rows(p_organization_id) AS r;
END;
$$;

COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid) IS
  'Internal set-based balance rows. signed_balance = SUM(reconcile_customer_balance components).';

COMMENT ON FUNCTION public.get_customer_party_balances(uuid) IS
  'Set-based customer balance list. signed_balance = get_customer_true_outstanding. '
  'Invoice CTEs use valid_sales; sale receipts use deleted_at-only sales (canonical receipt EXISTS).';

GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_party_balances(uuid) TO authenticated, service_role;

-- =============================================================================
-- Post-apply parity smoke (ELLA NOOR 3fdca631-1e0c-4417-9704-421f5129ff67)
-- Must return zero rows. Full script: scripts/verify-customer-party-balances-parity.sql
-- =============================================================================
-- WITH party AS (
--   SELECT customer_id, signed_balance, advance_available
--   FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
-- ),
-- canonical AS (
--   SELECT c.id AS customer_id,
--     public.get_customer_true_outstanding(c.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)::numeric AS calculated_balance,
--     public._customer_advance_available(c.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)::numeric AS canon_advance
--   FROM public.customers c
--   WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AND c.deleted_at IS NULL
-- )
-- SELECT cu.customer_name, p.signed_balance, c.calculated_balance,
--   ROUND(p.signed_balance - c.calculated_balance, 2) AS drift
-- FROM party p
-- JOIN canonical c ON c.customer_id = p.customer_id
-- JOIN public.customers cu ON cu.id = p.customer_id
-- WHERE ABS(p.signed_balance - c.calculated_balance) > 0.01
--    OR ABS(COALESCE(p.advance_available, 0) - COALESCE(c.canon_advance, 0)) > 0.01;
