-- =============================================================================
-- ELLA NOOR — Step 7: classify the 136 remaining after incl-advance.
-- SELECT-ONLY. No INSERT / UPDATE / DELETE. Do not write paid_amount.
-- Do not patch the party RPC. Do not include credit_note_adjustment in receipts.
-- Do not recommend paid_amount option A or B.
-- =============================================================================
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67 (ELLA NOOR)
-- Run: ONE numbered section at a time in the SQL editor.
--
-- Offline from live 6e (docs/.../step7-remaining-headline-2026-08-25.csv):
--   136 remaining, abs ₹9,05,800
--   74  cn_leftover_incl_all_matches_party     ₹5,17,700  (incl-all = party; Farhaan is in here)
--   33  gap_equals_twice_used_minus_adv        ₹2,31,350
--    9  cn_partial_leftover                    ₹85,300   (SIBGAH GEELANI ₹33,000)
--    6  used_amount_without_adv_voucher        ₹28,800
--    3  gap_equals_paid_amount                 ₹9,650    (not the morning 647)
--   11  unexplained                            ₹33,000   (do not force-fit)
--
-- Class 1 is a NUMERIC identity, not a single mechanism. 7a splits it:
--   n_cn_leftover_gap_equals_sra_gated_away  — 7-sum dropped SRA that party still subtracts
--   n_cn_leftover_sra_fully_in_7sum          — Farhaan shape (SRA already in 7-sum)
--   n_cn_leftover_cn_without_sra             — AMNA shape (CN memos, no SRA)
-- Matching incl-all-memo to party is NOT permission to put CN memos in receipts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 7a — One-row remaining headline + SRA-gating split of class 1.
-- Offline 6e already filled n/abs per class. Paste 7a to confirm live still
-- 136 and to fill the three class-1 mechanism counts (unknown offline).
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
sale_return_adjust_raw AS (
  SELECT s.customer_id, COALESCE(SUM(COALESCE(s.sale_return_adjust, 0)), 0)::numeric AS amt
  FROM valid_sales s
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
    COALESCE(SUM(ca.amount), 0)::numeric AS deposited,
    COALESCE(SUM(ca.used_amount), 0)::numeric AS used_amount,
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
    c.opening_balance,
    COALESCE(ti.amt, 0) AS total_invoiced,
    COALESCE(sra.amt, 0) AS sra_gated,
    COALESCE(sraw.amt, 0) AS sra_raw,
    COALESCE(psr.amt, 0) AS pending_sale_returns,
    COALESCE(ua.amt, 0) AS unused_advances,
    COALESCE(ua.deposited, 0) AS advance_deposited,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0) AS receipts_excl_memo,
    COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0) AS advance_memos,
    COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0) AS cn_memos,
    COALESCE(ua.used_amount, 0) AS used_amount,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(ba.amt, 0) AS balance_adjustment,
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
  LEFT JOIN sale_return_adjust_raw sraw ON sraw.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = c.id
),
classified AS (
  SELECT
    s.*,
    ROUND(s.recomputed_7_incl_advance_memo - s.party_signed, 2) AS gap_incl_advance,
    ROUND(s.sra_raw - s.sra_gated, 2) AS sra_gated_away,
    ROUND(s.used_amount - s.advance_memos, 2) AS used_minus_adv,
    CASE
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - s.cn_memos) <= 1
           AND s.cn_memos > 1
           AND ABS(s.recomputed_7_incl_all_memo - s.party_signed) <= 1
      THEN 'cn_leftover_incl_all_matches_party'
      WHEN s.cn_memos > 1
      THEN 'cn_partial_leftover'
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - 2 * (s.used_amount - s.advance_memos)) <= 1
           AND ABS(s.used_amount - s.advance_memos) > 1
      THEN 'gap_equals_twice_used_minus_adv'
      WHEN ABS(s.recomputed_7_plus_used_amount - s.party_signed) <= 1
      THEN 'used_amount_without_adv_voucher'
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - s.paid_amount_sum) <= 1
           AND s.paid_amount_sum > 1
      THEN 'gap_equals_paid_amount'
      ELSE 'unexplained'
    END AS named_remaining_class
  FROM scored s
  WHERE ABS(s.party_signed - s.recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
)
SELECT
  COUNT(*) AS n_remaining,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)), 0), 2) AS abs_remaining,
  COUNT(*) FILTER (WHERE named_remaining_class = 'cn_leftover_incl_all_matches_party') AS n_cn_leftover_incl_all_matches_party,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)) FILTER (WHERE named_remaining_class = 'cn_leftover_incl_all_matches_party'), 0), 2) AS abs_cn_leftover,
  COUNT(*) FILTER (
    WHERE named_remaining_class = 'cn_leftover_incl_all_matches_party'
      AND ABS(gap_incl_advance - sra_gated_away) <= 1
      AND ABS(sra_gated_away) > 1
  ) AS n_cn_leftover_gap_equals_sra_gated_away,
  COUNT(*) FILTER (
    WHERE named_remaining_class = 'cn_leftover_incl_all_matches_party'
      AND ABS(sra_raw - sra_gated) <= 1
      AND sra_raw > 1
  ) AS n_cn_leftover_sra_fully_in_7sum,
  COUNT(*) FILTER (
    WHERE named_remaining_class = 'cn_leftover_incl_all_matches_party'
      AND COALESCE(sra_raw, 0) <= 1
  ) AS n_cn_leftover_cn_without_sra,
  COUNT(*) FILTER (WHERE named_remaining_class = 'gap_equals_twice_used_minus_adv') AS n_gap_equals_twice_used_minus_adv,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)) FILTER (WHERE named_remaining_class = 'gap_equals_twice_used_minus_adv'), 0), 2) AS abs_twice_used,
  COUNT(*) FILTER (WHERE named_remaining_class = 'cn_partial_leftover') AS n_cn_partial_leftover,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)) FILTER (WHERE named_remaining_class = 'cn_partial_leftover'), 0), 2) AS abs_cn_partial,
  COUNT(*) FILTER (WHERE named_remaining_class = 'used_amount_without_adv_voucher') AS n_used_amount_without_adv_voucher,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)) FILTER (WHERE named_remaining_class = 'used_amount_without_adv_voucher'), 0), 2) AS abs_used_without_voucher,
  COUNT(*) FILTER (WHERE named_remaining_class = 'gap_equals_paid_amount') AS n_gap_equals_paid_amount,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)) FILTER (WHERE named_remaining_class = 'gap_equals_paid_amount'), 0), 2) AS abs_gap_equals_paid,
  COUNT(*) FILTER (WHERE named_remaining_class = 'unexplained') AS n_unexplained,
  ROUND(COALESCE(SUM(ABS(gap_incl_advance)) FILTER (WHERE named_remaining_class = 'unexplained'), 0), 2) AS abs_unexplained,
  COUNT(*) FILTER (
    WHERE ABS(party_signed) >= 100000 OR ABS(gap_incl_advance) >= 50000
  ) AS n_p0_remaining
