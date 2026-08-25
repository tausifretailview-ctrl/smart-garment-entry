-- =============================================================================
-- ELLA NOOR — Customer balance audit (2026-08)
-- =============================================================================
-- SELECT-ONLY. No INSERT / UPDATE / DELETE / RPC that writes. This pass reports
-- and classifies; it does not repair.
--
-- Org:  3fdca631-1e0c-4417-9704-421f5129ff67  (ELLA NOOR / ella-noor)
-- Run:  Supabase SQL editor, ONE numbered section at a time.
-- Cap:  every detail result set is LIMIT 1000. If a result hits 1000 rows,
--       re-run with page_offset += 1000. Headline / classification COUNT
--       queries do not need paging.
--
-- Canonical comparison: _get_customer_party_balances_rows.out_signed_balance
-- Independent recompute: seven signed components (verification recipe):
--   1. opening_balance
--   2. total_invoiced              (sales.net_amount, excl cancelled/hold)
--   3. sale_return_adjust_on_invoices  (gated on items_gross, party CASE)
--   4. receipt_payments            (cash + settlement discount; memos excluded)
--      PLUS paid-at-sale tender residual (see STEP 1 diagnostic columns —
--      receipts-only undercounted POS/invoice cash sitting on cash/card/upi)
--   5. balance_adjustment
--   6. pending_sale_returns        (_sale_return_remaining_credit_for_balance)
--   7. unused_advances             (advance pool net of used + refunds)
--
-- Tender residual (compute_sale_settlement, do NOT SUM receipts+tender):
--   per sale: settlement = LEAST(net, GREATEST(receipts, cash+card+upi))
--   paid_at_sale_tender  = GREATEST(0, settlement - receipts)
--   Dual-write (receipt voucher AND non-zero tender on the same sale) is
--   FLAGGED only — this script does not pick a winner.
--
-- ADDITION 1 — receipt vocabulary eras (required, not optional):
--   Before 2026-05-29: reference_type = 'CustomerReceipt'
--   From that date:    reference_type = 'sale'
--   Receipt-payments MUST use:
--       WHERE reference_type IN ('sale', 'CustomerReceipt')
--   Filtering the new tag only understates cash and overstates what the
--   customer owes — the ₹2.75 crore hidden-money cutover artifact.
--   Do NOT copy scripts/ella-noor-receivables-audit.sql Section 3
--   (that filter is IN ('sale','customer') and misses CustomerReceipt).
--
-- ADDITION 2 — "Duplicate receipt" is its own Step 2 class, distinct from
--   "CN double-count". Source: v_accounting_invariants.rapid_duplicate_receipt
--   (do not re-derive the 5-minute detector).
--
-- ADDITION 3 — Step 3 joins v_accounting_invariants for
--   duplicate_voucher_number, rapid_duplicate_receipt, receipts_exceed_invoice.
--   Do not write a second detector that can disagree with the digest.
--
-- ADDITION 4 — named check legacy_paid_baseline, not folded into generic
--   paid-amount drift:
--       legacy_paid_baseline > 0 AND receipts_total > 0
--   (Asma Shareef / INV/26-27/2288 shape).
--
-- Drift threshold: ABS(party − recomputed_7) > 1  (rupees).
-- =============================================================================

-- Shared params (paste into each section that needs them, or run after SET).
-- page_offset: 0, then 1000, 2000, … if a LIMIT 1000 result is full.

-- -----------------------------------------------------------------------------
-- STEP 0 — Receipt vocabulary diagnostic (run first)
-- Proves both eras exist. If customer_receipt_amt is material, any later
-- query that filters only 'sale' is a query artifact, not real drift.
-- One row. No 1000-cap issue.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
)
SELECT
  ve.reference_type,
  COUNT(*) AS n,
  ROUND(SUM(GREATEST(0::numeric,
    COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
  )), 2) AS settlement_amt,
  COUNT(*) FILTER (
    WHERE ve.created_at < TIMESTAMPTZ '2026-05-29 00:00:00+05:30'
  ) AS n_before_cutover,
  COUNT(*) FILTER (
    WHERE ve.created_at >= TIMESTAMPTZ '2026-05-29 00:00:00+05:30'
  ) AS n_on_or_after_cutover
FROM public.voucher_entries ve
CROSS JOIN params p
WHERE ve.organization_id = p.org_id
  AND ve.deleted_at IS NULL
  AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
GROUP BY ve.reference_type
ORDER BY settlement_amt DESC
LIMIT 1000;


