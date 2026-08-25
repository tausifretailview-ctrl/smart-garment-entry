-- =============================================================================
-- ELLA NOOR — Step 6c / 6d / 6e (org-wide). SELECT-only. Do not write paid_amount.
-- Paste ONE section. Same CTE tree; only the final SELECT changes.
-- 6c+6d = headline (one row, includes zero-memo identity counts).
-- 6e = remaining mismatches AFTER including advance_adjustment in receipts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 6d — Org headline (supersedes 717 / 647 / ₹1,10,91,413). Also 6c identity:
--   n_zero_memo_formulas_differ must be 0.
-- -----------------------------------------------------------------------------

WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold
),
cust AS (
  SELECT c.id, c.customer_name, c.phone, COALESCE(c.opening_balance, 0)::numeric AS opening_balance
  FROM public.customers c
  CROSS JOIN params p
  WHERE c.organization_id = p.org_id AND c.deleted_at IS NULL
),
party AS (
  SELECT r.out_customer_id, r.out_signed_balance
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
),
valid_sales AS (
  SELECT s.*
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
    AND s.customer_id IS NOT NULL
),
items_gross AS (
  SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
  FROM public.sale_items si
  INNER JOIN valid_sales s2 ON s2.id = si.sale_id
  WHERE si.deleted_at IS NULL AND COALESCE(s2.sale_return_adjust, 0) > 0
  GROUP BY si.sale_id
),
total_invoiced AS (
  SELECT s.customer_id, COALESCE(SUM(s.net_amount), 0)::numeric AS amt
  FROM valid_sales s GROUP BY s.customer_id
),
sale_return_adjust AS (
  SELECT s.customer_id, COALESCE(SUM(
    CASE
      WHEN COALESCE(ig.gross, 0) > 0
           AND COALESCE(s.sale_return_adjust, 0) > 0
           AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
      THEN 0 ELSE COALESCE(s.sale_return_adjust, 0) END
  ), 0)::numeric AS amt
  FROM valid_sales s
  LEFT JOIN items_gross ig ON ig.sale_id = s.id
  GROUP BY s.customer_id
),
balance_adjustment AS (
  SELECT cba.customer_id, COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
  FROM public.customer_balance_adjustments cba
  CROSS JOIN params p
  WHERE cba.organization_id = p.org_id
  GROUP BY cba.customer_id
),
sale_receipts_per_sale AS (
  SELECT
    s.id AS sale_id,
    s.customer_id,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_type IN ('sale', 'CustomerReceipt')
          AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
      ), 0)::numeric AS receipts_excl_memo,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_type IN ('sale', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS advance_memos,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_type IN ('sale', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND NOT (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS cn_memos
  FROM valid_sales s
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  GROUP BY s.id, s.customer_id
),
sale_receipts_both AS (
  SELECT
    r.customer_id,
    SUM(r.receipts_excl_memo) AS receipts_excl_memo,
    SUM(r.advance_memos) AS advance_memos,
    SUM(r.cn_memos) AS cn_memos
  FROM sale_receipts_per_sale r
  GROUP BY r.customer_id
),
customer_receipts_both AS (
  SELECT
    ve.reference_id AS customer_id,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
          AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
      ), 0)::numeric AS receipts_excl_memo,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS advance_memos,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND NOT (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS cn_memos
  FROM public.voucher_entries ve
  CROSS JOIN params p
  WHERE ve.organization_id = p.org_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales s2
      WHERE s2.id = ve.reference_id AND s2.organization_id = p.org_id
    )
  GROUP BY ve.reference_id
),
pending_sale_returns AS (
  SELECT x.customer_id, COALESCE(SUM(x.row_credit), 0)::numeric AS amt
  FROM (
    SELECT sr.customer_id,
      public._sale_return_remaining_credit_for_balance(
        sr.net_amount, sr.credit_available_balance, COALESCE(ls.sale_return_adjust, 0)
      ) AS row_credit
    FROM public.sale_returns sr
    CROSS JOIN params p
    LEFT JOIN public.sales ls
      ON ls.id = sr.linked_sale_id AND ls.organization_id = p.org_id AND ls.deleted_at IS NULL
    WHERE sr.organization_id = p.org_id
      AND sr.deleted_at IS NULL
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('refunded')
      AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
  ) x
  WHERE x.row_credit > 0.005
  GROUP BY x.customer_id
),
unused_advances AS (
  SELECT ca.customer_id,
    GREATEST(0::numeric,
      COALESCE(SUM(ca.amount), 0) - COALESCE(SUM(ca.used_amount), 0)
      - COALESCE((
          SELECT SUM(ar.refund_amount)
          FROM public.advance_refunds ar
          JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
          WHERE ca2.customer_id = ca.customer_id AND ca2.organization_id = ca.organization_id
        ), 0)
    )::numeric AS amt,
    COALESCE(SUM(ca.used_amount), 0)::numeric AS used_amount
  FROM public.customer_advances ca
  CROSS JOIN params p
  WHERE ca.organization_id = p.org_id
  GROUP BY ca.customer_id, ca.organization_id
),
paid_by_cust AS (
  SELECT vs.customer_id, SUM(COALESCE(vs.paid_amount, 0))::numeric AS paid_amount_sum
  FROM valid_sales vs
  GROUP BY vs.customer_id
),
scored AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    c.phone,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0) AS receipts_excl_memo,
    COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0) AS advance_memos,
    COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0) AS cn_memos,
    COALESCE(ua.used_amount, 0) AS used_amount,
    COALESCE(ua.amt, 0) AS unused_advances,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_excl_memo,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0)
         + COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_incl_advance_memo,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
      - COALESCE(ua.used_amount, 0)
    )::numeric, 2) AS recomputed_7_plus_used_amount,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0)
         + COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0)
         + COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_incl_all_memo
  FROM cust c
  LEFT JOIN party pb ON pb.out_customer_id = c.id
  LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
  LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = c.id
)


