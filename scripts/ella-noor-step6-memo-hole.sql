-- =============================================================================
-- ELLA NOOR — Step 6: recompute memo hole (SUPERSEDES today's 717 / 647)
-- =============================================================================
-- SELECT-ONLY. No INSERT / UPDATE / DELETE. Do not write paid_amount.
-- Do not patch the party RPC. Do not recommend paid_amount option A or B
-- until these headlines are pasted.
--
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67 (ELLA NOOR)
-- Run: ONE numbered section at a time in the SQL editor.
--
-- Proof (Sana Nasir, hand-checked 2026-08-25):
--   Advance deposited ₹11,20,900; used_amount ₹11,00,900; unused ₹20,000.
--   93 of 94 receipts are advance_adjustment = ₹11,00,900.
--   One real cash/UPI ₹13,550. used + cash = invoiced ₹11,14,450.
--   Live page −₹20,000 Cr is correct. She owes nothing.
--   Today's excl-memo recompute said ₹10,80,900 Dr because:
--     receipts excluded advance_adjustment via _is_settlement_memo_receipt
--     unused_advances only credits the remaining pool
--     consumed used_amount fell in a hole between the two.
--
-- Live party already subtracts advances_applied (used_amount) AND unused
-- AND excludes memos from cash. The audit 7-sum omitted advances_applied.
--
-- Including advance_adjustment in receipts does NOT double-count with
-- unused_advances (remaining pool only). Equivalent when vouchers = used:
--   recomputed_7_incl_advance_memo  ≈  recomputed_7_plus_used_amount
--
-- CN is a different shape: pending_sale_returns is remaining (like unused).
-- Consumption lives in sale_return_adjust. Including credit_note_adjustment
-- on top of SRA is the Farhaan Fab −₹2,800 double-count. STEP 6b verifies
-- live; do not assume the advance fix applies to CN.
--
-- Columns: keep excl-memo (today's) next to the correction. No silent overwrite.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 6a — Sana Nasir (the worked example). One row (or a few name matches).
-- Expect: party_signed = −20000, recomputed_7_excl_memo ≈ 1080900,
--         gap_excl ≈ 1100900 = used_amount = advance_memos,
--         recomputed_7_incl_advance_memo = party_signed,
--         used + cash = invoiced.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
sana AS (
  SELECT c.id, c.customer_name, c.phone, COALESCE(c.opening_balance, 0)::numeric AS opening_balance
  FROM public.customers c
  CROSS JOIN params p
  WHERE c.organization_id = p.org_id
    AND c.deleted_at IS NULL
    AND c.customer_name ILIKE '%sana%nasir%'
),
valid_sales AS (
  SELECT s.*
  FROM public.sales s
  JOIN sana t ON t.id = s.customer_id
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
),
sale_receipts AS (
  SELECT
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
      ), 0)::numeric AS cn_memos,
    COUNT(*) FILTER (
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND ve.reference_type IN ('sale', 'CustomerReceipt')
        AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
        AND (
          lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        )
    ) AS n_advance_memo_vouchers,
    COUNT(*) FILTER (
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND ve.reference_type IN ('sale', 'CustomerReceipt')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ) AS n_real_cash_vouchers
  FROM valid_sales s
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  GROUP BY s.customer_id
),
invoiced AS (
  SELECT customer_id, COALESCE(SUM(net_amount), 0)::numeric AS amt
  FROM valid_sales GROUP BY customer_id
),
adv AS (
  SELECT
    ca.customer_id,
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
    )::numeric AS unused_advances
  FROM public.customer_advances ca
  JOIN sana t ON t.id = ca.customer_id
  CROSS JOIN params p
  WHERE ca.organization_id = p.org_id
  GROUP BY ca.customer_id, ca.organization_id
),
party AS (
  SELECT r.out_customer_id, r.out_signed_balance
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
  JOIN sana t ON t.id = r.out_customer_id
)
SELECT
  t.customer_name,
  t.phone,
  t.id AS customer_id,
  ROUND(t.opening_balance, 2) AS opening_balance,
  ROUND(COALESCE(i.amt, 0), 2) AS total_invoiced,
  ROUND(COALESCE(sr.receipts_excl_memo, 0), 2) AS receipts_excl_memo,
  ROUND(COALESCE(sr.advance_memos, 0), 2) AS advance_memos,
  ROUND(COALESCE(sr.cn_memos, 0), 2) AS cn_memos,
  COALESCE(sr.n_advance_memo_vouchers, 0) AS n_advance_memo_vouchers,
  COALESCE(sr.n_real_cash_vouchers, 0) AS n_real_cash_vouchers,
  ROUND(COALESCE(a.deposited, 0), 2) AS advance_deposited,
  ROUND(COALESCE(a.used_amount, 0), 2) AS used_amount,
  ROUND(COALESCE(a.unused_advances, 0), 2) AS unused_advances,
  ROUND(COALESCE(pb.out_signed_balance, 0), 2) AS party_signed,
  ROUND((
    t.opening_balance + COALESCE(i.amt, 0)
    - COALESCE(sr.receipts_excl_memo, 0)
    - COALESCE(a.unused_advances, 0)
  )::numeric, 2) AS recomputed_7_excl_memo,
  ROUND((
    t.opening_balance + COALESCE(i.amt, 0)
    - COALESCE(sr.receipts_excl_memo, 0) - COALESCE(sr.advance_memos, 0)
    - COALESCE(a.unused_advances, 0)
  )::numeric, 2) AS recomputed_7_incl_advance_memo,
  ROUND((
    t.opening_balance + COALESCE(i.amt, 0)
    - COALESCE(sr.receipts_excl_memo, 0)
    - COALESCE(a.unused_advances, 0)
    - COALESCE(a.used_amount, 0)
  )::numeric, 2) AS recomputed_7_plus_used_amount,
  ROUND((
    t.opening_balance + COALESCE(i.amt, 0)
    - COALESCE(sr.receipts_excl_memo, 0)
    - COALESCE(a.unused_advances, 0)
  ) - COALESCE(pb.out_signed_balance, 0), 2) AS gap_excl_minus_party,
  (ABS(COALESCE(a.used_amount, 0) - COALESCE(sr.advance_memos, 0)) <= 1) AS vouchers_match_used_amount,
  (ABS(COALESCE(i.amt, 0) - COALESCE(a.used_amount, 0) - COALESCE(sr.receipts_excl_memo, 0)) <= 1)
    AS used_plus_cash_equals_invoiced
