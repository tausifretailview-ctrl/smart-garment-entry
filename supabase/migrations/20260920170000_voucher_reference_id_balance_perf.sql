-- Perf: voucher_entries.reference_id uuid joins + one-pass sale receipt totals.
-- Step 1 diagnostics: scripts/diagnose-customer-party-balances-timeout.sql
-- Existing: idx_voucher_entries_org_type_ref (organization_id, voucher_type, reference_id).
-- Adds reference_id index; replaces paid_at_sale_drift correlated subqueries.
-- Replaces stale _get_customer_party_balances_rows(uuid,text) from 20260920113000 with
-- 202612 leftover-CN body + p_search + perf.

CREATE INDEX IF NOT EXISTS idx_voucher_entries_reference_id
  ON public.voucher_entries(reference_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public._org_sale_receipt_settlement_by_sale(p_organization_id uuid)
RETURNS TABLE (
  sale_id uuid,
  settled_amt numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ve.reference_id AS sale_id,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0)::numeric AS settled_amt
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY ve.reference_id;
$$;

COMMENT ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) IS
  'Per-sale receipt settlement totals (memo-excluded). Index-friendly reference_id uuid.';

REVOKE ALL ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public._get_customer_party_balances_rows(uuid);

CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows(p_organization_id uuid, p_search text DEFAULT NULL)
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
      AND (
        COALESCE(NULLIF(btrim(p_search), ''), '') = ''
        OR c.customer_name ILIKE '%' || btrim(p_search) || '%'
        OR COALESCE(c.phone, '') ILIKE '%' || btrim(p_search) || '%'
      )
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
      AND s.customer_id IN (SELECT id FROM cust)
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
      ve.reference_id AS ref_id,
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
      INNER JOIN org_sales_ref osr ON osr.sale_id = rvb.ref_id
      UNION ALL
      SELECT c.id AS cust_id, rvb.amt
      FROM receipt_voucher_base rvb
      INNER JOIN cust c ON c.id = rvb.ref_id
      WHERE rvb.ref_type = 'customer'
        AND NOT EXISTS (
          SELECT 1 FROM org_sales_ref osr2 WHERE osr2.sale_id = rvb.ref_id
        )
    ) u
    WHERE u.cust_id IS NOT NULL
    GROUP BY u.cust_id
  ),
  sale_receipt_settlement AS (
    SELECT * FROM public._org_sale_receipt_settlement_by_sale(p_organization_id)
  ),
  sale_drift_rows AS (
    SELECT
      s.customer_id,
      GREATEST(
        0::numeric,
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
        - COALESCE(srs.settled_amt, 0)
      )::numeric AS drift
    FROM valid_sales s
    LEFT JOIN sale_receipt_settlement srs ON srs.sale_id = s.id
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
      rem.out_customer_id AS customer_id,
      COALESCE(SUM(rem.remaining), 0)::numeric AS amt
    FROM public._org_sale_return_balance_remaining(p_organization_id) rem
    WHERE rem.remaining > 0.005
    GROUP BY rem.out_customer_id
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
        + COALESCE(cpr.amt, 0)
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

COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid, text) IS
  'Set-based party balances (202612 CN/refund sign). paid_at_sale_drift via _org_sale_receipt_settlement_by_sale.';