SELECT
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_excl_memo) > (SELECT drift_threshold FROM params)
  ) AS n_mismatch_excl_memo,
  ROUND(COALESCE(SUM(ABS(recomputed_7_excl_memo - party_signed)) FILTER (
    WHERE ABS(party_signed - recomputed_7_excl_memo) > (SELECT drift_threshold FROM params)
  ), 0), 2) AS abs_drift_excl_memo,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
  ) AS n_mismatch_incl_advance_memo,
  ROUND(COALESCE(SUM(ABS(recomputed_7_incl_advance_memo - party_signed)) FILTER (
    WHERE ABS(party_signed - recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
  ), 0), 2) AS abs_drift_incl_advance_memo,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_plus_used_amount) > (SELECT drift_threshold FROM params)
  ) AS n_mismatch_plus_used_amount,
  ROUND(COALESCE(SUM(ABS(recomputed_7_plus_used_amount - party_signed)) FILTER (
    WHERE ABS(party_signed - recomputed_7_plus_used_amount) > (SELECT drift_threshold FROM params)
  ), 0), 2) AS abs_drift_plus_used_amount,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_incl_all_memo) > (SELECT drift_threshold FROM params)
  ) AS n_mismatch_incl_all_memo,
  ROUND(COALESCE(SUM(ABS(recomputed_7_incl_all_memo - party_signed)) FILTER (
    WHERE ABS(party_signed - recomputed_7_incl_all_memo) > (SELECT drift_threshold FROM params)
  ), 0), 2) AS abs_drift_incl_all_memo,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_excl_memo) > (SELECT drift_threshold FROM params)
      AND ABS(party_signed - recomputed_7_incl_advance_memo) <= (SELECT drift_threshold FROM params)
  ) AS n_closed_by_incl_advance_memo,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_excl_memo) > (SELECT drift_threshold FROM params)
      AND ABS((recomputed_7_excl_memo - party_signed) - advance_memos) <= (SELECT drift_threshold FROM params)
  ) AS n_excl_gap_equals_advance_memos,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_excl_memo) > (SELECT drift_threshold FROM params)
      AND ABS((recomputed_7_excl_memo - party_signed) - used_amount) <= (SELECT drift_threshold FROM params)
  ) AS n_excl_gap_equals_used_amount,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_excl_memo) > (SELECT drift_threshold FROM params)
      AND ABS((recomputed_7_excl_memo - party_signed) - paid_amount_sum) <= (SELECT drift_threshold FROM params)
  ) AS n_excl_gap_equals_paid_amount,
  COUNT(*) FILTER (
    WHERE ABS(used_amount - advance_memos) > (SELECT drift_threshold FROM params)
      AND GREATEST(used_amount, advance_memos) > (SELECT drift_threshold FROM params)
  ) AS n_used_amount_diverges_from_advance_memos,
  COUNT(*) FILTER (
    WHERE COALESCE(advance_memos, 0) <= 0.009 AND COALESCE(cn_memos, 0) <= 0.009
  ) AS n_zero_memo_customers,
  COUNT(*) FILTER (
    WHERE COALESCE(advance_memos, 0) <= 0.009 AND COALESCE(cn_memos, 0) <= 0.009
      AND (
        ABS(recomputed_7_excl_memo - recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
        OR ABS(recomputed_7_excl_memo - recomputed_7_incl_all_memo) > (SELECT drift_threshold FROM params)
      )
  ) AS n_zero_memo_formulas_differ,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
      AND (ABS(party_signed) >= 100000
           OR ABS(recomputed_7_incl_advance_memo - party_signed) >= 50000)
  ) AS n_p0_after_incl_advance