-- -----------------------------------------------------------------------------
-- STEP 0b — Cutover pair totals (the required IN list vs new-vocab-only)
-- One row. If amt_customer_receipt > 0, addition 1 is load-bearing.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
r AS (
  SELECT
    ve.reference_type,
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amt
  FROM public.voucher_entries ve
  CROSS JOIN params p
  WHERE ve.organization_id = p.org_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
)
SELECT
  ROUND(SUM(amt) FILTER (WHERE reference_type = 'sale'), 2) AS amt_sale_only_tag,
  ROUND(SUM(amt) FILTER (WHERE reference_type = 'CustomerReceipt'), 2) AS amt_customer_receipt_tag,
  ROUND(SUM(amt) FILTER (WHERE reference_type IN ('sale', 'CustomerReceipt')), 2) AS amt_both_eras,
  ROUND(SUM(amt) FILTER (WHERE reference_type IN ('sale', 'SALE', 'CustomerReceipt')), 2) AS amt_both_eras_plus_SALE,
  ROUND(SUM(amt) FILTER (
    WHERE reference_type IN ('sale', 'SALE', 'customer', 'customer_payment', 'CustomerReceipt')
  ), 2) AS amt_canonical_five,
  ROUND(
    COALESCE(SUM(amt) FILTER (WHERE reference_type = 'CustomerReceipt'), 0),
    2
  ) AS hidden_if_new_vocab_only
FROM r;