FROM classified;


-- -----------------------------------------------------------------------------
-- STEP 7b — Remaining names with class + SRA/advance components.
-- 136 rows expected. Do not dump into markdown; CSV is the review surface.
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
sale_return_adjust_raw AS (
  SELECT s.customer_id, COALESCE(SUM(COALESCE(s.sale_return_adjust, 0)), 0)::numeric AS amt
  FROM valid_sales s
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
    COALESCE(SUM(ca.amount), 0)::numeric AS deposited,
    COALESCE(SUM(ca.used_amount), 0)::numeric AS used_amount,
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
    c.opening_balance,
    COALESCE(ti.amt, 0) AS total_invoiced,
    COALESCE(sra.amt, 0) AS sra_gated,
    COALESCE(sraw.amt, 0) AS sra_raw,
    COALESCE(psr.amt, 0) AS pending_sale_returns,
    COALESCE(ua.amt, 0) AS unused_advances,
    COALESCE(ua.deposited, 0) AS advance_deposited,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0) AS receipts_excl_memo,
    COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0) AS advance_memos,
    COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0) AS cn_memos,
    COALESCE(ua.used_amount, 0) AS used_amount,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(ba.amt, 0) AS balance_adjustment,
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
  LEFT JOIN sale_return_adjust_raw sraw ON sraw.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = c.id
),
classified AS (
  SELECT
    s.*,
    ROUND(s.recomputed_7_incl_advance_memo - s.party_signed, 2) AS gap_incl_advance,
    ROUND(s.sra_raw - s.sra_gated, 2) AS sra_gated_away,
    ROUND(s.used_amount - s.advance_memos, 2) AS used_minus_adv,
    CASE
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - s.cn_memos) <= 1
           AND s.cn_memos > 1
           AND ABS(s.recomputed_7_incl_all_memo - s.party_signed) <= 1
      THEN 'cn_leftover_incl_all_matches_party'
      WHEN s.cn_memos > 1
      THEN 'cn_partial_leftover'
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - 2 * (s.used_amount - s.advance_memos)) <= 1
           AND ABS(s.used_amount - s.advance_memos) > 1
      THEN 'gap_equals_twice_used_minus_adv'
      WHEN ABS(s.recomputed_7_plus_used_amount - s.party_signed) <= 1
      THEN 'used_amount_without_adv_voucher'
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - s.paid_amount_sum) <= 1
           AND s.paid_amount_sum > 1
      THEN 'gap_equals_paid_amount'
      ELSE 'unexplained'
    END AS named_remaining_class
  FROM scored s
  WHERE ABS(s.party_signed - s.recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
)
SELECT
  c.named_remaining_class,
  c.customer_name,
  c.phone,
  ROUND(c.party_signed, 2) AS party_signed,
  ROUND(c.gap_incl_advance, 2) AS gap_incl_advance,
  ROUND(c.cn_memos, 2) AS cn_memos,
  ROUND(c.sra_raw, 2) AS sra_raw,
  ROUND(c.sra_gated, 2) AS sra_gated,
  ROUND(c.sra_gated_away, 2) AS sra_gated_away,
  ROUND(c.pending_sale_returns, 2) AS pending_sale_returns,
  ROUND(c.opening_balance, 2) AS opening_balance,
  ROUND(c.total_invoiced, 2) AS total_invoiced,
  ROUND(c.advance_deposited, 2) AS advance_deposited,
  ROUND(c.used_amount, 2) AS used_amount,
  ROUND(c.advance_memos, 2) AS advance_memos,
  ROUND(c.used_minus_adv, 2) AS used_minus_adv,
  ROUND(c.unused_advances, 2) AS unused_advances,
  ROUND(c.receipts_excl_memo, 2) AS receipts_excl_memo,
  ROUND(c.paid_amount_sum, 2) AS sum_paid_amount,
  c.recomputed_7_incl_advance_memo,
  c.recomputed_7_incl_all_memo,
  c.recomputed_7_plus_used_amount,
  (ABS(c.gap_incl_advance - c.sra_gated_away) <= 1 AND ABS(c.sra_gated_away) > 1) AS gap_equals_sra_gated_away,
  CASE
    WHEN ABS(c.party_signed) >= 100000 OR ABS(c.gap_incl_advance) >= 50000 THEN 'P0'
    WHEN ABS(c.party_signed) >= 5000 OR ABS(c.gap_incl_advance) >= 5000 THEN 'P1'
    ELSE 'P2'
  END AS queue_tier_after_correction
