-- Component breakdown: CANONICAL vs PARTY for KS Footwear POS drift customers.
-- Run AFTER 20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql
--
-- VAVIA SHOES-MALAD E: a5727aac-8f3a-41c9-a8a5-f4af37ba160f
-- JOHNSON ENTERPRISES MIRA-ROAD: 970cffc5-4d1e-4ac0-bf4a-70d4188f5690
-- KS FOOTWEAR org: 4bc73037-e877-4123-9261-eb6e3876698c

WITH params AS (
  SELECT
    unnest(ARRAY[
      'a5727aac-8f3a-41c9-a8a5-f4af37ba160f'::uuid,
      '970cffc5-4d1e-4ac0-bf4a-70d4188f5690'::uuid
    ]) AS customer_id,
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id
),
canonical AS (
  SELECT p.customer_id, r.source AS component, r.amount AS signed_amount
  FROM params p
  CROSS JOIN LATERAL public.reconcile_customer_balance(p.customer_id, p.org_id) r
),
party_parts AS (
  SELECT p.customer_id, 'opening_balance'::text AS component,
         COALESCE(c.opening_balance, 0)::numeric AS signed_amount
  FROM params p
  JOIN public.customers c ON c.id = p.customer_id AND c.organization_id = p.org_id
  UNION ALL
  SELECT p.customer_id, 'balance_adjustment', COALESCE(SUM(cba.outstanding_difference), 0)
  FROM params p
  JOIN public.customer_balance_adjustments cba
    ON cba.customer_id = p.customer_id AND cba.organization_id = p.org_id
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'total_invoiced', COALESCE(SUM(s.net_amount), 0)
  FROM params p
  JOIN public.sales s ON s.customer_id = p.customer_id AND s.organization_id = p.org_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'sale_return_adjust_on_invoices', -COALESCE(SUM(
    CASE
      WHEN COALESCE(ig.gross, 0) > 0 AND COALESCE(s.sale_return_adjust, 0) > 0
           AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
      THEN 0 ELSE COALESCE(s.sale_return_adjust, 0)
    END
  ), 0)
  FROM params p
  JOIN public.sales s ON s.customer_id = p.customer_id AND s.organization_id = p.org_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  LEFT JOIN (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM public.sale_items si WHERE si.deleted_at IS NULL GROUP BY si.sale_id
  ) ig ON ig.sale_id = s.id
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'receipt_payments', -COALESCE(SUM(u.amt), 0)
  FROM params p
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(x.amt), 0) AS amt
    FROM (
      SELECT GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amt
      FROM public.voucher_entries ve
      INNER JOIN public.sales s ON s.id::text = ve.reference_id::text
        AND s.customer_id = p.customer_id AND s.organization_id = p.org_id AND s.deleted_at IS NULL
      WHERE ve.organization_id = p.org_id AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND NOT (
          lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        )
      UNION ALL
      SELECT GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      FROM public.voucher_entries ve
      WHERE ve.organization_id = p.org_id AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND trim(ve.reference_id::text) = trim(p.customer_id::text)
        AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text)
        AND NOT (
          lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        )
    ) x
  ) u
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'paid_at_sale_drift', -COALESCE(SUM(sub.drift), 0)
  FROM params p
  JOIN public.sales s ON s.customer_id = p.customer_id AND s.organization_id = p.org_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  CROSS JOIN LATERAL (
    SELECT GREATEST(
      0::numeric,
      GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      - COALESCE((
        SELECT SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
        FROM public.voucher_entries ve
        WHERE ve.organization_id = p.org_id AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
      ), 0)
    ) AS drift
  ) sub
  WHERE (
    GREATEST(COALESCE(s.cash_amount, 0), 0)
    + GREATEST(COALESCE(s.card_amount, 0), 0)
    + GREATEST(COALESCE(s.upi_amount, 0), 0)
  ) > 0.005 AND sub.drift > 0
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'pending_sale_returns', -COALESCE(SUM(GREATEST(0::numeric,
    COALESCE(sr.net_amount, 0) - COALESCE(ls.sale_return_adjust, 0))), 0)
  FROM params p
  JOIN public.sale_returns sr ON sr.customer_id = p.customer_id AND sr.organization_id = p.org_id
    AND sr.deleted_at IS NULL AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
  LEFT JOIN public.sales ls ON ls.id = sr.linked_sale_id AND ls.organization_id = p.org_id AND ls.deleted_at IS NULL
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'credit_note_vouchers', -COALESCE(SUM(GREATEST(0::numeric,
    COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0)
  FROM params p
  JOIN public.voucher_entries ve ON ve.organization_id = p.org_id AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND ve.reference_id = p.customer_id::text
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'advances_applied', -COALESCE(SUM(ca.used_amount), 0)
  FROM params p
  JOIN public.customer_advances ca ON ca.customer_id = p.customer_id AND ca.organization_id = p.org_id
  GROUP BY p.customer_id
  UNION ALL
  SELECT p.customer_id, 'unused_advances', -GREATEST(0::numeric,
    COALESCE(SUM(ca.amount), 0) - COALESCE(SUM(ca.used_amount), 0) - COALESCE((
      SELECT SUM(ar.refund_amount) FROM public.advance_refunds ar
      INNER JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
      WHERE ca2.customer_id = p.customer_id AND ca2.organization_id = p.org_id
    ), 0))
  FROM params p
  JOIN public.customer_advances ca ON ca.customer_id = p.customer_id AND ca.organization_id = p.org_id
  GROUP BY p.customer_id
)
SELECT
  cu.customer_name,
  COALESCE(c.component, pp.component) AS component,
  c.signed_amount AS canonical_signed,
  pp.signed_amount AS party_mirror_signed,
  ROUND(COALESCE(pp.signed_amount, 0) - COALESCE(c.signed_amount, 0), 2) AS mirror_minus_canonical
FROM canonical c
FULL OUTER JOIN party_parts pp
  ON pp.customer_id = c.customer_id AND pp.component = c.component
JOIN params p ON p.customer_id = COALESCE(c.customer_id, pp.customer_id)
JOIN public.customers cu ON cu.id = p.customer_id
ORDER BY cu.customer_name, 1;


-- Totals + live party RPC drift (post-fix should be 0)
SELECT
  cu.customer_name,
  public.get_customer_true_outstanding(p.customer_id, p.org_id) AS canonical_balance,
  pb.out_signed_balance AS party_balance,
  ROUND(pb.out_signed_balance - public.get_customer_true_outstanding(p.customer_id, p.org_id), 2) AS drift
FROM (
  SELECT 'a5727aac-8f3a-41c9-a8a5-f4af37ba160f'::uuid AS customer_id,
         '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id
  UNION ALL
  SELECT '970cffc5-4d1e-4ac0-bf4a-70d4188f5690'::uuid,
         '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
) p
JOIN public.customers cu ON cu.id = p.customer_id
JOIN public._get_customer_party_balances_rows(p.org_id) pb ON pb.out_customer_id = p.customer_id;


-- Compare OLD trim-aggregate drift vs NEW per-sale exact (pre/post fix diagnostic)
WITH params AS (
  SELECT 'a5727aac-8f3a-41c9-a8a5-f4af37ba160f'::uuid AS customer_id,
         '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id
),
valid_sales AS (
  SELECT s.*
  FROM params p
  JOIN public.sales s ON s.customer_id = p.customer_id AND s.organization_id = p.org_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
),
sale_voucher_receipts_trim AS (
  SELECT trim(COALESCE(ve.reference_id::text, '')) AS sale_ref_trim,
         COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0) AS amt
  FROM params p
  JOIN public.voucher_entries ve ON ve.organization_id = p.org_id
    AND ve.deleted_at IS NULL AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND trim(COALESCE(ve.reference_id::text, '')) <> ''
  GROUP BY trim(COALESCE(ve.reference_id::text, ''))
),
trim_style AS (
  SELECT COALESCE(SUM(GREATEST(0::numeric,
    GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0)
    - COALESCE(svr.amt, 0))), 0) AS drift_amt
  FROM valid_sales s
  LEFT JOIN sale_voucher_receipts_trim svr ON svr.sale_ref_trim = trim(s.id::text)
  WHERE (GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0)) > 0.005
    AND GREATEST(0::numeric,
      GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0)
      - COALESCE(svr.amt, 0)) > 0
),
exact_style AS (
  SELECT COALESCE(SUM(sub.drift), 0) AS drift_amt
  FROM valid_sales s
  CROSS JOIN LATERAL (
    SELECT GREATEST(0::numeric,
      GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0)
      - COALESCE((
        SELECT SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
        FROM public.voucher_entries ve
        WHERE ve.organization_id = (SELECT org_id FROM params)
          AND ve.deleted_at IS NULL AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
      ), 0)) AS drift
  ) sub
  WHERE (GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0)) > 0.005
    AND sub.drift > 0
)
SELECT
  (SELECT drift_amt FROM trim_style) AS old_trim_aggregate_drift,
  (SELECT drift_amt FROM exact_style) AS new_exact_per_sale_drift,
  (SELECT -amount FROM params p, public.reconcile_customer_balance(p.customer_id, p.org_id) r
   WHERE r.source = 'paid_at_sale_drift') AS canonical_paid_at_sale_drift;