-- -----------------------------------------------------------------------------
-- STEP 1 — Seven-component recompute vs party (mismatch table)
-- One row per customer. First SQL-editor run (receipts-only) produced 717
-- mismatches, all party < recompute. Keep those columns UNCHANGED and add
-- tender diagnostics so we can see how many of the 717 close.
--
-- Receipt-payments (sale-linked) uses the required pair:
--   reference_type IN ('sale', 'CustomerReceipt')
-- Customer-level (opening) receipts also accept CustomerReceipt so pre-cutover
-- opening-balance cash is not dropped.
--
-- paid_at_sale_tender is the compute_sale_settlement residual, NOT a raw
-- SUM(cash+card+upi) added onto receipts (that double-counts handleRecordPayment
-- dual-write). Per sale:
--   settlement = LEAST(GREATEST(net,0), GREATEST(receipts, tender))
--   residual   = GREATEST(0, settlement - receipts)
-- Do not read paid_amount / legacy_paid_baseline here.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold,
    1000 AS page_size,
    0 AS page_offset
),
cust AS (
  SELECT
    c.id,
    c.customer_name,
    COALESCE(c.opening_balance, 0)::numeric AS opening_balance
  FROM public.customers c
  CROSS JOIN params p
  WHERE c.organization_id = p.org_id
    AND c.deleted_at IS NULL
),
party AS (
  SELECT
    r.out_customer_id,
    r.out_signed_balance,
    r.out_direction,
    r.out_advance_available
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
  SELECT
    si.sale_id,
    SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
  FROM public.sale_items si
  INNER JOIN valid_sales s2 ON s2.id = si.sale_id
  WHERE si.deleted_at IS NULL
    AND COALESCE(s2.sale_return_adjust, 0) > 0
  GROUP BY si.sale_id
),
total_invoiced AS (
  SELECT s.customer_id, COALESCE(SUM(s.net_amount), 0)::numeric AS amt
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
balance_adjustment AS (
  SELECT
    cba.customer_id,
    COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
  FROM public.customer_balance_adjustments cba
  CROSS JOIN params p
  WHERE cba.organization_id = p.org_id
  GROUP BY cba.customer_id
),
-- ADDITION 1: sale-linked cash receipts, both vocabulary eras.
-- LEFT JOIN so sales with tender and zero vouchers still appear (the 247-row gap).
sale_receipts_per_sale AS (
  SELECT
    s.id AS sale_id,
    s.customer_id,
    s.sale_number,
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
    ), 0)::numeric AS receipts_both_eras,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND ve.reference_type IN ('sale')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS receipts_new_vocab_only,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND ve.reference_type IN ('CustomerReceipt')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS receipts_legacy_era,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND ve.reference_type IN ('SALE', 'customer', 'customer_payment')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS receipts_other_vocab
  FROM valid_sales s
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id
   AND ve.organization_id = s.organization_id
  GROUP BY s.id, s.customer_id, s.sale_number, s.net_amount,
           s.cash_amount, s.card_amount, s.upi_amount
),
sale_receipts_both AS (
  SELECT
    r.customer_id,
    SUM(r.receipts_both_eras) AS amt_both_eras,
    SUM(r.receipts_new_vocab_only) AS amt_new_vocab_only,
    SUM(r.receipts_legacy_era) AS amt_legacy_era,
    SUM(r.receipts_other_vocab) AS amt_other_customer_vocab,
    -- compute_sale_settlement residual: MAX(receipts, tender) then cap at net.
    -- Adding this to receipts_both_eras does NOT double-count equal dual-writes.
    SUM(GREATEST(
      0::numeric,
      LEAST(r.payable_cap, GREATEST(r.receipts_both_eras, r.tender))
        - r.receipts_both_eras
    )) AS paid_at_sale_tender,
    SUM(LEAST(r.payable_cap, r.tender)) AS paid_at_sale_tender_raw_capped,
    COUNT(*) FILTER (
      WHERE r.receipts_both_eras > 0.009 AND r.tender > 0.009
    ) AS dual_write_sale_count,
    COALESCE(SUM(LEAST(r.receipts_both_eras, r.tender)) FILTER (
      WHERE r.receipts_both_eras > 0.009 AND r.tender > 0.009
    ), 0) AS dual_write_overlap_est
  FROM sale_receipts_per_sale r
  GROUP BY r.customer_id
),
-- Customer-level (opening-balance) receipts. Include CustomerReceipt so the
-- same cutover cannot hide pre-29-May cash sitting on the customer id.
customer_receipts_both AS (
  SELECT
    ve.reference_id AS customer_id,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.reference_type IN ('customer', 'CustomerReceipt')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS amt_both_eras,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ) FILTER (
      WHERE ve.reference_type IN ('customer')
        AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    ), 0)::numeric AS amt_new_vocab_only
  FROM public.voucher_entries ve
  CROSS JOIN params p
  WHERE ve.organization_id = p.org_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sales s2
      WHERE s2.id = ve.reference_id
        AND s2.organization_id = p.org_id
    )
  GROUP BY ve.reference_id
),
pending_sale_returns AS (
  SELECT
    x.customer_id,
    COALESCE(SUM(x.row_credit), 0)::numeric AS amt
  FROM (
    SELECT
      sr.customer_id,
      public._sale_return_remaining_credit_for_balance(
        sr.net_amount,
        sr.credit_available_balance,
        COALESCE(ls.sale_return_adjust, 0)
      ) AS row_credit
    FROM public.sale_returns sr
    CROSS JOIN params p
    LEFT JOIN public.sales ls
      ON ls.id = sr.linked_sale_id
     AND ls.organization_id = p.org_id
     AND ls.deleted_at IS NULL
    WHERE sr.organization_id = p.org_id
      AND sr.deleted_at IS NULL
      AND lower(trim(COALESCE(sr.credit_status, ''))) NOT IN ('refunded')
      AND COALESCE(lower(sr.refund_type::text), '') <> 'cash_refund'
  ) x
  WHERE x.row_credit > 0.005
  GROUP BY x.customer_id
),
unused_advances AS (
  SELECT
    ca.customer_id,
    GREATEST(
      0::numeric,
      COALESCE(SUM(ca.amount), 0)
        - COALESCE(SUM(ca.used_amount), 0)
        - COALESCE((
            SELECT SUM(ar.refund_amount)
            FROM public.advance_refunds ar
            JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
            WHERE ca2.customer_id = ca.customer_id
              AND ca2.organization_id = ca.organization_id
          ), 0)
    )::numeric AS amt
  FROM public.customer_advances ca
  CROSS JOIN params p
  WHERE ca.organization_id = p.org_id
  GROUP BY ca.customer_id, ca.organization_id
),
components AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    c.opening_balance,
    COALESCE(ti.amt, 0) AS total_invoiced,
    COALESCE(sra.amt, 0) AS sale_return_adjust,
    COALESCE(ba.amt, 0) AS balance_adjustment,
    COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0) AS receipt_payments_both_eras,
    COALESCE(srb.amt_new_vocab_only, 0) + COALESCE(crb.amt_new_vocab_only, 0) AS receipt_payments_new_vocab_only,
    COALESCE(srb.amt_legacy_era, 0) AS receipt_payments_legacy_era,
    COALESCE(srb.amt_other_customer_vocab, 0) AS receipt_payments_other_vocab,
    COALESCE(srb.paid_at_sale_tender, 0) AS paid_at_sale_tender,
    COALESCE(srb.paid_at_sale_tender_raw_capped, 0) AS paid_at_sale_tender_raw_capped,
    COALESCE(srb.dual_write_sale_count, 0) AS dual_write_sale_count,
    COALESCE(srb.dual_write_overlap_est, 0) AS dual_write_overlap_est,
    COALESCE(psr.amt, 0) AS pending_sale_returns,
    COALESCE(ua.amt, 0) AS unused_advances
  FROM cust c
  LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
  LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
),
scored AS (
  SELECT
    cmp.*,
    ROUND((
      cmp.opening_balance
      + cmp.total_invoiced
      - cmp.sale_return_adjust
      - cmp.receipt_payments_both_eras
      + cmp.balance_adjustment
      - cmp.pending_sale_returns
      - cmp.unused_advances
    )::numeric, 2) AS recomputed_7_both_eras,
    ROUND((
      cmp.opening_balance
      + cmp.total_invoiced
      - cmp.sale_return_adjust
      - cmp.receipt_payments_new_vocab_only
      + cmp.balance_adjustment
      - cmp.pending_sale_returns
      - cmp.unused_advances
    )::numeric, 2) AS recomputed_7_new_vocab_only,
    ROUND((
      cmp.opening_balance
      + cmp.total_invoiced
      - cmp.sale_return_adjust
      - (cmp.receipt_payments_both_eras + cmp.paid_at_sale_tender)
      + cmp.balance_adjustment
      - cmp.pending_sale_returns
      - cmp.unused_advances
    )::numeric, 2) AS recomputed_7_with_tender,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(pb.out_direction, 'Settled') AS party_direction,
    COALESCE(pb.out_advance_available, 0)::numeric AS party_advance_available
  FROM components cmp
  LEFT JOIN party pb ON pb.out_customer_id = cmp.customer_id
)
SELECT
  s.customer_id,
  s.customer_name,
  s.party_direction,
  s.party_signed,
  s.receipt_payments_both_eras,
  s.paid_at_sale_tender,
  s.recomputed_7_both_eras,
  s.recomputed_7_with_tender,
  ROUND(s.party_signed - s.recomputed_7_both_eras, 2) AS drift_both_eras,
  ROUND(s.party_signed - s.recomputed_7_with_tender, 2) AS drift_with_tender,
  CASE
    WHEN ABS(s.party_signed - s.recomputed_7_both_eras) > (SELECT drift_threshold FROM params)
     AND ABS(s.party_signed - s.recomputed_7_with_tender) <= (SELECT drift_threshold FROM params)
    THEN true
    ELSE false
  END AS tender_closes_mismatch,
  ROUND(s.party_signed - s.recomputed_7_new_vocab_only, 2) AS drift_new_vocab_only,
  CASE
    WHEN ABS(s.party_signed - s.recomputed_7_new_vocab_only) > (SELECT drift_threshold FROM params)
     AND ABS(s.party_signed - s.recomputed_7_both_eras) <= (SELECT drift_threshold FROM params)
    THEN true
    ELSE false
  END AS vocab_query_artifact,
  s.dual_write_sale_count,
  s.dual_write_overlap_est,
  s.paid_at_sale_tender_raw_capped,
  s.opening_balance,
  s.total_invoiced,
  s.sale_return_adjust,
  s.receipt_payments_legacy_era,
  s.receipt_payments_new_vocab_only,
  s.receipt_payments_other_vocab,
  s.balance_adjustment,
  s.pending_sale_returns,
  s.unused_advances,
  s.party_advance_available