REVOKE ALL ON FUNCTION public._get_customer_party_balances_rows(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid, text) TO authenticated, service_role;

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
  IF auth.role() = 'anon'
     OR (
       auth.role() = 'authenticated'
       AND NOT (
         p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
       )
     ) THEN
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
    FROM public.sale_items si
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ) ig ON ig.sale_id = s.id
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
    'voucher_entries receipt (cash/UPI/card; excl advance/CN memo applications)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    AND (
      EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND s.customer_id = p_customer_id
          AND s.id = ve.reference_id
      )
      OR (
        lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND ve.reference_id = p_customer_id
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id
        )
      )
    );

  RETURN QUERY
  SELECT
    'paid_at_sale_drift'::text,
    (-COALESCE(SUM(sub.drift), 0))::numeric,
    'POS cash/UPI tender minus receipt vouchers (excl advance-only paid_amount)'::text
  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      - COALESCE(srt.settled_amt, 0)
    ) AS drift
    FROM public.sales s
    LEFT JOIN public._org_sale_receipt_settlement_by_sale(p_organization_id) srt
      ON srt.sale_id = s.id
    WHERE s.customer_id = p_customer_id
      AND s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
      AND (
        GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      ) > 0.005
  ) sub
  WHERE sub.drift > 0;

  RETURN QUERY
  SELECT
    'pending_sale_returns'::text,
    (-public._customer_sale_return_credit_total(p_customer_id, p_organization_id))::numeric,
    'sale_returns remaining credit (CAB remainder + refunded leftover after all-invoice SRA)'::text;

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
    AND ve.reference_id = p_customer_id;

  RETURN QUERY
  SELECT
    'customer_payment_refunds'::text,
    (COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0))::numeric,
    'voucher_entries type=payment ref=customer (increases outstanding; leftover CN offsets)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND ve.reference_id = p_customer_id;

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

REVOKE ALL ON FUNCTION public.reconcile_customer_balance(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_balance(uuid, uuid) TO authenticated, service_role;

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
  IF auth.role() = 'anon'
     OR (
       auth.role() = 'authenticated'
       AND NOT (
         p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
       )
     ) THEN
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
      ve.reference_id AS ref_id,
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
      INNER JOIN org_sales_ref osr ON osr.sale_id = rvb.ref_id
      UNION ALL
      SELECT c.id AS cust_id, rvb.amt
      FROM receipt_voucher_base rvb
      INNER JOIN cust c ON c.id = rvb.ref_id
      WHERE rvb.ref_type = 'customer'
        AND NOT EXISTS (
          SELECT 1 FROM org_sales_ref osr2 WHERE osr2.sale_id = rvb.ref_id
        )
    ) u
    WHERE u.cust_id IS NOT NULL
    GROUP BY u.cust_id
  ),
  sale_receipt_settlement AS (
    SELECT * FROM public._org_sale_receipt_settlement_by_sale(p_organization_id)
  ),
  sale_drift_rows AS (
    SELECT
      s.customer_id,
      GREATEST(
        0::numeric,
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
        - COALESCE(srs.settled_amt, 0)
      )::numeric AS drift
    FROM valid_sales s
    LEFT JOIN sale_receipt_settlement srs ON srs.sale_id = s.id
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
      rem.out_customer_id AS customer_id,
      COALESCE(SUM(rem.remaining), 0)::numeric AS amt
    FROM public._org_sale_return_balance_remaining(p_organization_id) rem
    WHERE rem.remaining > 0.005
    GROUP BY rem.out_customer_id
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
        + COALESCE(cpr.amt, 0)
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
    ROUND(b.bal_signed::numeric, 2),
    ROUND(b.unused_advance_pool::numeric, 2),
    COALESCE(ct.cn_available_total, 0)::numeric,
    COALESCE(ct.cn_pending_count, 0)::integer,
    ROUND((b.bal_signed + GREATEST(b.unused_advance_pool, 0::numeric))::numeric, 2),
    ROUND(b.bal_signed::numeric, 2)
  FROM balances b
  LEFT JOIN cn_totals ct ON ct.customer_id = b.cust_id
  ORDER BY b.cust_id;
END;
$$;

COMMENT ON FUNCTION public.get_customer_financial_snapshot_all(uuid) IS
  'Set-based org snapshot. paid_at_sale_drift via _org_sale_receipt_settlement_by_sale.';

REVOKE ALL ON FUNCTION public.get_customer_financial_snapshot_all(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_financial_snapshot_all(uuid) TO authenticated, service_role;

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
  SELECT *
  FROM public._get_customer_party_balances_rows(p_organization_id, NULL::text);
$$;

COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid) IS
  'Full-org party rows; delegates to (uuid, text) with NULL search.';

REVOKE ALL ON FUNCTION public._get_customer_party_balances_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) TO authenticated, service_role;

