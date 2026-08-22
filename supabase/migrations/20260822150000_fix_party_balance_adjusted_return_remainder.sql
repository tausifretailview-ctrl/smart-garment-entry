-- Customer Balances / reconcile: count remaining sale-return credit after CN apply.
-- Symptom: ELLA NOOR Hanif bhai shows ₹3,200 Dr while true position is ₹3,050 Cr.
-- Cause: SR/26-27/11 is credit_status='adjusted' with ₹3,050 remainder; the balance
-- formula only subtracted returns in status 'pending', so the invoice stayed at
-- ₹3,200 Dr and the return credit was ignored.

CREATE OR REPLACE FUNCTION public._sale_return_remaining_credit_for_balance(
  p_net_amount numeric,
  p_credit_available_balance numeric,
  p_linked_sale_return_adjust numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    0::numeric,
    CASE
      WHEN p_credit_available_balance IS NOT NULL
      THEN p_credit_available_balance
      ELSE COALESCE(p_net_amount, 0) - COALESCE(p_linked_sale_return_adjust, 0)
    END
  );
$$;

COMMENT ON FUNCTION public._sale_return_remaining_credit_for_balance(numeric, numeric, numeric) IS
  'Remaining customer-favour credit from one sale return row for lifetime balance. '
  'Prefers credit_available_balance; else net_amount minus linked invoice sale_return_adjust.';

CREATE OR REPLACE FUNCTION public._customer_sale_return_credit_total(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(row_credit), 0)::numeric
  FROM (
    SELECT
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
    WHERE sr.customer_id = p_customer_id
      AND sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('refunded')
      AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
  ) sub
  WHERE sub.row_credit > 0.005;
$$;

COMMENT ON FUNCTION public._customer_sale_return_credit_total(uuid, uuid) IS
  'Sum of remaining sale-return credit for lifetime outstanding (all non-refunded statuses).';

REVOKE ALL ON FUNCTION public._sale_return_remaining_credit_for_balance(numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._customer_sale_return_credit_total(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._sale_return_remaining_credit_for_balance(numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._customer_sale_return_credit_total(uuid, uuid) TO authenticated, service_role;

-- Patch reconcile_customer_balance pending_sale_returns line only.
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
    'voucher_entries receipt (sale-linked or opening; excl advance_application)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT (
      lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
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
    'POS cash/UPI tender minus receipt vouchers (excl advance-only paid_amount)'::text
  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(
        COALESCE(s.cash_amount, 0), 0)
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

-- Patch party balances CTE (replace pending-only filter with org-wide helper aggregate).
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
      AND NOT (
        lower(COALESCE(ve.payment_method, '')) IN ('advance_adjustment', 'credit_note_adjustment')
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note adjusted against invoice%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %->%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note %' || chr(8594) || '%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'credit note from sale return%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE '%credit note adjusted%'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE '%cn adjusted%'
      )
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

COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid) IS
  'Set-based party balances. Sale-return credit includes adjusted/partially_adjusted remainders.';

GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid) TO authenticated, service_role;
