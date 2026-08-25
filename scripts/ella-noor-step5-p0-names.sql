-- =============================================================================
-- ELLA NOOR — Step 5-P0 names (Tausif review list)
-- =============================================================================
-- SELECT-ONLY. Paste THIS ENTIRE FILE into the Supabase SQL editor as the only
-- statement. One result set, 33 rows, no pagination.
--
-- Filter of STEP 5: queue_tier = 'P0' only. Live Step 5b (2026-08-25):
--   n_p0 = 33, n_p0_party_trusts_paid_amount = 33.
-- Sort: ABS(gap_recompute_minus_party) DESC.
-- Extra flag: legacy_paid_baseline_nonzero on valid_sales (no extra voucher join).
--
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67 (ELLA NOOR)
-- Do not write paid_amount. Do not patch the party RPC.
-- =============================================================================

-- STEP 5-P0 — The 33 P0 customers by name (Tausif review list)
-- Filter of STEP 5: queue_tier = 'P0' only. Live Step 5b:
--   n_p0 = 33, n_p0_party_trusts_paid_amount = 33.
-- Columns: name, phone, party_signed, recomputed_7, gap, receipts,
--   sum_paid_amount, plus a cheap legacy_paid_baseline flag on valid_sales
--   (no extra voucher join tree). Sorted ABS(gap) DESC.
-- SELECT-only. One page. No writes.
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
    GREATEST(0::numeric, COALESCE(s.net_amount, 0)) AS payable_cap,
    (
      GREATEST(0::numeric, COALESCE(s.cash_amount, 0))
      + GREATEST(0::numeric, COALESCE(s.card_amount, 0))
      + GREATEST(0::numeric, COALESCE(s.upi_amount, 0))
    ) AS tender,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND ve.reference_type IN ('sale', 'CustomerReceipt')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS receipts_both_eras
  FROM valid_sales s
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  GROUP BY s.id, s.customer_id, s.net_amount, s.cash_amount, s.card_amount, s.upi_amount
),
sale_receipts_both AS (
  SELECT r.customer_id, SUM(r.receipts_both_eras) AS amt_both_eras
  FROM sale_receipts_per_sale r
  GROUP BY r.customer_id
),
customer_receipts_both AS (
  SELECT
    ve.reference_id AS customer_id,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS amt_both_eras
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
    )::numeric AS amt
  FROM public.customer_advances ca
  CROSS JOIN params p
  WHERE ca.organization_id = p.org_id
  GROUP BY ca.customer_id, ca.organization_id
),
advance_used AS (
  SELECT ca.customer_id, COALESCE(SUM(ca.used_amount), 0)::numeric AS amt
  FROM public.customer_advances ca
  CROSS JOIN params p
  WHERE ca.organization_id = p.org_id
  GROUP BY ca.customer_id
),
refunds AS (
  SELECT
    ve.reference_id AS customer_id,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0)::numeric AS amt
  FROM public.voucher_entries ve
  CROSS JOIN params p
  WHERE ve.organization_id = p.org_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
  GROUP BY ve.reference_id
),
orphan_receipts AS (
  SELECT
    s.customer_id,
    ROUND(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 2) AS amt
  FROM public.sales s
  CROSS JOIN params p
  JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NOT NULL
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_type IN ('sale', 'CustomerReceipt')
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY s.customer_id
),
scored AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    c.phone,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_both_eras,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0) AS receipt_payments_both_eras,
    COALESCE(ti.amt, 0) AS total_invoiced,
    COALESCE(ba.amt, 0) AS balance_adjustment
  FROM cust c
  LEFT JOIN party pb ON pb.out_customer_id = c.id
  LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
  LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
),
mismatch AS (
  SELECT
    s.customer_id,
    s.customer_name,
    s.phone,
    s.recomputed_7_both_eras,
    s.party_signed,
    ROUND(s.recomputed_7_both_eras - s.party_signed, 2) AS gap_recompute_minus_party,
    ROUND(ABS(s.recomputed_7_both_eras - s.party_signed), 2) AS abs_gap,
    s.receipt_payments_both_eras,
    s.balance_adjustment,
    CASE
      WHEN s.receipt_payments_both_eras = 0 AND s.total_invoiced > 0.009 THEN 'zero_receipt_invoiced'
      WHEN s.receipt_payments_both_eras > 0.009 THEN 'some_receipts'
      ELSE 'other_mismatch'
    END AS cohort
  FROM scored s
  CROSS JOIN params p
  WHERE ABS(s.party_signed - s.recomputed_7_both_eras) > p.drift_threshold
),
paid_by_cust AS (
  SELECT
    vs.customer_id,
    SUM(COALESCE(vs.paid_amount, 0))::numeric AS paid_amount_sum,
    SUM(GREATEST(
      0::numeric,
      COALESCE(vs.paid_amount, 0) - COALESCE(sr.receipts_both_eras, 0)
    ))::numeric AS paid_inflation_per_sale
  FROM valid_sales vs
  LEFT JOIN sale_receipts_per_sale sr ON sr.sale_id = vs.id
  GROUP BY vs.customer_id
),
inv_dup_receipt AS (
  SELECT s.customer_id, COUNT(*) AS n_hits
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.voucher_entries ve
    ON ve.id = i.entity_id AND ve.organization_id = i.organization_id
  JOIN public.sales s
    ON s.id = ve.reference_id AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id
    AND i.check_name = 'rapid_duplicate_receipt'
    AND s.customer_id IS NOT NULL
  GROUP BY s.customer_id
),
legacy_baseline AS (
  SELECT s.customer_id, COUNT(*) AS n_sales
  FROM public.sales s
  CROSS JOIN params p
  JOIN LATERAL (
    SELECT COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0) AS receipt_total
    FROM public.voucher_entries ve
    WHERE ve.organization_id = s.organization_id
      AND ve.reference_id = s.id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND ve.reference_type IN ('sale', 'CustomerReceipt')
      AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  ) r ON TRUE
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.legacy_paid_baseline, 0) > 0.009
    AND r.receipt_total > 0.009
  GROUP BY s.customer_id
),
cn_double AS (
  SELECT s.customer_id, COUNT(DISTINCT s.id) AS n_sales
  FROM public.sales s
  CROSS JOIN params p
  JOIN LATERAL (
    SELECT COALESCE(SUM(ve.total_amount), 0) AS cn_amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = s.organization_id
      AND ve.deleted_at IS NULL
      AND ve.reference_id = s.id
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND lower(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
      AND ve.reference_type IN ('sale', 'CustomerReceipt')
  ) cn ON TRUE
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.sale_return_adjust, 0) > 0.5
    AND cn.cn_amt > 0.5
    AND EXISTS (
      SELECT 1
      FROM public.sale_returns sr
      WHERE sr.customer_id = s.customer_id
        AND sr.organization_id = p.org_id
        AND sr.deleted_at IS NULL
        AND public._sale_return_remaining_credit_for_balance(
              sr.net_amount, sr.credit_available_balance, COALESCE(s.sale_return_adjust, 0)
            ) > 0.5
    )
  GROUP BY s.customer_id
),
classified AS (
  SELECT
    m.*,
    CASE
      WHEN ABS(m.gap_recompute_minus_party - COALESCE(pbc.paid_amount_sum, 0))
           <= (SELECT drift_threshold FROM params)
      THEN 'full'
      WHEN ABS(m.gap_recompute_minus_party
               - GREATEST(0::numeric, COALESCE(pbc.paid_amount_sum, 0) - m.receipt_payments_both_eras))
           <= (SELECT drift_threshold FROM params)
        OR ABS(m.gap_recompute_minus_party - COALESCE(pbc.paid_inflation_per_sale, 0))
           <= (SELECT drift_threshold FROM params)
      THEN 'inflation'
      WHEN GREATEST(
             GREATEST(0::numeric, COALESCE(pbc.paid_amount_sum, 0) - m.receipt_payments_both_eras),
             COALESCE(pbc.paid_inflation_per_sale, 0)
           ) > (SELECT drift_threshold FROM params)
       AND GREATEST(
             GREATEST(0::numeric, COALESCE(pbc.paid_amount_sum, 0) - m.receipt_payments_both_eras),
             COALESCE(pbc.paid_inflation_per_sale, 0)
           ) < m.abs_gap - (SELECT drift_threshold FROM params)
      THEN 'partial'
      ELSE 'none'
    END AS paid_trust_kind,
    CASE
      WHEN COALESCE(idr.n_hits, 0) > 0 THEN 'duplicate_receipt'
      WHEN COALESCE(cn.n_sales, 0) > 0 THEN 'cn_double_count'
      WHEN COALESCE(lb.n_sales, 0) > 0 THEN 'legacy_paid_baseline'
      WHEN ABS(m.gap_recompute_minus_party - m.balance_adjustment)
           <= (SELECT drift_threshold FROM params)
       AND ABS(m.balance_adjustment) > (SELECT drift_threshold FROM params)
      THEN 'manual_adjustment_overlay'
      WHEN ABS(m.gap_recompute_minus_party - COALESCE(au.amt, 0))
           <= (SELECT drift_threshold FROM params)
       AND COALESCE(au.amt, 0) > (SELECT drift_threshold FROM params)
      THEN 'advance_over_application'
      WHEN ABS(m.gap_recompute_minus_party - COALESCE(rf.amt, 0))
           <= (SELECT drift_threshold FROM params)
       AND COALESCE(rf.amt, 0) > (SELECT drift_threshold FROM params)
      THEN 'unrecorded_refund'
      WHEN COALESCE(orp.amt, 0) > (SELECT drift_threshold FROM params) THEN 'orphan_receipt'
      ELSE 'off_cause_unclear'
    END AS other_named_class,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(pbc.paid_inflation_per_sale, 0) AS paid_inflation_per_sale
  FROM mismatch m
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = m.customer_id
  LEFT JOIN inv_dup_receipt idr ON idr.customer_id = m.customer_id
  LEFT JOIN cn_double cn ON cn.customer_id = m.customer_id
  LEFT JOIN legacy_baseline lb ON lb.customer_id = m.customer_id
  LEFT JOIN advance_used au ON au.customer_id = m.customer_id
  LEFT JOIN refunds rf ON rf.customer_id = m.customer_id
  LEFT JOIN orphan_receipts orp ON orp.customer_id = m.customer_id
)
,
queued AS (
  SELECT
    cl.*,
    CASE
      WHEN cl.paid_trust_kind IN ('full', 'inflation', 'partial') THEN 'party_trusts_paid_amount'
      ELSE cl.other_named_class
    END AS named_pattern
  FROM classified cl
),
ranked AS (
  SELECT
    q.*,
    CASE
      WHEN ABS(q.party_signed) >= 100000 OR q.abs_gap >= 50000 THEN 'P0'
      WHEN q.named_pattern <> 'off_cause_unclear'
       AND (ABS(q.party_signed) >= 5000 OR q.abs_gap >= 5000) THEN 'P1'
      ELSE 'P2'
    END AS queue_tier
  FROM queued q
)
,
baseline_on_p0 AS (
  SELECT
    vs.customer_id,
    COUNT(*) FILTER (WHERE COALESCE(vs.legacy_paid_baseline, 0) > 0.009) AS n_sales_legacy_paid_baseline_nz,
    ROUND(SUM(COALESCE(vs.legacy_paid_baseline, 0)), 2) AS sum_legacy_paid_baseline
  FROM valid_sales vs
  GROUP BY vs.customer_id
)
SELECT
  r.customer_name,
  r.phone,
  r.party_signed,
  r.recomputed_7_both_eras,
  r.gap_recompute_minus_party,
  r.receipt_payments_both_eras,
  r.paid_amount_sum AS sum_paid_amount,
  (COALESCE(b.n_sales_legacy_paid_baseline_nz, 0) > 0) AS legacy_paid_baseline_nonzero,
  COALESCE(b.n_sales_legacy_paid_baseline_nz, 0) AS n_sales_legacy_paid_baseline_nz,
  COALESCE(b.sum_legacy_paid_baseline, 0) AS sum_legacy_paid_baseline,
  r.customer_id,
  r.named_pattern,
  r.queue_tier
FROM ranked r
LEFT JOIN baseline_on_p0 b ON b.customer_id = r.customer_id
WHERE r.queue_tier = 'P0'
ORDER BY r.abs_gap DESC, r.customer_name
LIMIT 50 OFFSET 0;



-- -----------------------------------------------------------------------------
