-- Port party SSOT receipt / pending-SR fixes (20261126120000) into
-- get_customer_financial_snapshot_all (20261117). Same helpers — no new formula:
--   _is_settlement_memo_receipt on receipt_payments + paid_at_sale_drift
--   _sale_return_remaining_credit_for_balance on pending_sale_returns
--
-- Closes CN-memo double-count (e.g. SHUMAMA BAIRELI ₹61,900 drift vs party/reconcile).
--
-- LOVABLE: Run this ENTIRE file in ONE execution (DROP + CREATE + GRANT together).
-- If you already ran DROP alone and smoke fails with "function does not exist",
-- run from CREATE OR REPLACE below through GRANT (skip the DROP line).
-- Verify first: scripts/verify-snapshot-all-function-exists.sql → snapshot_all_exists = true

DROP FUNCTION IF EXISTS public.get_customer_financial_snapshot_all(uuid);

CREATE OR REPLACE FUNCTION public.get_customer_financial_snapshot_all(
  p_organization_id uuid
)
RETURNS TABLE (
  customer_id uuid,
  outstanding_dr numeric,
  advance_available numeric,
  cn_available_total numeric,
  cn_pending_count integer,
  gross_outstanding_dr numeric,
  net_position numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  RETURN QUERY
  WITH
  cust AS (
    SELECT
      c.id,
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
  org_sales_ref AS (
    SELECT
      s.id AS sale_id,
      trim(s.id::text) AS ref_trim,
      s.customer_id
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
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
  receipt_voucher_base AS (
    SELECT
      trim(COALESCE(ve.reference_id::text, '')) AS ref_trim,
      lower(COALESCE(ve.reference_type, '')) AS ref_type,
      GREATEST(
        0::numeric,
        COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
      )::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND trim(COALESCE(ve.reference_id::text, '')) <> ''
      AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  ),
  receipt_payments AS (
    SELECT u.cust_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT osr.customer_id AS cust_id, rvb.amt
      FROM receipt_voucher_base rvb
      INNER JOIN org_sales_ref osr ON osr.ref_trim = rvb.ref_trim
      UNION ALL
      SELECT c.id AS cust_id, rvb.amt
      FROM receipt_voucher_base rvb
      INNER JOIN cust c ON rvb.ref_trim = trim(c.id::text)
      WHERE rvb.ref_type = 'customer'
        AND NOT EXISTS (
          SELECT 1 FROM org_sales_ref osr2 WHERE osr2.ref_trim = rvb.ref_trim
        )
    ) u
    WHERE u.cust_id IS NOT NULL
    GROUP BY u.cust_id
  ),
  paid_at_sale_drift AS (
    SELECT
      sub.customer_id AS cust_id,
      COALESCE(SUM(sub.drift), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id,
        GREATEST(
          0::numeric,
          GREATEST(COALESCE(s.cash_amount, 0), 0)
            + GREATEST(COALESCE(s.card_amount, 0), 0)
            + GREATEST(COALESCE(s.upi_amount, 0), 0)
          - COALESCE((
            SELECT SUM(
              GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
            )
            FROM public.voucher_entries ve
            WHERE ve.organization_id = p_organization_id
              AND ve.deleted_at IS NULL
              AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
              AND ve.reference_id::text = s.id::text
              AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          ), 0)
        )::numeric AS drift
      FROM valid_sales s
      WHERE (
        GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      ) > 0.005
    ) sub
    WHERE sub.drift > 0
    GROUP BY sub.customer_id
  ),
  pending_sale_returns AS (
    SELECT
      sr.customer_id,
      COALESCE(SUM(row_credit), 0)::numeric AS amt
    FROM (
      SELECT
        sr.customer_id,
        public._sale_return_remaining_credit_for_balance(
          sr.net_amount,
          sr.credit_available_balance,
          COALESCE(ls.sale_return_adjust, 0)
        ) AS row_credit
      FROM public.sale_returns sr
      LEFT JOIN public.sales ls
        ON ls.id = sr.linked_sale_id
       AND ls.organization_id = p_organization_id
       AND ls.deleted_at IS NULL
      WHERE sr.organization_id = p_organization_id
        AND sr.deleted_at IS NULL
        AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('refunded')
        AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
    ) sr
    WHERE sr.row_credit > 0.005
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
  cn_eligible AS (
    SELECT
      sr.customer_id,
      public._customer_cn_pool_row_available(
        sr.net_amount,
        sr.credit_available_balance,
        sr.credit_note_id,
        cn.credit_amount,
        cn.used_amount
      ) AS row_available
    FROM public.sale_returns sr
    LEFT JOIN public.credit_notes cn
      ON cn.id = sr.credit_note_id
     AND cn.organization_id = p_organization_id
     AND cn.deleted_at IS NULL
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.customer_id IS NOT NULL
      AND lower(COALESCE(sr.credit_status, '')) NOT IN ('refunded')
      AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
      AND (
        lower(COALESCE(sr.credit_status, '')) IN (
          'pending',
          'partially_adjusted',
          'adjusted_outstanding'
        )
        OR (
          lower(COALESCE(sr.credit_status, '')) = 'adjusted'
          AND sr.linked_sale_id IS NULL
        )
      )
  ),
  cn_totals AS (
    SELECT
      e.customer_id,
      COALESCE(SUM(e.row_available), 0)::numeric AS cn_available_total,
      COALESCE(COUNT(*) FILTER (WHERE e.row_available > 0.01), 0)::integer AS cn_pending_count
    FROM cn_eligible e
    GROUP BY e.customer_id
  ),
  active_ids AS (
    SELECT DISTINCT x.id
    FROM (
      SELECT c.id FROM cust c WHERE c.opening_balance <> 0
      UNION
      SELECT vs.customer_id FROM valid_sales vs
      UNION
      SELECT ca.cust_id FROM customer_advance_totals ca
      UNION
      SELECT sr.customer_id
      FROM public.sale_returns sr
      WHERE sr.organization_id = p_organization_id
        AND sr.deleted_at IS NULL
        AND sr.customer_id IS NOT NULL
      UNION
      SELECT cba.customer_id FROM balance_adjustment cba
      UNION
      SELECT ve.reference_id::uuid
      FROM public.voucher_entries ve
      WHERE ve.organization_id = p_organization_id
        AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND ve.reference_id IS NOT NULL
    ) x
    WHERE x.id IS NOT NULL
  ),
  balances AS (
    SELECT
      c.id AS cust_id,
      (
        c.opening_balance
        + COALESCE(ba.amt, 0)
        + COALESCE(ti.amt, 0)
        - COALESCE(sra.amt, 0)
        - COALESCE(rp.amt, 0)
        - COALESCE(psd.amt, 0)
        - COALESCE(psr.amt, 0)
        - COALESCE(cnv.amt, 0)
        - COALESCE(cpr.amt, 0)
        - COALESCE(cap.total_used, 0)
        - COALESCE(cap.unused_pool, 0)
      )::numeric AS bal_signed,
      COALESCE(cap.unused_pool, 0)::numeric AS unused_advance_pool
    FROM cust c
    INNER JOIN active_ids a ON a.id = c.id
    LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
    LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
    LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
    LEFT JOIN receipt_payments rp ON rp.cust_id = c.id
    LEFT JOIN paid_at_sale_drift psd ON psd.cust_id = c.id
    LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
    LEFT JOIN credit_note_vouchers cnv ON cnv.customer_id = c.id
    LEFT JOIN customer_payment_refunds cpr ON cpr.customer_id = c.id
    LEFT JOIN customer_advance_pools cap ON cap.cust_id = c.id
  )
  SELECT
    b.cust_id,
    ROUND(b.bal_signed::numeric, 2) AS outstanding_dr,
    ROUND(b.unused_advance_pool::numeric, 2) AS advance_available,
    COALESCE(ct.cn_available_total, 0)::numeric AS cn_available_total,
    COALESCE(ct.cn_pending_count, 0)::integer AS cn_pending_count,
    ROUND((b.bal_signed + GREATEST(b.unused_advance_pool, 0::numeric))::numeric, 2) AS gross_outstanding_dr,
    ROUND(b.bal_signed::numeric, 2) AS net_position
  FROM balances b
  LEFT JOIN cn_totals ct ON ct.customer_id = b.cust_id
  ORDER BY b.cust_id;
END;
$$;

COMMENT ON FUNCTION public.get_customer_financial_snapshot_all(uuid) IS
  'Set-based org snapshot. Receipts exclude CN/advance memos via _is_settlement_memo_receipt '
  '(parity with _get_customer_party_balances_rows 20261126). pending_sr uses '
  '_sale_return_remaining_credit_for_balance. CN pool via _customer_cn_pool_row_available.';

REVOKE ALL ON FUNCTION public.get_customer_financial_snapshot_all(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot_all(uuid) TO authenticated, service_role;