FROM scored s
CROSS JOIN params p
WHERE ABS(s.party_signed - s.recomputed_7_both_eras) > p.drift_threshold
   OR ABS(s.party_signed - s.recomputed_7_new_vocab_only) > p.drift_threshold
   OR ABS(s.party_signed - s.recomputed_7_with_tender) > p.drift_threshold
ORDER BY ABS(s.party_signed - s.recomputed_7_both_eras) DESC, s.customer_name
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 1b — Headline numbers (one row)
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold
),
party AS (
  SELECT r.*
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
)
SELECT
  (SELECT COUNT(*) FROM public.customers c, params p
    WHERE c.organization_id = p.org_id AND c.deleted_at IS NULL) AS customers_active,
  COUNT(*) AS party_rows,
  COUNT(*) FILTER (WHERE ABS(out_signed_balance) > 0.01) AS non_settled,
  COUNT(*) FILTER (WHERE out_direction = 'Dr') AS n_dr,
  COUNT(*) FILTER (WHERE out_direction = 'Cr') AS n_cr,
  COUNT(*) FILTER (WHERE out_direction = 'Settled') AS n_settled,
  ROUND(SUM(GREATEST(out_signed_balance, 0)), 2) AS total_dr,
  ROUND(SUM(GREATEST(-out_signed_balance, 0)), 2) AS total_cr,
  ROUND(SUM(out_signed_balance), 2) AS net_receivable,
  ROUND(SUM(COALESCE(out_advance_available, 0)), 2) AS unused_advance_pool
FROM party;


-- -----------------------------------------------------------------------------
-- STEP 1c — Tender diagnostic headline (one row)
-- How many of the receipts-only mismatches close once paid-at-sale tender
-- is counted the compute_sale_settlement way (MAX then cap at net, not SUM).
-- Also org-wide mismatch counts and dual-write flags. SELECT-only.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold
),
cust AS (
  SELECT c.id, c.customer_name, COALESCE(c.opening_balance, 0)::numeric AS opening_balance
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
  SELECT
    r.customer_id,
    SUM(r.receipts_both_eras) AS amt_both_eras,
    SUM(GREATEST(
      0::numeric,
      LEAST(r.payable_cap, GREATEST(r.receipts_both_eras, r.tender))
        - r.receipts_both_eras
    )) AS paid_at_sale_tender,
    COUNT(*) FILTER (WHERE r.receipts_both_eras > 0.009 AND r.tender > 0.009) AS dual_write_sale_count
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
scored AS (
  SELECT
    c.id AS customer_id,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_both_eras,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0)
         + COALESCE(srb.paid_at_sale_tender, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_with_tender,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.dual_write_sale_count, 0) AS dual_write_sale_count,
    COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0) AS receipt_payments_both_eras,
    COALESCE(ti.amt, 0) AS total_invoiced
  FROM cust c
  LEFT JOIN party pb ON pb.out_customer_id = c.id
  LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
  LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
  LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
  LEFT JOIN sale_receipts_both srb ON srb.customer_id = c.id
  LEFT JOIN customer_receipts_both crb ON crb.customer_id = c.id
  LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
  LEFT JOIN unused_advances ua ON ua.customer_id = c.id
)
SELECT
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_both_eras) > (SELECT drift_threshold FROM params)
  ) AS n_mismatch_receipts_only,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_both_eras) > (SELECT drift_threshold FROM params)
      AND ABS(party_signed - recomputed_7_with_tender) <= (SELECT drift_threshold FROM params)
  ) AS n_of_those_now_within_1,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_with_tender) > (SELECT drift_threshold FROM params)
  ) AS n_mismatch_with_tender,
  ROUND(SUM(ABS(party_signed - recomputed_7_both_eras)) FILTER (
    WHERE ABS(party_signed - recomputed_7_both_eras) > (SELECT drift_threshold FROM params)
  ), 2) AS abs_drift_receipts_only_rupees,
  ROUND(SUM(ABS(party_signed - recomputed_7_with_tender)) FILTER (
    WHERE ABS(party_signed - recomputed_7_with_tender) > (SELECT drift_threshold FROM params)
  ), 2) AS abs_drift_with_tender_rupees,
  COUNT(*) FILTER (
    WHERE ABS(party_signed - recomputed_7_both_eras) > (SELECT drift_threshold FROM params)
      AND receipt_payments_both_eras = 0
      AND total_invoiced > 0.009
  ) AS n_mismatch_zero_receipts_with_invoices,
  COUNT(*) FILTER (WHERE dual_write_sale_count > 0) AS n_customers_with_dual_write,
  (SELECT COUNT(*) FROM sale_receipts_per_sale r
    WHERE r.receipts_both_eras > 0.009 AND r.tender > 0.009) AS n_dual_write_sales