FROM scored;



-- -----------------------------------------------------------------------------
-- STEP 6e — Remaining mismatches after incl-advance (corrected P0 lives here).
-- excl_gap_was_advance_memos / excl_gap_was_paid_amount show how many of the
-- original 647 were the recompute hole vs a real live-data issue.
-- -----------------------------------------------------------------------------

WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold
),
cust AS (
  SELECT c.id, c.customer_name, c.phone, COALESCE(c.opening_balance, 0)::numeric AS opening_balance
  FROM public.customers c
  CROSS JOIN params p
  WHERE c.organization_id = p.org_id AND c.deleted_at IS NULL
),
party AS (
  SELECT r.out_customer_id, r.out_signed_balance
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
),
valid_sales AS (
  SELECT s.*
  FROM public.sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
    AND s.customer_id IS NOT NULL
),
items_gross AS (
  SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
  FROM public.sale_items si
  INNER JOIN valid_sales s2 ON s2.id = si.sale_id
  WHERE si.deleted_at IS NULL AND COALESCE(s2.sale_return_adjust, 0) > 0
  GROUP BY si.sale_id
),
total_invoiced AS (
  SELECT s.customer_id, COALESCE(SUM(s.net_amount), 0)::numeric AS amt
  FROM valid_sales s GROUP BY s.customer_id
),
sale_return_adjust AS (
  SELECT s.customer_id, COALESCE(SUM(
    CASE
      WHEN COALESCE(ig.gross, 0) > 0
           AND COALESCE(s.sale_return_adjust, 0) > 0
           AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
      THEN 0 ELSE COALESCE(s.sale_return_adjust, 0) END
  ), 0)::numeric AS amt
  FROM valid_sales s
  LEFT JOIN items_gross ig ON ig.sale_id = s.id
  GROUP BY s.customer_id
),
balance_adjustment AS (
  SELECT cba.customer_id, COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
  FROM public.customer_balance_adjustments cba
  CROSS JOIN params p
  WHERE cba.organization_id = p.org_id
  GROUP BY cba.customer_id
),
sale_receipts_per_sale AS (
  SELECT
    s.id AS sale_id,
    s.customer_id,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_type IN ('sale', 'CustomerReceipt')
          AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
      ), 0)::numeric AS receipts_excl_memo,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_type IN ('sale', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS advance_memos,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_type IN ('sale', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND NOT (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS cn_memos
  FROM valid_sales s
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  GROUP BY s.id, s.customer_id
),
sale_receipts_both AS (
  SELECT
    r.customer_id,
    SUM(r.receipts_excl_memo) AS receipts_excl_memo,
    SUM(r.advance_memos) AS advance_memos,
    SUM(r.cn_memos) AS cn_memos
  FROM sale_receipts_per_sale r
  GROUP BY r.customer_id
),
customer_receipts_both AS (
  SELECT
    ve.reference_id AS customer_id,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
          AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
      ), 0)::numeric AS receipts_excl_memo,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS advance_memos,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (
        WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
          AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          AND NOT (
            lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
            OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
          )
      ), 0)::numeric AS cn_memos
  FROM public.voucher_entries ve
  CROSS JOIN params p
  WHERE ve.organization_id = p.org_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales s2
      WHERE s2.id = ve.reference_id AND s2.organization_id = p.org_id
    )
  GROUP BY ve.reference_id
),
pending_sale_returns AS (
  SELECT x.customer_id, COALESCE(SUM(x.row_credit), 0)::numeric AS amt
  FROM (
    SELECT sr.customer_id,
      public._sale_return_remaining_credit_for_balance(
        sr.net_amount, sr.credit_available_balance, COALESCE(ls.sale_return_adjust, 0)
      ) AS row_credit
    FROM public.sale_returns sr
    CROSS JOIN params p
    LEFT JOIN public.sales ls
      ON ls.id = sr.linked_sale_id AND ls.organization_id = p.org_id AND ls.deleted_at IS NULL
    WHERE sr.organization_id = p.org_id
      AND sr.deleted_at IS NULL
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('refunded')
      AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
  ) x
  WHERE x.row_credit > 0.005
  GROUP BY x.customer_id
),
unused_advances AS (
  SELECT ca.customer_id,
    GREATEST(0::numeric,
      COALESCE(SUM(ca.amount), 0) - COALESCE(SUM(ca.used_amount), 0)
      - COALESCE((
          SELECT SUM(ar.refund_amount)
          FROM public.advance_refunds ar
          JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
          WHERE ca2.customer_id = ca.customer_id AND ca2.organization_id = ca.organization_id
        ), 0)
    )::numeric AS amt,
    COALESCE(SUM(ca.used_amount), 0)::numeric AS used_amount
  FROM public.customer_advances ca
  CROSS JOIN params p
  WHERE ca.organization_id = p.org_id
  GROUP BY ca.customer_id, ca.organization_id
),
paid_by_cust AS (
  SELECT vs.customer_id, SUM(COALESCE(vs.paid_amount, 0))::numeric AS paid_amount_sum
  FROM valid_sales vs
  GROUP BY vs.customer_id
),
scored AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    c.phone,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0) AS receipts_excl_memo,
    COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0) AS advance_memos,
    COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0) AS cn_memos,
    COALESCE(ua.used_amount, 0) AS used_amount,
    COALESCE(ua.amt, 0) AS unused_advances,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_excl_memo,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0)
         + COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_incl_advance_memo,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
      - COALESCE(ua.used_amount, 0)
    )::numeric, 2) AS recomputed_7_plus_used_amount,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0)
         + COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0)
         + COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_incl_all_memo
  FROM cust c
  LEFT JOIN party pb ON pb.out_customer_id = c.id
  LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
  LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = c.id
)


