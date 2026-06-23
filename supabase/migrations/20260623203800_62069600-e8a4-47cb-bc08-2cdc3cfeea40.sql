-- =============================================================================
-- Fix double-counting in receipt_payments CTE:
--   (a) credit_note_adjustment receipts are already accounted for via
--       sales.sale_return_adjust → must NOT be summed in receipt_payments.
--   (b) advance_adjustment receipts are already accounted for via
--       customer_advances.used_amount → must NOT be summed (canonical's
--       reference_type='sale' gate fails because real data uses
--       reference_type='CustomerReceipt'; drop that gate).
-- =============================================================================

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
    SELECT c.id, c.customer_name,
      COALESCE(c.opening_balance, 0)::numeric AS opening_balance
    FROM public.customers c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  items_gross AS (
    SELECT si.sale_id,
      SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
    FROM public.sale_items si
    INNER JOIN public.sales s2 ON s2.id = si.sale_id AND s2.organization_id = p_organization_id
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  valid_sales AS (
    SELECT s.* FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
  ),
  balance_adjustment AS (
    SELECT cba.customer_id, COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
    GROUP BY cba.customer_id
  ),
  total_invoiced AS (
    SELECT s.customer_id, COALESCE(SUM(s.net_amount), 0)::numeric AS amt
    FROM valid_sales s GROUP BY s.customer_id
  ),
  sale_return_adjust AS (
    SELECT s.customer_id,
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
  -- Receipts attached to a sale, excluding advance_adjustment AND credit_note_adjustment
  -- (those are already netted via customer_advances.used_amount and sales.sale_return_adjust).
  sale_receipt_vouchers AS (
    SELECT s.customer_id,
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))::numeric AS amt
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
        lower(COALESCE(ve.payment_method, '')) IN ('advance_adjustment','credit_note_adjustment')
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note adjusted against invoice%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %->%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %' || chr(8594) || '%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note from sale return%'
      )
  ),
  opening_receipt_vouchers AS (
    SELECT ve.reference_id::uuid AS cust_id,
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
      AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text)
      AND NOT (
        lower(COALESCE(ve.payment_method, '')) IN ('advance_adjustment','credit_note_adjustment')
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note adjusted against invoice%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %->%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %' || chr(8594) || '%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note from sale return%'
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
    SELECT ve.reference_id::text AS sale_id,
      COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    GROUP BY ve.reference_id::text
  ),
  sale_drift_rows AS (
    SELECT s.customer_id,
      GREATEST(0::numeric,
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
          - COALESCE(svr.amt, 0)
      )::numeric AS drift
    FROM valid_sales s
    LEFT JOIN sale_voucher_receipts svr ON svr.sale_id = s.id::text
    WHERE (GREATEST(COALESCE(s.cash_amount, 0), 0)
         + GREATEST(COALESCE(s.card_amount, 0), 0)
         + GREATEST(COALESCE(s.upi_amount, 0), 0)) > 0.005
  ),
  paid_at_sale_drift AS (
    SELECT sdr.customer_id AS cust_id, COALESCE(SUM(sdr.drift), 0)::numeric AS amt
    FROM sale_drift_rows sdr WHERE sdr.drift > 0
    GROUP BY sdr.customer_id
  ),
  pending_sale_returns AS (
    SELECT sr.customer_id,
      COALESCE(SUM(GREATEST(0::numeric, COALESCE(sr.net_amount, 0) - COALESCE(ls.sale_return_adjust, 0))), 0)::numeric AS amt
    FROM public.sale_returns sr
    LEFT JOIN public.sales ls ON ls.id = sr.linked_sale_id AND ls.organization_id = p_organization_id AND ls.deleted_at IS NULL
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
    GROUP BY sr.customer_id
  ),
  credit_note_vouchers AS (
    SELECT ve.reference_id::uuid AS customer_id,
      COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    GROUP BY ve.reference_id::uuid
  ),
  customer_payment_refunds AS (
    SELECT ve.reference_id::uuid AS customer_id,
      COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    GROUP BY ve.reference_id::uuid
  ),
  customer_advance_totals AS (
    SELECT ca.customer_id AS cust_id,
      COALESCE(SUM(ca.amount), 0)::numeric AS total_amount,
      COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used
    FROM public.customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  customer_advance_refund_totals AS (
    SELECT ca.customer_id AS cust_id,
      COALESCE(SUM(ar.refund_amount), 0)::numeric AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  customer_advance_pools AS (
    SELECT COALESCE(cat.cust_id, crt.cust_id) AS cust_id,
      COALESCE(cat.total_used, 0)::numeric AS total_used,
      GREATEST(0::numeric, COALESCE(cat.total_amount, 0) - COALESCE(cat.total_used, 0) - COALESCE(crt.total_refunds, 0))::numeric AS unused_pool
    FROM customer_advance_totals cat
    FULL OUTER JOIN customer_advance_refund_totals crt ON crt.cust_id = cat.cust_id
  ),
  balances AS (
    SELECT c.id AS cust_id, c.customer_name AS party_name,
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
    SELECT b.cust_id, b.party_name, b.bal_signed, b.unused_advance_pool,
      CASE WHEN b.bal_signed > 0.5 THEN 'Dr'
           WHEN b.bal_signed < -0.5 THEN 'Cr'
           ELSE 'Settled' END AS dir_label,
      ROUND((b.bal_signed - b.unused_advance_pool)::numeric, 2) AS net_pos
    FROM balances b
  )
  SELECT wf.cust_id, wf.party_name, wf.bal_signed, wf.unused_advance_pool, wf.dir_label, wf.net_pos,
    ROUND(COALESCE(SUM(GREATEST(wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(GREATEST(-wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(wf.bal_signed) OVER (), 0)::numeric, 2)
  FROM with_facets wf
  ORDER BY wf.party_name;
$$;

GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) TO authenticated, service_role;

-- =============================================================================
-- Canonical reconcile_customer_balance: same widened receipt exclusion.
-- Drops the reference_type='sale' gate (real data uses 'CustomerReceipt');
-- the payment_method / description signal is what determines exclusion.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_customer_balance(p_customer_id uuid, p_organization_id uuid)
RETURNS TABLE(source text, amount numeric, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found in organization' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT 'opening_balance'::text,
    COALESCE((SELECT c.opening_balance FROM public.customers c
       WHERE c.id = p_customer_id AND c.organization_id = p_organization_id AND c.deleted_at IS NULL), 0)::numeric,
    'customers.opening_balance'::text;

  RETURN QUERY
  SELECT 'balance_adjustment'::text,
    COALESCE(SUM(cba.outstanding_difference), 0)::numeric,
    'customer_balance_adjustments (sum outstanding_difference)'::text
  FROM public.customer_balance_adjustments cba
  WHERE cba.customer_id = p_customer_id AND cba.organization_id = p_organization_id;

  RETURN QUERY
  SELECT 'total_invoiced'::text,
    COALESCE(SUM(s.net_amount), 0)::numeric,
    'sales.net_amount (excl cancelled/hold)'::text
  FROM public.sales s
  WHERE s.customer_id = p_customer_id AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT 'sale_return_adjust_on_invoices'::text,
    (-COALESCE(SUM(
      CASE
        WHEN COALESCE(ig.gross, 0) > 0
             AND COALESCE(s.sale_return_adjust, 0) > 0
             AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
        THEN 0
        ELSE COALESCE(s.sale_return_adjust, 0)
      END
    ), 0))::numeric,
    'sales.sale_return_adjust gated on items_gross (pre-return / legacy only)'::text
  FROM public.sales s
  LEFT JOIN (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM public.sale_items si WHERE si.deleted_at IS NULL GROUP BY si.sale_id
  ) ig ON ig.sale_id = s.id
  WHERE s.customer_id = p_customer_id AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT 'receipt_payments'::text,
    (-COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0))::numeric,
    'voucher_entries receipt (sale-linked or opening; excl advance/CN adjustments)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT (
      lower(COALESCE(ve.payment_method, '')) IN ('advance_adjustment','credit_note_adjustment')
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note adjusted against invoice%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %->%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %' || chr(8594) || '%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note from sale return%'
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND s.customer_id = p_customer_id
          AND s.id = ve.reference_id
      )
      OR (
        lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND ve.reference_id = p_customer_id
        AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id)
      )
    );

  RETURN QUERY
  SELECT 'paid_at_sale_drift'::text,
    (-COALESCE(SUM(sub.drift), 0))::numeric,
    'POS pay-at-sale minus receipt vouchers on same sale (cash + settlement discount)'::text
  FROM (
    SELECT GREATEST(0::numeric,
      GREATEST(
        COALESCE(s.paid_amount, 0),
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
      )
      - COALESCE((
        SELECT SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
        FROM public.voucher_entries ve
        WHERE ve.organization_id = p_organization_id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id = s.id
      ), 0)
    ) AS drift
    FROM public.sales s
    WHERE s.customer_id = p_customer_id AND s.organization_id = p_organization_id
      AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  ) sub
  WHERE sub.drift > 0;

  RETURN QUERY
  SELECT 'pending_sale_returns'::text,
    (-COALESCE(SUM(GREATEST(0::numeric,
      COALESCE(sr.net_amount, 0) - COALESCE(
        (SELECT s.sale_return_adjust FROM public.sales s
         WHERE s.id = sr.linked_sale_id AND s.organization_id = p_organization_id AND s.deleted_at IS NULL),
        0)
    )), 0))::numeric,
    'sale_returns pending — net of sale_return_adjust already on linked invoice'::text
  FROM public.sale_returns sr
  WHERE sr.customer_id = p_customer_id AND sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending';

  RETURN QUERY
  SELECT 'credit_note_vouchers'::text,
    (-COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0))::numeric,
    'voucher_entries type=credit_note ref=customer'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND ve.reference_id = p_customer_id;

  RETURN QUERY
  SELECT 'customer_payment_refunds'::text,
    (-COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0))::numeric,
    'voucher_entries type=payment ref=customer (reduces receivable)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND ve.reference_id = p_customer_id;

  RETURN QUERY
  SELECT 'advances_applied'::text,
    (-COALESCE(SUM(ca.used_amount), 0))::numeric,
    'customer_advances.used_amount'::text
  FROM public.customer_advances ca
  WHERE ca.customer_id = p_customer_id AND ca.organization_id = p_organization_id;

  RETURN QUERY
  WITH adv AS (
    SELECT COALESCE(SUM(ca.amount), 0) AS total_amount,
           COALESCE(SUM(ca.used_amount), 0) AS total_used
    FROM public.customer_advances ca
    WHERE ca.customer_id = p_customer_id AND ca.organization_id = p_organization_id
  ),
  ref AS (
    SELECT COALESCE(SUM(ar.refund_amount), 0) AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.customer_id = p_customer_id AND ca.organization_id = p_organization_id
  )
  SELECT 'unused_advances'::text,
    (-GREATEST(0::numeric, (SELECT total_amount - total_used FROM adv) - (SELECT total_refunds FROM ref)))::numeric,
    'customer_advances unused net of refunds (matches customerAuditMath)'::text;

  RETURN;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_customer_balance(uuid, uuid) TO authenticated, service_role;