FROM scored;


-- -----------------------------------------------------------------------------
-- STEP 1d — Dual-write FLAG list (receipt voucher AND non-zero tender)
-- Do not decide which side is the double-count. Queue for a later pass.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
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
rows AS (
  SELECT
    s.id AS sale_id,
    s.sale_number,
    c.customer_name,
    c.id AS customer_id,
    GREATEST(0::numeric, COALESCE(s.net_amount, 0)) AS net_amount,
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
  JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id AND ve.organization_id = s.organization_id
  GROUP BY s.id, s.sale_number, c.customer_name, c.id,
           s.net_amount, s.cash_amount, s.card_amount, s.upi_amount
)
SELECT
  customer_name,
  sale_number,
  net_amount,
  tender,
  receipts_both_eras,
  ROUND(LEAST(tender, receipts_both_eras), 2) AS overlap_est,
  'FLAG only — do not pick a winner this pass'::text AS note
FROM rows
WHERE receipts_both_eras > 0.009 AND tender > 0.009
ORDER BY LEAST(tender, receipts_both_eras) DESC, customer_name, sale_number
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 2 — Classification flags for mismatch / named-failure customers
-- Duplicate receipt  = JOIN v_accounting_invariants (addition 2 + 3)
-- legacy_paid_baseline = named check, not generic paid drift (addition 4)
-- CN double-count    = SRA + CN voucher on same sale + remaining return pool
-- Vocab artifact     = new-vocab-only drift with both-eras agreement
-- LIMIT 1000. COUNT rollup is STEP 2b.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    1.0::numeric AS drift_threshold
),
-- ADDITION 3: read the standing view; do not re-implement the detector.
inv_dup_receipt AS (
  SELECT
    s.customer_id,
    COUNT(*) AS n_hits,
    ROUND(SUM(ABS(COALESCE(i.detail, 0))), 2) AS abs_detail
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.voucher_entries ve
    ON ve.id = i.entity_id
   AND ve.organization_id = i.organization_id
  LEFT JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id
    AND i.check_name = 'rapid_duplicate_receipt'
    AND s.customer_id IS NOT NULL
  GROUP BY s.customer_id
),
inv_dup_voucher AS (
  SELECT
    COALESCE(s.customer_id, ve.reference_id) AS customer_id,
    COUNT(*) AS n_hits
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.voucher_entries ve
    ON ve.id = i.entity_id
   AND ve.organization_id = i.organization_id
  LEFT JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id
    AND i.check_name = 'duplicate_voucher_number'
  GROUP BY COALESCE(s.customer_id, ve.reference_id)
),
inv_receipts_exceed AS (
  SELECT
    s.customer_id,
    COUNT(*) AS n_hits,
    ROUND(SUM(ABS(COALESCE(i.detail, 0))), 2) AS abs_detail
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.sales s
    ON s.id = i.entity_id
   AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id
    AND i.check_name = 'receipts_exceed_invoice'
  GROUP BY s.customer_id
),
-- ADDITION 4: named baseline∩receipts check (Asma Shareef shape).
-- receipts_total uses the same both-eras filter as receipt-payments.
legacy_baseline AS (
  SELECT
    s.customer_id,
    COUNT(*) AS n_sales,
    ROUND(SUM(COALESCE(s.legacy_paid_baseline, 0)), 2) AS baseline_sum,
    ROUND(SUM(r.receipt_total), 2) AS receipts_sum,
    ROUND(SUM(LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total)), 2) AS overlap_overstatement
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
-- Generic paid-amount drift (compute_sale_settlement) — kept DISTINCT from baseline.
paid_drift AS (
  SELECT
    s.customer_id,
    COUNT(*) AS n_sales,
    ROUND(SUM(s.paid_amount - cs.new_paid), 2) AS recorded_minus_expected
  FROM public.sales s
  CROSS JOIN params p
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
  WHERE s.organization_id = p.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
    AND ABS(COALESCE(s.paid_amount, 0) - COALESCE(cs.new_paid, 0)) > 0.99
  GROUP BY s.customer_id
),
cn_double AS (
  SELECT
    s.customer_id,
    COUNT(DISTINCT s.id) AS n_sales,
    ROUND(SUM(COALESCE(s.sale_return_adjust, 0)), 2) AS sra_on_flagged_sales,
    ROUND(SUM(cn.cn_amt), 2) AS cn_vouchers_on_flagged_sales
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
)
SELECT
  c.id AS customer_id,
  c.customer_name,
  pb.out_signed_balance AS party_signed,
  pb.out_direction,
  COALESCE(idr.n_hits, 0) AS duplicate_receipt_hits,
  COALESCE(idv.n_hits, 0) AS duplicate_voucher_hits,
  COALESCE(ire.n_hits, 0) AS receipts_exceed_hits,
  COALESCE(lb.n_sales, 0) AS legacy_paid_baseline_sales,
  COALESCE(lb.overlap_overstatement, 0) AS legacy_paid_baseline_overlap,
  COALESCE(pd.n_sales, 0) AS paid_amount_drift_sales,
  COALESCE(pd.recorded_minus_expected, 0) AS paid_amount_drift_rupees,
  COALESCE(cn.n_sales, 0) AS cn_double_count_sales,
  CASE
    WHEN COALESCE(idr.n_hits, 0) > 0 THEN 'duplicate_receipt'
    WHEN COALESCE(cn.n_sales, 0) > 0 THEN 'cn_double_count'
    WHEN COALESCE(lb.n_sales, 0) > 0 THEN 'legacy_paid_baseline'
    WHEN COALESCE(ire.n_hits, 0) > 0 THEN 'receipts_exceed_invoice'
    WHEN COALESCE(idv.n_hits, 0) > 0 THEN 'duplicate_voucher_number'
    WHEN COALESCE(pd.n_sales, 0) > 0 THEN 'paid_amount_drift'
    ELSE 'off_cause_unclear'
  END AS primary_class
