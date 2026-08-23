-- Fix CN receipt double-count in party balances v2 + reconcile_customer_balance.
--
-- Farhaan Fab reconcile breakdown (prod 2026-08-23):
--   total_invoiced +17300, sale_return_adjust -2700, receipt_payments -17300, pending_sr -100
--   Sum = -2800 (wrong). CN adjust receipt ₹2700 counted as cash AND in sale_return_adjust.
--   Exclude credit_note_adjustment memo receipts (matches JS isReceiptMemoApplicationLedgerAligned).
--
-- Also retains v2 partial-CN fix via _sale_return_remaining_credit_for_balance (20260823160000).

CREATE OR REPLACE FUNCTION public._is_settlement_memo_receipt(
  p_payment_method text,
  p_description text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    lower(COALESCE(p_payment_method, '')) IN ('advance_adjustment', 'credit_note_adjustment')
    OR lower(trim(COALESCE(p_description, ''))) LIKE 'adjusted from advance balance%'
    OR lower(trim(COALESCE(p_description, ''))) LIKE 'advance applied to %'
    OR lower(trim(COALESCE(p_description, ''))) LIKE 'credit note adjusted against invoice%'
    OR lower(trim(COALESCE(p_description, ''))) LIKE 'credit note %->%'
    OR lower(trim(COALESCE(p_description, ''))) LIKE 'credit note %' || chr(8594) || '%'
    OR lower(trim(COALESCE(p_description, ''))) LIKE 'credit note from sale return%'
    OR lower(trim(COALESCE(p_description, ''))) LIKE '%credit note adjusted%'
    OR lower(trim(COALESCE(p_description, ''))) LIKE '%cn adjusted%';
$$;

COMMENT ON FUNCTION public._is_settlement_memo_receipt(text, text) IS
  'True for advance/CN application receipt memos — excluded from cash settlement totals.';

REVOKE ALL ON FUNCTION public._is_settlement_memo_receipt(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_settlement_memo_receipt(text, text) TO authenticated, service_role;

-- Patch reconcile receipt_payments only (pending_sr fix from 20260822150000 stays).
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
    'POS cash/UPI tender minus receipt vouchers (excl advance-only paid_amount)'::text
  FROM (
    SELECT GREATEST(
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
    ) AS drift
    FROM public.sales s
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
    'sale_returns remaining credit (pending/partially_adjusted/adjusted remainder)'::text;

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

GRANT EXECUTE ON FUNCTION public.reconcile_customer_balance(uuid, uuid) TO authenticated, service_role;

-- v2 party balances (partial CN + exclude CN memo receipts):

CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows_v2(p_organization_id uuid)
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
  valid_sales AS (
    SELECT s.*
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
  ),
  items_gross AS (
    SELECT
      si.sale_id,
      SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
    FROM public.sale_items si
    INNER JOIN valid_sales s2 ON s2.id = si.sale_id
    WHERE si.deleted_at IS NULL
      AND COALESCE(s2.sale_return_adjust, 0) > 0
    GROUP BY si.sale_id
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
  sale_receipts AS (
    SELECT
      ve.reference_id::text AS sale_ref,
      SUM(
        GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      )::numeric AS amt_all,
      SUM(
        GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      ) FILTER (
        WHERE NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
      )::numeric AS amt_excl_memo
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    GROUP BY ve.reference_id::text
  ),
  receipt_payments AS (
    SELECT u.cust_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id AS cust_id,
        COALESCE(sr.amt_excl_memo, 0)::numeric AS amt
      FROM public.sales s
      INNER JOIN sale_receipts sr ON sr.sale_ref = s.id::text
      WHERE s.organization_id = p_organization_id
        AND s.deleted_at IS NULL
        AND s.customer_id IS NOT NULL
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
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
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
          - COALESCE(sr.amt_all, 0)
        ) AS drift
      FROM valid_sales s
      LEFT JOIN sale_receipts sr ON sr.sale_ref = s.id::text
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

COMMENT ON FUNCTION public._get_customer_party_balances_rows_v2(uuid) IS
  'Party balances v2: remaining CN credit + exclude CN/advance memo receipts from cash totals.';

REVOKE EXECUTE ON FUNCTION public._get_customer_party_balances_rows_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._get_customer_party_balances_rows_v2(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows_v2(uuid) TO authenticated, service_role;