SELECT
  s.customer_name,
  s.phone,
  ROUND(s.party_signed, 2) AS party_signed,
  s.recomputed_7_excl_memo,
  s.recomputed_7_incl_advance_memo,
  s.recomputed_7_plus_used_amount,
  s.recomputed_7_incl_all_memo,
  ROUND(s.recomputed_7_excl_memo - s.party_signed, 2) AS gap_excl_minus_party,
  ROUND(s.recomputed_7_incl_advance_memo - s.party_signed, 2) AS gap_incl_advance_minus_party,
  ROUND(s.receipts_excl_memo, 2) AS receipts_excl_memo,
  ROUND(s.advance_memos, 2) AS advance_memos,
  ROUND(s.cn_memos, 2) AS cn_memos,
  ROUND(s.used_amount, 2) AS used_amount,
  ROUND(s.paid_amount_sum, 2) AS sum_paid_amount,
  CASE
    WHEN ABS(s.party_signed) >= 100000
      OR ABS(s.recomputed_7_incl_advance_memo - s.party_signed) >= 50000
    THEN 'P0'
    WHEN ABS(s.party_signed) >= 5000
      OR ABS(s.recomputed_7_incl_advance_memo - s.party_signed) >= 5000
    THEN 'P1'
    ELSE 'P2'
  END AS queue_tier_after_correction,
  (ABS((s.recomputed_7_excl_memo - s.party_signed) - s.advance_memos) <= 1) AS excl_gap_was_advance_memos,
  (ABS((s.recomputed_7_excl_memo - s.party_signed) - s.paid_amount_sum) <= 1) AS excl_gap_was_paid_amount
FROM scored s
WHERE ABS(s.party_signed - s.recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
ORDER BY ABS(s.recomputed_7_incl_advance_memo - s.party_signed) DESC, s.customer_name
LIMIT 1000;