FROM public.customers c
CROSS JOIN params p
LEFT JOIN public._get_customer_party_balances_rows(p.org_id) pb
  ON pb.out_customer_id = c.id
LEFT JOIN inv_dup_receipt idr ON idr.customer_id = c.id
LEFT JOIN inv_dup_voucher idv ON idv.customer_id = c.id
LEFT JOIN inv_receipts_exceed ire ON ire.customer_id = c.id
LEFT JOIN legacy_baseline lb ON lb.customer_id = c.id
LEFT JOIN paid_drift pd ON pd.customer_id = c.id
LEFT JOIN cn_double cn ON cn.customer_id = c.id
WHERE c.organization_id = p.org_id
  AND c.deleted_at IS NULL
  AND (
    COALESCE(idr.n_hits, 0) > 0
    OR COALESCE(idv.n_hits, 0) > 0
    OR COALESCE(ire.n_hits, 0) > 0
    OR COALESCE(lb.n_sales, 0) > 0
    OR COALESCE(pd.n_sales, 0) > 0
    OR COALESCE(cn.n_sales, 0) > 0
  )
ORDER BY
  CASE
    WHEN COALESCE(idr.n_hits, 0) > 0 THEN 1
    WHEN COALESCE(cn.n_sales, 0) > 0 THEN 2
    WHEN COALESCE(lb.n_sales, 0) > 0 THEN 3
    ELSE 9
  END,
  ABS(COALESCE(pb.out_signed_balance, 0)) DESC
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 2b — Classification COUNT rollup (one row per class)
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
)
SELECT 'duplicate_receipt'::text AS class_name,
       (SELECT COUNT(*) FROM public.v_accounting_invariants i, params p
         WHERE i.organization_id = p.org_id
           AND i.check_name = 'rapid_duplicate_receipt') AS invariant_hits,
       'v_accounting_invariants.rapid_duplicate_receipt (joined, not re-derived)'::text AS source
UNION ALL
SELECT 'duplicate_voucher_number',
       (SELECT COUNT(*) FROM public.v_accounting_invariants i, params p
         WHERE i.organization_id = p.org_id
           AND i.check_name = 'duplicate_voucher_number'),
       'v_accounting_invariants.duplicate_voucher_number'
UNION ALL
SELECT 'receipts_exceed_invoice',
       (SELECT COUNT(*) FROM public.v_accounting_invariants i, params p
         WHERE i.organization_id = p.org_id
           AND i.check_name = 'receipts_exceed_invoice'),
       'v_accounting_invariants.receipts_exceed_invoice'
