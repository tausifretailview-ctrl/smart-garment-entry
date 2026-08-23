-- Phase B: clarify customer balance SQL semantics for unified UI.
--
-- Problem:
--   outstanding_dr / signed_balance = signed net receivable (SUM reconcile components,
--   including unused_advances as negative). Unused advance is ALSO returned separately.
--   Party net_position wrongly computed as signed − advance (double-subtracts advance).
--   UI gross invoice outstanding = signed + advance_available (Aafra recovery).
--
-- Fix:
--   1) Add gross_outstanding_dr + net_position to financial snapshot RPCs.
--   2) net_position := signed net (= outstanding_dr), NOT signed − advance.
--   3) gross_outstanding_dr := signed net + advance_available.
--
-- outstanding_dr is kept unchanged (signed net) for backward compatibility.

-- ---------------------------------------------------------------------------
-- 1) Single-customer snapshot
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_customer_financial_snapshot(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_customer_financial_snapshot(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
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
SET search_path = public
AS $$
DECLARE
  v_signed numeric;
  v_advance numeric;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF auth.role() = 'authenticated'
     AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
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

  v_signed := public.get_customer_true_outstanding(p_customer_id, p_organization_id)::numeric;
  v_advance := public._customer_advance_available(p_customer_id, p_organization_id)::numeric;

  RETURN QUERY
  SELECT
    v_signed AS outstanding_dr,
    v_advance AS advance_available,
    cn.cn_available_total,
    cn.cn_pending_count,
    ROUND((v_signed + GREATEST(v_advance, 0::numeric))::numeric, 2) AS gross_outstanding_dr,
    ROUND(v_signed::numeric, 2) AS net_position
  FROM public._customer_cn_available_total(p_customer_id, p_organization_id) AS cn;
END;
$$;

COMMENT ON FUNCTION public.get_customer_financial_snapshot(uuid, uuid) IS
  'Customer headline numbers. outstanding_dr / net_position = signed net receivable '
  '(get_customer_true_outstanding). gross_outstanding_dr = invoice+OB outstanding before '
  'netting unused advance (= outstanding_dr + advance_available). advance_available is unused pool.';

-- ---------------------------------------------------------------------------
-- 2) Batch snapshot (pickers)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_customer_financial_snapshot_batch(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.get_customer_financial_snapshot_batch(
  p_organization_id uuid,
  p_customer_ids uuid[]
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
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF auth.role() = 'authenticated'
     AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF p_customer_ids IS NULL OR array_length(p_customer_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_cid IN ARRAY p_customer_ids
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.id = v_cid
        AND c.organization_id = p_organization_id
        AND c.deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    SELECT
      v_cid,
      s.outstanding_dr,
      s.advance_available,
      s.cn_available_total,
      s.cn_pending_count,
      s.gross_outstanding_dr,
      s.net_position
    FROM public.get_customer_financial_snapshot(v_cid, p_organization_id) AS s;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_customer_financial_snapshot_batch(uuid, uuid[]) IS
  'Batch wrapper for customer pickers; same columns as get_customer_financial_snapshot per id.';

-- ---------------------------------------------------------------------------
-- 3) Set-based org snapshot (whole-org callers)
-- ---------------------------------------------------------------------------
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
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF auth.role() = 'authenticated'
     AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
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
  receipt_payments AS (
    SELECT u.cust_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id AS cust_id,
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
        )
      UNION ALL
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
        AND ve.reference_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2
          WHERE s2.id::text = ve.reference_id::text
            AND s2.organization_id = p_organization_id
        )
        AND NOT (
          lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        )
    ) u
    GROUP BY u.cust_id
  ),
  paid_at_sale_drift AS (
    SELECT sub.cust_id, COALESCE(SUM(sub.drift), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id AS cust_id,
        GREATEST(
          0::numeric,
          GREATEST(COALESCE(s.paid_amount, 0),
                   GREATEST(COALESCE(s.cash_amount, 0), 0)
                   + GREATEST(COALESCE(s.card_amount, 0), 0)
                   + GREATEST(COALESCE(s.upi_amount, 0), 0))
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
      FROM valid_sales s
      WHERE (
        GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      ) > 0.005
         OR (
           COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0) <= 0.005
           AND COALESCE(s.paid_amount, 0) > 0.005
         )
    ) sub
    WHERE sub.drift > 0
    GROUP BY sub.cust_id
  ),
  pending_sale_returns AS (
    SELECT
      sr.customer_id,
      COALESCE(SUM(
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
      ), 0)::numeric AS amt
    FROM public.sale_returns sr
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
        COALESCE(cat.total_amount, 0) - COALESCE(cat.total_used, 0) - COALESCE(crt.total_refunds, 0)
      )::numeric AS unused_pool
    FROM customer_advance_totals cat
    FULL OUTER JOIN customer_advance_refund_totals crt ON crt.cust_id = cat.cust_id
  ),
  cn_totals AS (
    SELECT
      e.customer_id,
      COALESCE(SUM(e.row_available), 0)::numeric AS cn_available_total,
      COALESCE(COUNT(*) FILTER (WHERE e.row_available > 0.01), 0)::integer AS cn_pending_count
    FROM (
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
        AND lower(COALESCE(sr.credit_status, '')) NOT IN ('refunded')
        AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
        AND (
          lower(COALESCE(sr.credit_status, '')) IN (
            'pending', 'partially_adjusted', 'adjusted_outstanding'
          )
          OR (
            lower(COALESCE(sr.credit_status, '')) = 'adjusted'
            AND sr.linked_sale_id IS NULL
          )
        )
    ) e
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
  'Set-based org snapshot with explicit gross_outstanding_dr and net_position facets. '
  'outstanding_dr = net_position = signed net; gross_outstanding_dr = outstanding_dr + advance_available.';

-- ---------------------------------------------------------------------------
-- 4) Party balances — fix net_position (was signed − advance, double-subtract)
-- ---------------------------------------------------------------------------
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
  receipt_payments AS (
    SELECT u.cust_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id AS cust_id,
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
        )
      UNION ALL
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
        AND ve.reference_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2
          WHERE s2.id::text = ve.reference_id::text
            AND s2.organization_id = p_organization_id
        )
        AND NOT (
          lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        )
    ) u
    GROUP BY u.cust_id
  ),
  paid_at_sale_drift AS (
    SELECT sub.cust_id, COALESCE(SUM(sub.drift), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id AS cust_id,
        GREATEST(
          0::numeric,
          GREATEST(COALESCE(s.paid_amount, 0),
                   GREATEST(COALESCE(s.cash_amount, 0), 0)
                   + GREATEST(COALESCE(s.card_amount, 0), 0)
                   + GREATEST(COALESCE(s.upi_amount, 0), 0))
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
      FROM valid_sales s
      WHERE (
        GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      ) > 0.005
         OR (
           COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0) <= 0.005
           AND COALESCE(s.paid_amount, 0) > 0.005
         )
    ) sub
    WHERE sub.drift > 0
    GROUP BY sub.cust_id
  ),
  pending_sale_returns AS (
    SELECT
      sr.customer_id,
      COALESCE(SUM(
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
      ), 0)::numeric AS amt
    FROM public.sale_returns sr
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
        COALESCE(cat.total_amount, 0) - COALESCE(cat.total_used, 0) - COALESCE(crt.total_refunds, 0)
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
      ROUND(b.bal_signed::numeric, 2) AS net_pos
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

COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid) IS
  'Party balance rows. signed_balance = signed net. net_position = signed net (NOT signed − advance). '
  'UI gross outstanding = signed_balance + advance_available.';

REVOKE EXECUTE ON FUNCTION public.get_customer_financial_snapshot(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_financial_snapshot(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_customer_financial_snapshot_batch(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_financial_snapshot_batch(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot_batch(uuid, uuid[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_customer_financial_snapshot_all(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_financial_snapshot_all(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot_all(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) TO authenticated, service_role;
