-- Component-by-component: CANONICAL (reconcile_customer_balance) vs PARTY RPC CTEs for one customer.
-- Shumama Baireli: 224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9
-- Org ELLA NOOR: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Run AFTER 20260910120000_fix_party_balances_cn_receipt_double_count.sql

WITH params AS (
  SELECT
    '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid AS customer_id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
canonical AS (
  SELECT r.source AS component, r.amount AS signed_amount
  FROM params p
  CROSS JOIN LATERAL public.reconcile_customer_balance(p.customer_id, p.org_id) r
),
party_row AS (
  SELECT *
  FROM params p
  CROSS JOIN LATERAL (
    SELECT pb.*
    FROM public._get_customer_party_balances_rows(p.org_id) pb
    WHERE pb.out_customer_id = p.customer_id
  ) x
),
-- Recompute party components for this customer only (mirrors _get_customer_party_balances_rows)
party_parts AS (
  SELECT 'opening_balance'::text AS component,
         COALESCE(c.opening_balance, 0)::numeric AS signed_amount
  FROM params p
  JOIN public.customers c ON c.id = p.customer_id AND c.organization_id = p.org_id
  UNION ALL
  SELECT 'balance_adjustment', COALESCE(SUM(cba.outstanding_difference), 0)
  FROM params p
  JOIN public.customer_balance_adjustments cba
    ON cba.customer_id = p.customer_id AND cba.organization_id = p.org_id
  UNION ALL
  SELECT 'total_invoiced', COALESCE(SUM(s.net_amount), 0)
  FROM params p
  JOIN public.sales s ON s.customer_id = p.customer_id AND s.organization_id = p.org_id
    AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  UNION ALL
  SELECT 'sale_return_adjust_on_invoices', -COALESCE(SUM(
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
  UNION ALL
  SELECT 'receipt_payments', -COALESCE(SUM(rp.amt), 0)
  FROM params p
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(u.amt), 0) AS amt
    FROM (
      SELECT GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amt
      FROM public.voucher_entries ve
      INNER JOIN public.sales s ON s.id::text = ve.reference_id::text
        AND s.customer_id = p.customer_id AND s.organization_id = p.org_id AND s.deleted_at IS NULL
      WHERE ve.organization_id = p.org_id AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
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
      UNION ALL
      SELECT GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      FROM public.voucher_entries ve
      WHERE ve.organization_id = p.org_id AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND trim(ve.reference_id::text) = trim(p.customer_id::text)
        AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text)
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
    ) u
  ) rp
  UNION ALL
  SELECT 'pending_sale_returns', -COALESCE(SUM(GREATEST(0::numeric,
    COALESCE(sr.net_amount, 0) - COALESCE(ls.sale_return_adjust, 0))), 0)
  FROM params p
  JOIN public.sale_returns sr ON sr.customer_id = p.customer_id AND sr.organization_id = p.org_id
    AND sr.deleted_at IS NULL AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
  LEFT JOIN public.sales ls ON ls.id = sr.linked_sale_id AND ls.organization_id = p.org_id AND ls.deleted_at IS NULL
  UNION ALL
  SELECT 'credit_note_vouchers', -COALESCE(SUM(GREATEST(0::numeric,
    COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0)
  FROM params p
  JOIN public.voucher_entries ve ON ve.organization_id = p.org_id AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND ve.reference_id = p.customer_id
  UNION ALL
  SELECT 'advances_applied', -COALESCE(SUM(ca.used_amount), 0)
  FROM params p
  JOIN public.customer_advances ca ON ca.customer_id = p.customer_id AND ca.organization_id = p.org_id
  UNION ALL
  SELECT 'unused_advances', -GREATEST(0::numeric,
    COALESCE(SUM(ca.amount), 0) - COALESCE(SUM(ca.used_amount), 0) - COALESCE((
      SELECT SUM(ar.refund_amount) FROM public.advance_refunds ar
      INNER JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
      WHERE ca2.customer_id = p.customer_id AND ca2.organization_id = p.org_id
    ), 0))
  FROM params p
  JOIN public.customer_advances ca ON ca.customer_id = p.customer_id AND ca.organization_id = p.org_id
)
SELECT
  COALESCE(c.component, pp.component) AS component,
  c.signed_amount AS canonical_signed,
  pp.signed_amount AS party_signed,
  ROUND(COALESCE(pp.signed_amount, 0) - COALESCE(c.signed_amount, 0), 2) AS party_minus_canonical
FROM canonical c
FULL OUTER JOIN party_parts pp ON pp.component = c.component
ORDER BY 1;

-- Totals + drift
SELECT
  public.get_customer_true_outstanding(
    '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) AS canonical_balance,
  pb.out_signed_balance AS party_balance,
  ROUND(
    pb.out_signed_balance - public.get_customer_true_outstanding(
      '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid,
      '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    ),
    2
  ) AS drift
FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) pb
WHERE pb.out_customer_id = '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9'::uuid;