UNION ALL
SELECT 'legacy_paid_baseline',
       (SELECT COUNT(*) FROM public.sales s, params p
         WHERE s.organization_id = p.org_id
           AND s.deleted_at IS NULL
           AND COALESCE(s.is_cancelled, false) = false
           AND COALESCE(s.legacy_paid_baseline, 0) > 0.009
           AND EXISTS (
             SELECT 1 FROM public.voucher_entries ve
             WHERE ve.organization_id = s.organization_id
               AND ve.reference_id = s.id
               AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
               AND ve.reference_type IN ('sale', 'CustomerReceipt')
               AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
           )),
       'legacy_paid_baseline > 0 AND receipts_total > 0 (both-eras filter)'
UNION ALL
SELECT 'cn_double_count',
       NULL,
       'SRA + CN voucher on same sale + remaining return pool (not an invariant check)'
ORDER BY class_name;


-- -----------------------------------------------------------------------------
-- STEP 3 — Invariant digest cross-check (JOIN the view; do not rebuild)
-- 3a rollup all check_names for this org (small).
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
)
SELECT
  i.check_name,
  COUNT(*) AS hits,
  ROUND(SUM(ABS(COALESCE(i.detail, 0))), 2) AS abs_detail_sum,
  ROUND(MAX(ABS(COALESCE(i.detail, 0))), 2) AS abs_detail_max
FROM public.v_accounting_invariants i
CROSS JOIN params p
WHERE i.organization_id = p.org_id
GROUP BY i.check_name
ORDER BY hits DESC
LIMIT 1000;


-- -----------------------------------------------------------------------------
-- STEP 3b — rapid_duplicate_receipt detail (from the view)
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
)
SELECT
  i.check_name,
  i.entity_ref AS voucher_number,
  i.entity_id AS voucher_id,
  i.detail,
  ve.reference_id,
  ve.reference_type,
  ve.total_amount,
  ve.created_at,
  s.sale_number,
  c.customer_name
FROM public.v_accounting_invariants i
CROSS JOIN params p
LEFT JOIN public.voucher_entries ve
  ON ve.id = i.entity_id
 AND ve.organization_id = i.organization_id
LEFT JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = i.organization_id
LEFT JOIN public.customers c
  ON c.id = s.customer_id
WHERE i.organization_id = p.org_id
  AND i.check_name = 'rapid_duplicate_receipt'
ORDER BY ABS(COALESCE(i.detail, 0)) DESC, i.entity_ref
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 3c — receipts_exceed_invoice detail (from the view)
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
)
SELECT
  i.check_name,
  i.entity_ref AS sale_number,
  i.entity_id AS sale_id,
  i.detail,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  c.customer_name
FROM public.v_accounting_invariants i
CROSS JOIN params p
LEFT JOIN public.sales s
  ON s.id = i.entity_id
 AND s.organization_id = i.organization_id
LEFT JOIN public.customers c
  ON c.id = s.customer_id
WHERE i.organization_id = p.org_id
  AND i.check_name = 'receipts_exceed_invoice'
ORDER BY ABS(COALESCE(i.detail, 0)) DESC
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 3d — duplicate_voucher_number detail (from the view)
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
)
SELECT
  i.check_name,
  i.entity_ref AS voucher_number,
  i.entity_id AS first_voucher_id,
  i.detail AS n_rows,
  ve.reference_type,
  ve.total_amount,
  s.sale_number,
  c.customer_name
FROM public.v_accounting_invariants i
CROSS JOIN params p
LEFT JOIN public.voucher_entries ve
  ON ve.id = i.entity_id
 AND ve.organization_id = i.organization_id
LEFT JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = i.organization_id
LEFT JOIN public.customers c
  ON c.id = s.customer_id
WHERE i.organization_id = p.org_id
  AND i.check_name = 'duplicate_voucher_number'
ORDER BY COALESCE(i.detail, 0) DESC, i.entity_ref
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 3e — legacy_paid_baseline named check (Asma Shareef shape)
-- Not an invariant-view check — the view does not currently carry this.
-- Filter: legacy_paid_baseline > 0 AND receipts_total > 0, both-eras receipts.
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
at_risk AS (
  SELECT
    s.id AS sale_id,
    s.sale_number,
    c.customer_name,
    s.created_at,
    s.net_amount,
    s.paid_amount,
    s.legacy_paid_baseline AS baseline,
    r.receipt_total,
    ROUND(LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total), 2) AS overlap_overstatement
  FROM public.sales s
  CROSS JOIN params p
  JOIN public.customers c ON c.id = s.customer_id
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
)
SELECT * FROM at_risk
ORDER BY overlap_overstatement DESC, created_at
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 3e-sum — baseline overlap headline (one row)
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
at_risk AS (
  SELECT
    s.id,
    s.legacy_paid_baseline AS baseline,
    r.receipt_total,
    LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total) AS overlap
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
)
SELECT
  COUNT(*) AS at_risk_sales,
  COUNT(*) FILTER (WHERE ABS(baseline - receipt_total) <= 0.009) AS baseline_eq_receipts,
  ROUND(SUM(overlap), 2) AS overlap_overstatement_est,
  ROUND(SUM(baseline), 2) AS baseline_sum,
  ROUND(SUM(receipt_total), 2) AS receipts_sum