FROM sana t
LEFT JOIN invoiced i ON i.customer_id = t.id
LEFT JOIN sale_receipts sr ON sr.customer_id = t.id
LEFT JOIN adv a ON a.customer_id = t.id
LEFT JOIN party pb ON pb.out_customer_id = t.id
ORDER BY t.customer_name
LIMIT 20;


-- -----------------------------------------------------------------------------
-- STEP 6b — CN remaining vs consumption (do not assume the advance hole).
-- pending_sale_returns = remaining CAB via _sale_return_remaining_credit_for_balance
--   (same structural shape as unused_advances: leftover, not consumption).
-- sale_return_adjust = consumption (the analog of used_amount).
-- Including cn_memos in receipts AND subtracting SRA is Farhaan Fab (−₹2,800).
-- looks_like_advance_hole = CN memos ≈ remaining AND SRA ≈ 0 (the rare hole).
-- sra_matches_cn_memos = applying the advance fix to CN would double-count.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold
),
cust AS (
  SELECT c.id, c.customer_name, c.phone
  FROM public.customers c
  CROSS JOIN params p
  WHERE c.organization_id = p.org_id AND c.deleted_at IS NULL
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
cn_memos AS (
  SELECT
    s.customer_id,
    COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0)::numeric AS amt
  FROM valid_sales s
  JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_type IN ('sale', 'CustomerReceipt')
    AND public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    AND NOT (
      lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
    )
  GROUP BY s.customer_id
)
SELECT
  c.customer_name,
  c.phone,
  ROUND(COALESCE(sra.amt, 0), 2) AS sale_return_adjust,
  ROUND(COALESCE(psr.amt, 0), 2) AS pending_sale_returns_remaining,
  ROUND(COALESCE(cn.amt, 0), 2) AS cn_memos,
  (COALESCE(psr.amt, 0) > 0.009) AS has_remaining_cn_credit,
  (COALESCE(sra.amt, 0) > 0.009) AS has_sra_consumption,
  (ABS(COALESCE(sra.amt, 0) - COALESCE(cn.amt, 0)) <= 1) AS sra_matches_cn_memos,
  (ABS(COALESCE(cn.amt, 0) - COALESCE(psr.amt, 0)) <= 1
     AND COALESCE(sra.amt, 0) <= 1) AS looks_like_advance_hole
FROM cust c
JOIN cn_memos cn ON cn.customer_id = c.id AND cn.amt > 1
LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
ORDER BY cn.amt DESC, c.customer_name
LIMIT 25;


-- Org-wide headline (6c identity + 6d counts) and remaining queue (6e):
--   scripts/ella-noor-step6-org.sql  — paste ONE section.
-- Do not write paid_amount. Do not patch the party RPC.