FROM classified c
ORDER BY ABS(c.gap_incl_advance) DESC, c.customer_name
LIMIT 1000;


-- -----------------------------------------------------------------------------
-- STEP 7c — Worked examples (Shumama, Farhaan, SIBGAH, KHUSHI, ABIDA, Pitodia, AMNA).
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
sale_return_adjust_raw AS (
  SELECT s.customer_id, COALESCE(SUM(COALESCE(s.sale_return_adjust, 0)), 0)::numeric AS amt
  FROM valid_sales s
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
    COALESCE(SUM(ca.amount), 0)::numeric AS deposited,
    COALESCE(SUM(ca.used_amount), 0)::numeric AS used_amount,
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
    c.opening_balance,
    COALESCE(ti.amt, 0) AS total_invoiced,
    COALESCE(sra.amt, 0) AS sra_gated,
    COALESCE(sraw.amt, 0) AS sra_raw,
    COALESCE(psr.amt, 0) AS pending_sale_returns,
    COALESCE(ua.amt, 0) AS unused_advances,
    COALESCE(ua.deposited, 0) AS advance_deposited,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.receipts_excl_memo, 0) + COALESCE(crb.receipts_excl_memo, 0) AS receipts_excl_memo,
    COALESCE(srb.advance_memos, 0) + COALESCE(crb.advance_memos, 0) AS advance_memos,
    COALESCE(srb.cn_memos, 0) + COALESCE(crb.cn_memos, 0) AS cn_memos,
    COALESCE(ua.used_amount, 0) AS used_amount,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(ba.amt, 0) AS balance_adjustment,
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
  LEFT JOIN sale_return_adjust_raw sraw ON sraw.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = c.id
),
classified AS (
  SELECT
    s.*,
    ROUND(s.recomputed_7_incl_advance_memo - s.party_signed, 2) AS gap_incl_advance,
    ROUND(s.sra_raw - s.sra_gated, 2) AS sra_gated_away,
    ROUND(s.used_amount - s.advance_memos, 2) AS used_minus_adv,
    CASE
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - s.cn_memos) <= 1
           AND s.cn_memos > 1
           AND ABS(s.recomputed_7_incl_all_memo - s.party_signed) <= 1
      THEN 'cn_leftover_incl_all_matches_party'
      WHEN s.cn_memos > 1
      THEN 'cn_partial_leftover'
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - 2 * (s.used_amount - s.advance_memos)) <= 1
           AND ABS(s.used_amount - s.advance_memos) > 1
      THEN 'gap_equals_twice_used_minus_adv'
      WHEN ABS(s.recomputed_7_plus_used_amount - s.party_signed) <= 1
      THEN 'used_amount_without_adv_voucher'
      WHEN ABS((s.recomputed_7_incl_advance_memo - s.party_signed) - s.paid_amount_sum) <= 1
           AND s.paid_amount_sum > 1
      THEN 'gap_equals_paid_amount'
      ELSE 'unexplained'
    END AS named_remaining_class
  FROM scored s
  WHERE ABS(s.party_signed - s.recomputed_7_incl_advance_memo) > (SELECT drift_threshold FROM params)
)
SELECT
  c.named_remaining_class,
  c.customer_name,
  c.phone,
  ROUND(c.party_signed, 2) AS party_signed,
  ROUND(c.gap_incl_advance, 2) AS gap_incl_advance,
  ROUND(c.cn_memos, 2) AS cn_memos,
  ROUND(c.sra_raw, 2) AS sra_raw,
  ROUND(c.sra_gated, 2) AS sra_gated,
  ROUND(c.sra_gated_away, 2) AS sra_gated_away,
  ROUND(c.pending_sale_returns, 2) AS pending_sale_returns,
  ROUND(c.opening_balance, 2) AS opening_balance,
  ROUND(c.total_invoiced, 2) AS total_invoiced,
  ROUND(c.advance_deposited, 2) AS advance_deposited,
  ROUND(c.used_amount, 2) AS used_amount,
  ROUND(c.advance_memos, 2) AS advance_memos,
  ROUND(c.used_minus_adv, 2) AS used_minus_adv,
  ROUND(c.unused_advances, 2) AS unused_advances,
  ROUND(c.receipts_excl_memo, 2) AS receipts_excl_memo,
  c.recomputed_7_incl_advance_memo,
  c.recomputed_7_incl_all_memo,
  c.recomputed_7_plus_used_amount,
  (ABS(c.gap_incl_advance - c.sra_gated_away) <= 1 AND ABS(c.sra_gated_away) > 1) AS gap_equals_sra_gated_away
FROM classified c
WHERE c.customer_name ILIKE '%SHUMAMA%BAIRELI%'
   OR c.customer_name ILIKE '%Farhaan Fab%'
   OR c.customer_name ILIKE '%SIBGAH%GEELANI%'
   OR c.customer_name ILIKE '%KHUSHI%VASIYA%'
   OR c.customer_name ILIKE '%ABIDA%TABASSUM%'
   OR c.customer_name ILIKE '%Fatima Pitodia%'
   OR c.customer_name ILIKE '%AMNA%DARVESH%'
ORDER BY ABS(c.gap_incl_advance) DESC;