FROM at_risk;


-- -----------------------------------------------------------------------------
-- STEP 4a — Top 25 Dr — line-by-line seven-component verification
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
top_dr AS (
  SELECT r.out_customer_id, r.out_customer_name, r.out_signed_balance, r.out_advance_available
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
  WHERE r.out_signed_balance > 0.5
  ORDER BY r.out_signed_balance DESC
  LIMIT 25
)
SELECT
  t.out_customer_name AS customer_name,
  t.out_signed_balance AS party_signed,
  src.source,
  src.amount,
  src.detail
FROM top_dr t
CROSS JOIN LATERAL (
  SELECT * FROM public.reconcile_customer_balance(t.out_customer_id, (SELECT org_id FROM params))
  UNION ALL
  SELECT 'party_rpc'::text, t.out_signed_balance, 'canonical signed_balance'::text
  UNION ALL
  SELECT 'party_advance_available'::text, t.out_advance_available, 'unused advance pool'::text
) src
ORDER BY t.out_signed_balance DESC, t.out_customer_name, src.source;


-- -----------------------------------------------------------------------------
-- STEP 4b — Top 25 Cr — line-by-line seven-component verification
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
top_cr AS (
  SELECT r.out_customer_id, r.out_customer_name, r.out_signed_balance, r.out_advance_available
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
  WHERE r.out_signed_balance < -0.5
  ORDER BY r.out_signed_balance ASC
  LIMIT 25
)
SELECT
  t.out_customer_name AS customer_name,
  t.out_signed_balance AS party_signed,
  src.source,
  src.amount,
  src.detail
FROM top_cr t
CROSS JOIN LATERAL (
  SELECT * FROM public.reconcile_customer_balance(t.out_customer_id, (SELECT org_id FROM params))
  UNION ALL
  SELECT 'party_rpc'::text, t.out_signed_balance, 'canonical signed_balance'::text
  UNION ALL
  SELECT 'party_advance_available'::text, t.out_advance_available, 'unused advance pool'::text
) src
ORDER BY t.out_signed_balance ASC, t.out_customer_name, src.source;


-- -----------------------------------------------------------------------------
-- STEP 5 — P0 / P1 / P2 repair QUEUE (SELECT only — do not execute repairs)
-- P0: |party| ≥ ₹1,00,000 OR baseline overlap ≥ ₹50,000 OR |drift| ≥ ₹50,000
-- P1: named class (duplicate receipt / CN double / baseline / receipts exceed)
--     with |party| ≥ ₹5,000 or overlap ≥ ₹5,000
-- P2: remaining named-class or |drift| > ₹1
-- -----------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
inv_dup_receipt AS (
  SELECT s.customer_id, COUNT(*) AS n
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.voucher_entries ve ON ve.id = i.entity_id AND ve.organization_id = i.organization_id
  JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id AND i.check_name = 'rapid_duplicate_receipt'
  GROUP BY s.customer_id
),
legacy_baseline AS (
  SELECT s.customer_id,
         COUNT(*) AS n_sales,
         ROUND(SUM(LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total)), 2) AS overlap
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
party AS (
  SELECT r.out_customer_id, r.out_customer_name, r.out_signed_balance, r.out_direction
  FROM params p
  CROSS JOIN LATERAL public._get_customer_party_balances_rows(p.org_id) r
)
SELECT
  pb.out_customer_name,
  pb.out_signed_balance,
  pb.out_direction,
  COALESCE(idr.n, 0) AS duplicate_receipt_hits,
  COALESCE(lb.n_sales, 0) AS baseline_overlap_sales,
  COALESCE(lb.overlap, 0) AS baseline_overlap_rupees,
  CASE
    WHEN ABS(pb.out_signed_balance) >= 100000
      OR COALESCE(lb.overlap, 0) >= 50000
    THEN 'P0'
    WHEN COALESCE(idr.n, 0) > 0
      OR COALESCE(lb.n_sales, 0) > 0
    THEN 'P1'
    ELSE 'P2'
  END AS queue_tier,
  'QUEUE ONLY — no voucher write, no paid_amount update, no baseline zeroing'::text AS action
FROM party pb
LEFT JOIN inv_dup_receipt idr ON idr.customer_id = pb.out_customer_id
LEFT JOIN legacy_baseline lb ON lb.customer_id = pb.out_customer_id
WHERE ABS(pb.out_signed_balance) > 0.5
   OR COALESCE(idr.n, 0) > 0
   OR COALESCE(lb.n_sales, 0) > 0
ORDER BY
  CASE
    WHEN ABS(pb.out_signed_balance) >= 100000 OR COALESCE(lb.overlap, 0) >= 50000 THEN 0
    WHEN COALESCE(idr.n, 0) > 0 OR COALESCE(lb.n_sales, 0) > 0 THEN 1
    ELSE 2
  END,
  ABS(pb.out_signed_balance) DESC
LIMIT 1000 OFFSET 0;

-- END. No writes follow.
