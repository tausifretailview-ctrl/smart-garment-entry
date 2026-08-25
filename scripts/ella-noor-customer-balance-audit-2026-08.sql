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
-- ADDITION 5 — named class "party_trusts_paid_amount" (classification only).
--   Live party credits sales.paid_amount; independent recompute (receipts +
--   tender + advances) disagrees. Same field as legacy_paid_baseline
--   self-reinflation. NOT a data-entry error on the customer. Do NOT fold
--   paid_amount into recomputed_7. Do NOT patch the party function here.
--   Join (same as Step 1e): ABS(gap_recompute_minus_party − paid_amount_sum)
--     <= drift_threshold.
--   Partial (466 with some receipts): gap ≈ GREATEST(0, paid − receipts)
--     or per-sale SUM(GREATEST(0, paid_amount − receipts_on_sale)).
--
-- ADDITION 6 — Step 5 is the named-pattern repair QUEUE (SELECT only).
--   Same classified CTE as Step 2c. Every mismatch row gets a name, phone,
--   proposed_write, and P0/P1/P2 tier. The 35 unexplained stay a separate
--   worklist (STEP 5-unexplained) — do not force-fit. No writes.
--
-- ADDITION 7 — STEP 5-P0 is the 33-name Tausif review list (queue_tier = P0).
--   Same classified CTE as STEP 5. Extra flag: any valid sale with
--   legacy_paid_baseline > 0 (from valid_sales, not a new voucher tree).
--   Prefer the single-statement file scripts/ella-noor-step5-p0-names.sql
--   (paste that file alone — do not paste this whole audit script).
--
-- ADDITION 8 — STEP 6 SUPERSEDES the 717 / 647 / ₹1,10,91,413 headline.
--   Sana Nasir (₹11,00,900 gap): live page is correct (−₹20,000 Cr). The
--   seven-component recompute omitted advances_applied (used_amount) while
--   excluding advance_adjustment from receipts → consumed advances fell in
--   a hole. Run scripts/ella-noor-step6-memo-hole.sql (6a, 6b) then
--   scripts/ella-noor-step6-org.sql (6d headline, 6e remaining). Do NOT
--   recommend paid_amount option A or B until 6d is pasted. Do not write.
--
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
-- STEP 1e — paid_amount / credit_applied headline for the zero-receipt mismatch
-- customers (251 on the Step 1c run). Tender residual was ₹0 org-wide, so it
-- cannot explain the gap. These two columns were excluded from that diagnostic.
--
-- Columns confirmed on live sales (2026-08-25 PostgREST):
--   paid_amount     — SELECT paid_amount returns 200 (bogus column → 42703)
--   credit_applied  — same
-- Both also present in src/integrations/supabase/types.ts.
--
-- Do NOT trust paid_amount as cash (legacy_paid_baseline self-reinflation).
-- Do NOT fold it into recomputed_7. Measure whether party could be crediting it
-- (older party v2 paid_at_sale_drift used GREATEST(paid_amount, tender) even
-- when tender = 0; repo-latest 20260911 dropped that term).
--
-- credit_applied is documented as a legacy mirror of sale_return_adjust
-- (customer-accounts-consistency-v1). Subtracting it on top of SRA would
-- double-count the mirror. Residual = GREATEST(0, credit_applied − sra).
--
-- SELECT-only. One row.
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
    )) AS paid_at_sale_tender
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
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0) AS receipt_payments_both_eras,
    COALESCE(srb.paid_at_sale_tender, 0) AS paid_at_sale_tender,
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
),
flagged AS (
  SELECT
    s.customer_id,
    s.recomputed_7_both_eras,
    s.party_signed,
    ROUND(s.recomputed_7_both_eras - s.party_signed, 2) AS gap_recompute_minus_party
  FROM scored s
  CROSS JOIN params p
  WHERE ABS(s.party_signed - s.recomputed_7_both_eras) > p.drift_threshold
    AND s.receipt_payments_both_eras = 0
    AND s.total_invoiced > 0.009
),
sales_on_flagged AS (
  SELECT
    vs.customer_id,
    vs.id AS sale_id,
    COALESCE(vs.net_amount, 0) AS net_amount,
    COALESCE(vs.paid_amount, 0) AS paid_amount,
    COALESCE(vs.credit_applied, 0) AS credit_applied,
    COALESCE(vs.sale_return_adjust, 0) AS sale_return_adjust,
    COALESCE(vs.legacy_paid_baseline, 0) AS legacy_paid_baseline,
    COALESCE(vs.points_redeemed_amount, 0) AS points_redeemed_amount
  FROM valid_sales vs
  WHERE vs.customer_id IN (SELECT customer_id FROM flagged)
)
SELECT
  (SELECT COUNT(*) FROM flagged) AS n_flagged_customers,
  COUNT(*) AS n_sales_on_flagged,
  ROUND(SUM(sof.net_amount), 2) AS sum_net_amount,
  ROUND(SUM(sof.paid_amount), 2) AS sum_paid_amount,
  COUNT(*) FILTER (WHERE sof.paid_amount > 0.009) AS n_sales_paid_amount_nz,
  ROUND(SUM(sof.credit_applied), 2) AS sum_credit_applied,
  COUNT(*) FILTER (WHERE sof.credit_applied > 0.009) AS n_sales_credit_applied_nz,
  COUNT(*) FILTER (
    WHERE sof.paid_amount > 0.009 OR sof.credit_applied > 0.009
  ) AS n_sales_either_nz,
  ROUND(SUM(sof.sale_return_adjust), 2) AS sum_sale_return_adjust,
  ROUND(SUM(GREATEST(0::numeric, sof.credit_applied - sof.sale_return_adjust)), 2)
    AS sum_credit_applied_beyond_sra,
  COUNT(*) FILTER (
    WHERE sof.credit_applied > 0.009
      AND ABS(sof.credit_applied - sof.sale_return_adjust) <= 0.009
  ) AS n_sales_credit_applied_eq_sra,
  ROUND(SUM(sof.legacy_paid_baseline), 2) AS sum_legacy_paid_baseline,
  ROUND(SUM(sof.points_redeemed_amount), 2) AS sum_points_redeemed_amount,
  ROUND((SELECT SUM(gap_recompute_minus_party) FROM flagged), 2) AS sum_gap_recompute_minus_party,
  ROUND((SELECT SUM(ABS(gap_recompute_minus_party)) FROM flagged), 2) AS abs_gap_on_flagged,
  -- Coverage vs the 251-customer gap (NOT a recommendation to fold paid_amount in).
  ROUND(LEAST(
    (SELECT SUM(ABS(gap_recompute_minus_party)) FROM flagged),
    SUM(sof.paid_amount)
  ), 2) AS paid_amount_vs_gap_rupees,
  ROUND(LEAST(
    (SELECT SUM(ABS(gap_recompute_minus_party)) FROM flagged),
    SUM(GREATEST(0::numeric, sof.credit_applied - sof.sale_return_adjust))
  ), 2) AS credit_beyond_sra_vs_gap_rupees,
  (
    SELECT COUNT(*) FROM flagged f
    JOIN (
      SELECT customer_id, SUM(paid_amount) AS paid_amt
      FROM sales_on_flagged GROUP BY customer_id
    ) p ON p.customer_id = f.customer_id
    WHERE ABS(f.gap_recompute_minus_party - p.paid_amt) <= (SELECT drift_threshold FROM params)
  ) AS n_flagged_whose_gap_equals_paid_amount,
  (
    SELECT COUNT(*) FROM flagged f
    JOIN (
      SELECT customer_id,
             SUM(GREATEST(0::numeric, credit_applied - sale_return_adjust)) AS ca_beyond
      FROM sales_on_flagged GROUP BY customer_id
    ) c ON c.customer_id = f.customer_id
    WHERE ABS(f.gap_recompute_minus_party - c.ca_beyond) <= (SELECT drift_threshold FROM params)
  ) AS n_flagged_whose_gap_equals_credit_beyond_sra
FROM sales_on_flagged sof;


-- -----------------------------------------------------------------------------
-- STEP 2-paid — Name every customer whose gap equals SUM(paid_amount)
-- among the zero-receipt invoiced mismatches (Step 1e join).
-- Live 1e count: n_flagged_whose_gap_equals_paid_amount = 234 of 251.
-- primary_class = party_trusts_paid_amount. SELECT-only. LIMIT 1000.
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
    )) AS paid_at_sale_tender
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
    c.customer_name,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_both_eras,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
    COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0) AS receipt_payments_both_eras,
    COALESCE(ti.amt, 0) AS total_invoiced,
    COALESCE(ba.amt, 0) AS balance_adjustment,
    COALESCE(ua.amt, 0) AS unused_advances
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
    s.recomputed_7_both_eras,
    s.party_signed,
    ROUND(s.recomputed_7_both_eras - s.party_signed, 2) AS gap_recompute_minus_party,
    ROUND(ABS(s.recomputed_7_both_eras - s.party_signed), 2) AS abs_gap,
    s.receipt_payments_both_eras,
    s.total_invoiced,
    s.balance_adjustment,
    s.unused_advances,
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
    SUM(GREATEST(0::numeric, COALESCE(vs.credit_applied, 0) - COALESCE(vs.sale_return_adjust, 0)))::numeric
      AS credit_beyond_sra,
    SUM(GREATEST(
      0::numeric,
      COALESCE(vs.paid_amount, 0) - COALESCE(sr.receipts_both_eras, 0)
    ))::numeric AS paid_inflation_per_sale
  FROM valid_sales vs
  LEFT JOIN sale_receipts_per_sale sr ON sr.sale_id = vs.id
  GROUP BY vs.customer_id
),
tagged AS (
  SELECT
    m.*,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(pbc.credit_beyond_sra, 0) AS credit_beyond_sra,
    COALESCE(pbc.paid_inflation_per_sale, 0) AS paid_inflation_per_sale,
    GREATEST(0::numeric, COALESCE(pbc.paid_amount_sum, 0) - m.receipt_payments_both_eras)
      AS paid_minus_receipts,
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
    END AS paid_trust_kind
  FROM mismatch m
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = m.customer_id
)
SELECT
  t.customer_id,
  t.customer_name,
  t.cohort,
  t.party_signed,
  t.recomputed_7_both_eras,
  t.gap_recompute_minus_party,
  t.abs_gap,
  t.paid_amount_sum,
  t.receipt_payments_both_eras,
  'party_trusts_paid_amount'::text AS primary_class
FROM tagged t
WHERE t.cohort = 'zero_receipt_invoiced'
  AND t.paid_trust_kind = 'full'
ORDER BY t.abs_gap DESC, t.customer_name
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 2-17 — The leftover zero-receipt mismatches (251 − 234).
-- paid_amount and credit_applied both ruled out (gap ≠ those sums).
-- Runs the other named-pattern detectors against this worklist only.
-- LIMIT 1000 (expect ~17 rows).
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
    SUM(r.receipts_both_eras) AS amt_both_eras
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
    COUNT(*) AS n_vouchers,
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
    s.recomputed_7_both_eras,
    s.party_signed,
    ROUND(s.recomputed_7_both_eras - s.party_signed, 2) AS gap_recompute_minus_party,
    ROUND(ABS(s.recomputed_7_both_eras - s.party_signed), 2) AS abs_gap,
    s.receipt_payments_both_eras,
    s.total_invoiced,
    s.balance_adjustment
  FROM scored s
  CROSS JOIN params p
  WHERE ABS(s.party_signed - s.recomputed_7_both_eras) > p.drift_threshold
    AND s.receipt_payments_both_eras = 0
    AND s.total_invoiced > 0.009
),
paid_by_cust AS (
  SELECT
    vs.customer_id,
    SUM(COALESCE(vs.paid_amount, 0))::numeric AS paid_amount_sum,
    SUM(GREATEST(0::numeric, COALESCE(vs.credit_applied, 0) - COALESCE(vs.sale_return_adjust, 0)))::numeric
      AS credit_beyond_sra
  FROM valid_sales vs
  GROUP BY vs.customer_id
),
worklist AS (
  SELECT
    m.*,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(pbc.credit_beyond_sra, 0) AS credit_beyond_sra
  FROM mismatch m
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = m.customer_id
  CROSS JOIN params p
  WHERE ABS(m.gap_recompute_minus_party - COALESCE(pbc.paid_amount_sum, 0)) > p.drift_threshold
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
inv_dup_voucher AS (
  SELECT COALESCE(s.customer_id, ve.reference_id) AS customer_id, COUNT(*) AS n_hits
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.voucher_entries ve
    ON ve.id = i.entity_id AND ve.organization_id = i.organization_id
  LEFT JOIN public.sales s
    ON s.id = ve.reference_id AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id
    AND i.check_name = 'duplicate_voucher_number'
  GROUP BY COALESCE(s.customer_id, ve.reference_id)
),
inv_receipts_exceed AS (
  SELECT s.customer_id, COUNT(*) AS n_hits
  FROM public.v_accounting_invariants i
  CROSS JOIN params p
  JOIN public.sales s
    ON s.id = i.entity_id AND s.organization_id = i.organization_id
  WHERE i.organization_id = p.org_id
    AND i.check_name = 'receipts_exceed_invoice'
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
paid_drift AS (
  SELECT s.customer_id, COUNT(*) AS n_sales
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
)
SELECT
  w.customer_id,
  w.customer_name,
  w.party_signed,
  w.recomputed_7_both_eras,
  w.gap_recompute_minus_party,
  w.abs_gap,
  w.paid_amount_sum,
  w.credit_beyond_sra,
  w.balance_adjustment,
  COALESCE(au.amt, 0) AS advance_used,
  COALESCE(rf.amt, 0) AS payment_refunds,
  COALESCE(orp.n_vouchers, 0) AS orphan_receipt_vouchers,
  COALESCE(orp.amt, 0) AS orphan_receipt_amt,
  COALESCE(idr.n_hits, 0) AS duplicate_receipt_hits,
  COALESCE(idv.n_hits, 0) AS duplicate_voucher_hits,
  COALESCE(ire.n_hits, 0) AS receipts_exceed_hits,
  COALESCE(lb.n_sales, 0) AS legacy_paid_baseline_sales,
  COALESCE(pd.n_sales, 0) AS paid_amount_drift_sales,
  COALESCE(cn.n_sales, 0) AS cn_double_count_sales,
  CASE
    WHEN COALESCE(idr.n_hits, 0) > 0 THEN 'duplicate_receipt'
    WHEN COALESCE(cn.n_sales, 0) > 0 THEN 'cn_double_count'
    WHEN COALESCE(lb.n_sales, 0) > 0 THEN 'legacy_paid_baseline'
    WHEN ABS(w.gap_recompute_minus_party - w.balance_adjustment)
         <= (SELECT drift_threshold FROM params)
     AND ABS(w.balance_adjustment) > (SELECT drift_threshold FROM params)
    THEN 'manual_adjustment_overlay'
    WHEN ABS(w.gap_recompute_minus_party - COALESCE(au.amt, 0))
         <= (SELECT drift_threshold FROM params)
     AND COALESCE(au.amt, 0) > (SELECT drift_threshold FROM params)
    THEN 'advance_over_application'
    WHEN ABS(w.gap_recompute_minus_party - COALESCE(rf.amt, 0))
         <= (SELECT drift_threshold FROM params)
     AND COALESCE(rf.amt, 0) > (SELECT drift_threshold FROM params)
    THEN 'unrecorded_refund'
    WHEN COALESCE(orp.amt, 0) > (SELECT drift_threshold FROM params) THEN 'orphan_receipt'
    WHEN COALESCE(ire.n_hits, 0) > 0 THEN 'receipts_exceed_invoice'
    WHEN COALESCE(idv.n_hits, 0) > 0 THEN 'duplicate_voucher_number'
    WHEN COALESCE(pd.n_sales, 0) > 0 THEN 'paid_amount_drift'
    ELSE 'off_cause_unclear'
  END AS primary_class
FROM worklist w
LEFT JOIN advance_used au ON au.customer_id = w.customer_id
LEFT JOIN refunds rf ON rf.customer_id = w.customer_id
LEFT JOIN orphan_receipts orp ON orp.customer_id = w.customer_id
LEFT JOIN inv_dup_receipt idr ON idr.customer_id = w.customer_id
LEFT JOIN inv_dup_voucher idv ON idv.customer_id = w.customer_id
LEFT JOIN inv_receipts_exceed ire ON ire.customer_id = w.customer_id
LEFT JOIN legacy_baseline lb ON lb.customer_id = w.customer_id
LEFT JOIN paid_drift pd ON pd.customer_id = w.customer_id
LEFT JOIN cn_double cn ON cn.customer_id = w.customer_id
ORDER BY w.abs_gap DESC, w.customer_name
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 2-466 — Same paid_amount-vs-gap join on mismatches who HAVE receipts
-- (717 − 251). One row. Full = Step 1e join. Inflation = gap equals
-- paid-over-receipts. Partial = inflation covers some of the gap.
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
    SUM(r.receipts_both_eras) AS amt_both_eras
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
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
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
),
mismatch AS (
  SELECT
    s.customer_id,
    ROUND(s.recomputed_7_both_eras - s.party_signed, 2) AS gap_recompute_minus_party,
    ROUND(ABS(s.recomputed_7_both_eras - s.party_signed), 2) AS abs_gap,
    s.receipt_payments_both_eras,
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
tagged AS (
  SELECT
    m.*,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(pbc.paid_inflation_per_sale, 0) AS paid_inflation_per_sale,
    GREATEST(0::numeric, COALESCE(pbc.paid_amount_sum, 0) - m.receipt_payments_both_eras)
      AS paid_minus_receipts,
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
    END AS paid_trust_kind
  FROM mismatch m
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = m.customer_id
)
SELECT
  COUNT(*) FILTER (WHERE cohort = 'some_receipts') AS n_some_receipts,
  COUNT(*) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'full') AS n_466_full_1e_join,
  COUNT(*) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'inflation') AS n_466_inflation,
  COUNT(*) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'partial') AS n_466_partial,
  COUNT(*) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind IN ('full', 'inflation', 'partial'))
    AS n_466_explained_fully_or_partially,
  COUNT(*) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'none') AS n_466_not_explained_by_paid,
  ROUND(SUM(abs_gap) FILTER (WHERE cohort = 'some_receipts'), 2) AS abs_gap_on_466,
  ROUND(SUM(abs_gap) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'full'), 2)
    AS rupees_466_full,
  ROUND(SUM(abs_gap) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'inflation'), 2)
    AS rupees_466_inflation,
  ROUND(SUM(abs_gap) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'partial'), 2)
    AS rupees_466_partial,
  ROUND(SUM(abs_gap) FILTER (
    WHERE cohort = 'some_receipts' AND paid_trust_kind IN ('full', 'inflation', 'partial')
  ), 2) AS rupees_466_named_pattern,
  ROUND(SUM(abs_gap) FILTER (WHERE cohort = 'some_receipts' AND paid_trust_kind = 'none'), 2)
    AS rupees_466_not_this_pattern
FROM tagged;


-- -----------------------------------------------------------------------------
-- STEP 2-466-list — Names on the 466 that the paid_amount-trust pattern
-- explains fully (1e join), via inflation, or partially. LIMIT 1000.
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
scored AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    ROUND((
      c.opening_balance + COALESCE(ti.amt, 0) - COALESCE(sra.amt, 0)
      - (COALESCE(srb.amt_both_eras, 0) + COALESCE(crb.amt_both_eras, 0))
      + COALESCE(ba.amt, 0) - COALESCE(psr.amt, 0) - COALESCE(ua.amt, 0)
    )::numeric, 2) AS recomputed_7_both_eras,
    COALESCE(pb.out_signed_balance, 0)::numeric AS party_signed,
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
),
mismatch AS (
  SELECT
    s.customer_id,
    s.customer_name,
    s.recomputed_7_both_eras,
    s.party_signed,
    ROUND(s.recomputed_7_both_eras - s.party_signed, 2) AS gap_recompute_minus_party,
    ROUND(ABS(s.recomputed_7_both_eras - s.party_signed), 2) AS abs_gap,
    s.receipt_payments_both_eras
  FROM scored s
  CROSS JOIN params p
  WHERE ABS(s.party_signed - s.recomputed_7_both_eras) > p.drift_threshold
    AND s.receipt_payments_both_eras > 0.009
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
tagged AS (
  SELECT
    m.*,
    COALESCE(pbc.paid_amount_sum, 0) AS paid_amount_sum,
    COALESCE(pbc.paid_inflation_per_sale, 0) AS paid_inflation_per_sale,
    GREATEST(0::numeric, COALESCE(pbc.paid_amount_sum, 0) - m.receipt_payments_both_eras)
      AS paid_minus_receipts,
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
    END AS paid_trust_kind
  FROM mismatch m
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = m.customer_id
)
SELECT
  t.customer_id,
  t.customer_name,
  t.paid_trust_kind,
  CASE
    WHEN t.paid_trust_kind IN ('full', 'inflation', 'partial') THEN 'party_trusts_paid_amount'
    ELSE 'not_this_pattern'
  END AS primary_class,
  t.party_signed,
  t.recomputed_7_both_eras,
  t.gap_recompute_minus_party,
  t.abs_gap,
  t.paid_amount_sum,
  t.receipt_payments_both_eras,
  t.paid_minus_receipts,
  t.paid_inflation_per_sale
FROM tagged t
WHERE t.paid_trust_kind IN ('full', 'inflation', 'partial')
ORDER BY
  CASE t.paid_trust_kind WHEN 'full' THEN 1 WHEN 'inflation' THEN 2 ELSE 3 END,
  t.abs_gap DESC,
  t.customer_name
LIMIT 1000 OFFSET 0;


-- -----------------------------------------------------------------------------
-- STEP 2c — Headline rupee split of the 717-customer / ₹1,15,59,763 drift.
-- One row. New named pattern vs other named patterns vs unexplained.
-- Other named patterns on this row are only counted for customers NOT already
-- explained by party_trusts_paid_amount (no double-count).
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
    END AS other_named_class
  FROM mismatch m
  LEFT JOIN paid_by_cust pbc ON pbc.customer_id = m.customer_id
  LEFT JOIN inv_dup_receipt idr ON idr.customer_id = m.customer_id
  LEFT JOIN cn_double cn ON cn.customer_id = m.customer_id
  LEFT JOIN legacy_baseline lb ON lb.customer_id = m.customer_id
  LEFT JOIN advance_used au ON au.customer_id = m.customer_id
  LEFT JOIN refunds rf ON rf.customer_id = m.customer_id
  LEFT JOIN orphan_receipts orp ON orp.customer_id = m.customer_id
)
SELECT
  COUNT(*) AS n_mismatch,
  COUNT(*) FILTER (WHERE cohort = 'zero_receipt_invoiced') AS n_zero_receipt_invoiced,
  COUNT(*) FILTER (WHERE cohort = 'zero_receipt_invoiced' AND paid_trust_kind = 'full')
    AS n_251_party_trusts_paid_amount,
  COUNT(*) FILTER (WHERE cohort = 'zero_receipt_invoiced' AND paid_trust_kind <> 'full')
    AS n_17_worklist,
  COUNT(*) FILTER (WHERE cohort = 'some_receipts') AS n_some_receipts,
  COUNT(*) FILTER (WHERE paid_trust_kind IN ('full', 'inflation', 'partial'))
    AS n_named_party_trusts_paid_amount,
  COUNT(*) FILTER (
    WHERE paid_trust_kind = 'none' AND other_named_class <> 'off_cause_unclear'
  ) AS n_other_named_patterns,
  COUNT(*) FILTER (
    WHERE paid_trust_kind = 'none' AND other_named_class = 'off_cause_unclear'
  ) AS n_genuinely_unexplained,
  COUNT(*) FILTER (WHERE paid_trust_kind IN ('full', 'inflation', 'partial'))
    + COUNT(*) FILTER (
        WHERE paid_trust_kind = 'none' AND other_named_class <> 'off_cause_unclear'
      ) AS n_classified,
  ROUND(SUM(abs_gap), 2) AS abs_drift_rupees,
  ROUND(SUM(abs_gap) FILTER (WHERE paid_trust_kind IN ('full', 'inflation', 'partial')), 2)
    AS rupees_party_trusts_paid_amount,
  ROUND(SUM(abs_gap) FILTER (
    WHERE paid_trust_kind = 'none' AND other_named_class <> 'off_cause_unclear'
  ), 2) AS rupees_other_named_patterns,
  ROUND(SUM(abs_gap) FILTER (
    WHERE paid_trust_kind = 'none' AND other_named_class = 'off_cause_unclear'
  ), 2) AS rupees_genuinely_unexplained
FROM classified;


-- -----------------------------------------------------------------------------
-- STEP 2 — Invariant / CN / baseline named-failure list (not the 717 rollup)
-- Duplicate receipt  = JOIN v_accounting_invariants (addition 2 + 3)
-- legacy_paid_baseline = named check, not generic paid drift (addition 4)
-- CN double-count    = SRA + CN voucher on same sale + remaining return pool
-- Vocab artifact     = new-vocab-only drift with both-eras agreement
--
-- ADDITION 5: customers whose gap equals SUM(paid_amount) are NOT in this
-- WHERE (they often have zero invariant hits). They are tagged
-- primary_class = party_trusts_paid_amount in STEP 2-paid / 2-466-list / 2c.
-- Do not dump those 234 into off_cause_unclear — they are not this query.
-- LIMIT 1000. Mismatch COUNT / rupee split is STEP 2c. Invariant COUNT is 2b.
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
    -- party_trusts_paid_amount is assigned in STEP 2-paid / 2-466, not here.
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
UNION ALL
SELECT 'party_trusts_paid_amount',
       NULL,
       'STEP 2-paid / 2-466 / 2c — gap equals paid_amount (full) or paid-over-receipts (partial). Not an invariant check. Do not fold into recompute.'
UNION ALL
SELECT 'manual_adjustment_overlay',
       NULL,
       'STEP 2-17 / 2c — gap equals SUM(customer_balance_adjustments.outstanding_difference)'
UNION ALL
SELECT 'advance_over_application',
       NULL,
       'STEP 2-17 / 2c — gap equals SUM(customer_advances.used_amount)'
UNION ALL
SELECT 'unrecorded_refund',
       NULL,
       'STEP 2-17 / 2c — gap equals customer payment vouchers (party extra term)'
UNION ALL
SELECT 'orphan_receipt',
       NULL,
       'STEP 2-17 / 2c — receipts on soft-deleted sales of this customer'
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
-- STEP 5 — P0 / P1 / P2 repair QUEUE for all 717 mismatches (SELECT only)
-- Same classified CTE as STEP 2c. Names + phone + proposed_write per row.
-- Tiers (this pass):
--   P0: |party_signed| ≥ ₹1,00,000 OR |gap| ≥ ₹50,000
--   P1: named pattern AND (|party_signed| ≥ ₹5,000 OR |gap| ≥ ₹5,000)
--   P2: remaining named, or unexplained with |gap| > ₹1
-- proposed_write is the exact later write, not a generic "repair the balance".
-- Do not execute any write from this result.
-- LIMIT 1000 (717 fits one page).
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
dup_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      COALESCE(i.entity_ref, ve.voucher_number)::text
        || ' ₹' || ROUND(ABS(COALESCE(i.detail, ve.total_amount, 0))::numeric, 2)::text AS label,
      row_number() OVER (
        PARTITION BY s.customer_id
        ORDER BY ABS(COALESCE(i.detail, 0)) DESC, i.entity_ref
      ) AS rn
    FROM public.v_accounting_invariants i
    CROSS JOIN params p
    JOIN public.voucher_entries ve
      ON ve.id = i.entity_id AND ve.organization_id = i.organization_id
    JOIN public.sales s
      ON s.id = ve.reference_id AND s.organization_id = i.organization_id
    WHERE i.organization_id = p.org_id
      AND i.check_name = 'rapid_duplicate_receipt'
      AND s.customer_id IS NOT NULL
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
baseline_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      s.sale_number
        || ' baseline=' || ROUND(COALESCE(s.legacy_paid_baseline, 0), 2)::text
        || ' receipts=' || ROUND(r.receipt_total, 2)::text AS label,
      row_number() OVER (
        PARTITION BY s.customer_id
        ORDER BY LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total) DESC
      ) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
cn_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      s.sale_number
        || ' SRA=' || ROUND(COALESCE(s.sale_return_adjust, 0), 2)::text
        || ' CN=' || ROUND(cn.cn_amt, 2)::text AS label,
      row_number() OVER (PARTITION BY s.customer_id ORDER BY COALESCE(s.sale_return_adjust, 0) DESC) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
adj_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      cba.customer_id,
      COALESCE(cba.adjustment_date::text, '')
        || ' ₹' || ROUND(cba.outstanding_difference, 2)::text
        || ' ' || left(COALESCE(cba.reason, ''), 40) AS label,
      row_number() OVER (
        PARTITION BY cba.customer_id
        ORDER BY ABS(cba.outstanding_difference) DESC
      ) AS rn
    FROM public.customer_balance_adjustments cba
    CROSS JOIN params p
    WHERE cba.organization_id = p.org_id
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
advance_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      ca.customer_id,
      ca.advance_number
        || ' used=' || ROUND(COALESCE(ca.used_amount, 0), 2)::text
        || '/' || ROUND(COALESCE(ca.amount, 0), 2)::text AS label,
      row_number() OVER (PARTITION BY ca.customer_id ORDER BY COALESCE(ca.used_amount, 0) DESC) AS rn
    FROM public.customer_advances ca
    CROSS JOIN params p
    WHERE ca.organization_id = p.org_id
      AND COALESCE(ca.used_amount, 0) > 0.009
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
refund_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      ve.reference_id AS customer_id,
      COALESCE(ve.voucher_number, ve.id::text)
        || ' ₹' || ROUND(GREATEST(0::numeric, COALESCE(ve.total_amount, 0)), 2)::text AS label,
      row_number() OVER (
        PARTITION BY ve.reference_id
        ORDER BY COALESCE(ve.total_amount, 0) DESC
      ) AS rn
    FROM public.voucher_entries ve
    CROSS JOIN params p
    WHERE ve.organization_id = p.org_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
orphan_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      COALESCE(s.sale_number, s.id::text)
        || ' (deleted) '
        || COALESCE(ve.voucher_number, ve.id::text)
        || ' ₹' || ROUND(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 2)::text AS label,
      row_number() OVER (PARTITION BY s.customer_id ORDER BY COALESCE(ve.total_amount, 0) DESC) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
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
),
with_write AS (
  SELECT
    r.customer_id,
    r.customer_name,
    r.phone,
    r.party_signed,
    r.recomputed_7_both_eras,
    r.gap_recompute_minus_party,
    r.abs_gap,
    r.cohort,
    r.paid_trust_kind,
    r.named_pattern,
    r.queue_tier,
    r.paid_amount_sum,
    r.receipt_payments_both_eras,
    CASE r.named_pattern
      WHEN 'party_trusts_paid_amount' THEN
        'QUEUE ONLY — two options pending Tausif architecture sign-off: '
        || '(A) correct sales.paid_amount to match receipts+tender+advances '
        || '(paid_amount_sum=' || ROUND(r.paid_amount_sum, 2)::text
        || ', receipts=' || ROUND(r.receipt_payments_both_eras, 2)::text
        || ', gap=' || ROUND(r.gap_recompute_minus_party, 2)::text
        || ', kind=' || r.paid_trust_kind
        || '); (B) stop crediting paid_amount in the party function '
        || '(live GREATEST(paid_amount, tender) shape even when tender=0). '
        || 'Do not write paid_amount and do not patch the party RPC from this queue.'
      WHEN 'duplicate_receipt' THEN
        'Soft-delete the duplicate receipt voucher(s) after dry-run + 5-row hand-check '
        || '(Parishma class — do not auto-delete): '
        || COALESCE(dl.labels, '(see v_accounting_invariants.rapid_duplicate_receipt)')
      WHEN 'legacy_paid_baseline' THEN
        'Named baseline∩receipts on sale(s) (Asma Shareef / INV/26-27/2288 shape). '
        || 'Capture live compute_sale_settlement DDL before any baseline write. '
        || 'Do not zero all baselines. Sales: '
        || COALESCE(bl.labels, '(see Step 3e)')
      WHEN 'cn_double_count' THEN
        'CN double-count: SRA + credit_note_adjustment voucher + remaining CAB. '
        || 'Repair only via adjust_invoice_balance (Shumama R2). No bare createReceiptVoucher. Sales: '
        || COALESCE(cnl.labels, '(see Step 2 cn_double)')
      WHEN 'manual_adjustment_overlay' THEN
        'Gap equals SUM(customer_balance_adjustments.outstanding_difference). '
        || 'Do not reverse a shop-entered patch without dry-run. Adjustments: '
        || COALESCE(al.labels, '(no label)')
      WHEN 'advance_over_application' THEN
        'Gap equals SUM(customer_advances.used_amount). '
        || 'Do not auto-refund (Anusha / Parishma class — human judgement). Advances: '
        || COALESCE(avl.labels, '(no label)')
      WHEN 'unrecorded_refund' THEN
        'Party subtracts customer payment voucher(s) the seven-component omits. '
        || 'Investigate before any write (Farhaan Fab class: confirm the voucher is a real refund, not a CN memo). Vouchers: '
        || COALESCE(rfl.labels, '(no label)')
      WHEN 'orphan_receipt' THEN
        'Receipts sitting on soft-deleted sales. Recycle-bin / deleted_at investigation — no hard delete. '
        || COALESCE(ol.labels, '(no label)')
      ELSE
        'GENUINELY UNEXPLAINED — fresh look required. Do not force-fit into party_trusts_paid_amount or any other named pattern. No write from this queue.'
    END AS proposed_write
  FROM ranked r
  LEFT JOIN dup_labels dl ON dl.customer_id = r.customer_id
  LEFT JOIN baseline_labels bl ON bl.customer_id = r.customer_id
  LEFT JOIN cn_labels cnl ON cnl.customer_id = r.customer_id
  LEFT JOIN adj_labels al ON al.customer_id = r.customer_id
  LEFT JOIN advance_labels avl ON avl.customer_id = r.customer_id
  LEFT JOIN refund_labels rfl ON rfl.customer_id = r.customer_id
  LEFT JOIN orphan_labels ol ON ol.customer_id = r.customer_id
)

SELECT
  w.queue_tier,
  w.named_pattern,
  w.customer_name,
  w.phone,
  w.customer_id,
  w.party_signed,
  w.recomputed_7_both_eras,
  w.gap_recompute_minus_party,
  w.abs_gap,
  w.cohort,
  w.paid_trust_kind,
  w.paid_amount_sum,
  w.receipt_payments_both_eras,
  w.proposed_write
FROM with_write w
ORDER BY
  CASE w.queue_tier WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
  CASE WHEN w.named_pattern = 'off_cause_unclear' THEN 1 ELSE 0 END,
  w.abs_gap DESC,
  w.customer_name
LIMIT 1000 OFFSET 0;



-- -----------------------------------------------------------------------------
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
-- STEP 5b — Queue headline (one row). P0 count + P0 rupee exposure.
-- abs_gap_p0 is the drift rupees on P0 rows (the urgency number for the
-- paid_amount architecture conversation). abs_party_p0 is |party_signed| sum.
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
dup_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      COALESCE(i.entity_ref, ve.voucher_number)::text
        || ' ₹' || ROUND(ABS(COALESCE(i.detail, ve.total_amount, 0))::numeric, 2)::text AS label,
      row_number() OVER (
        PARTITION BY s.customer_id
        ORDER BY ABS(COALESCE(i.detail, 0)) DESC, i.entity_ref
      ) AS rn
    FROM public.v_accounting_invariants i
    CROSS JOIN params p
    JOIN public.voucher_entries ve
      ON ve.id = i.entity_id AND ve.organization_id = i.organization_id
    JOIN public.sales s
      ON s.id = ve.reference_id AND s.organization_id = i.organization_id
    WHERE i.organization_id = p.org_id
      AND i.check_name = 'rapid_duplicate_receipt'
      AND s.customer_id IS NOT NULL
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
baseline_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      s.sale_number
        || ' baseline=' || ROUND(COALESCE(s.legacy_paid_baseline, 0), 2)::text
        || ' receipts=' || ROUND(r.receipt_total, 2)::text AS label,
      row_number() OVER (
        PARTITION BY s.customer_id
        ORDER BY LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total) DESC
      ) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
cn_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      s.sale_number
        || ' SRA=' || ROUND(COALESCE(s.sale_return_adjust, 0), 2)::text
        || ' CN=' || ROUND(cn.cn_amt, 2)::text AS label,
      row_number() OVER (PARTITION BY s.customer_id ORDER BY COALESCE(s.sale_return_adjust, 0) DESC) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
adj_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      cba.customer_id,
      COALESCE(cba.adjustment_date::text, '')
        || ' ₹' || ROUND(cba.outstanding_difference, 2)::text
        || ' ' || left(COALESCE(cba.reason, ''), 40) AS label,
      row_number() OVER (
        PARTITION BY cba.customer_id
        ORDER BY ABS(cba.outstanding_difference) DESC
      ) AS rn
    FROM public.customer_balance_adjustments cba
    CROSS JOIN params p
    WHERE cba.organization_id = p.org_id
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
advance_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      ca.customer_id,
      ca.advance_number
        || ' used=' || ROUND(COALESCE(ca.used_amount, 0), 2)::text
        || '/' || ROUND(COALESCE(ca.amount, 0), 2)::text AS label,
      row_number() OVER (PARTITION BY ca.customer_id ORDER BY COALESCE(ca.used_amount, 0) DESC) AS rn
    FROM public.customer_advances ca
    CROSS JOIN params p
    WHERE ca.organization_id = p.org_id
      AND COALESCE(ca.used_amount, 0) > 0.009
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
refund_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      ve.reference_id AS customer_id,
      COALESCE(ve.voucher_number, ve.id::text)
        || ' ₹' || ROUND(GREATEST(0::numeric, COALESCE(ve.total_amount, 0)), 2)::text AS label,
      row_number() OVER (
        PARTITION BY ve.reference_id
        ORDER BY COALESCE(ve.total_amount, 0) DESC
      ) AS rn
    FROM public.voucher_entries ve
    CROSS JOIN params p
    WHERE ve.organization_id = p.org_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
orphan_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      COALESCE(s.sale_number, s.id::text)
        || ' (deleted) '
        || COALESCE(ve.voucher_number, ve.id::text)
        || ' ₹' || ROUND(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 2)::text AS label,
      row_number() OVER (PARTITION BY s.customer_id ORDER BY COALESCE(ve.total_amount, 0) DESC) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
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
),
with_write AS (
  SELECT
    r.customer_id,
    r.customer_name,
    r.phone,
    r.party_signed,
    r.recomputed_7_both_eras,
    r.gap_recompute_minus_party,
    r.abs_gap,
    r.cohort,
    r.paid_trust_kind,
    r.named_pattern,
    r.queue_tier,
    r.paid_amount_sum,
    r.receipt_payments_both_eras,
    CASE r.named_pattern
      WHEN 'party_trusts_paid_amount' THEN
        'QUEUE ONLY — two options pending Tausif architecture sign-off: '
        || '(A) correct sales.paid_amount to match receipts+tender+advances '
        || '(paid_amount_sum=' || ROUND(r.paid_amount_sum, 2)::text
        || ', receipts=' || ROUND(r.receipt_payments_both_eras, 2)::text
        || ', gap=' || ROUND(r.gap_recompute_minus_party, 2)::text
        || ', kind=' || r.paid_trust_kind
        || '); (B) stop crediting paid_amount in the party function '
        || '(live GREATEST(paid_amount, tender) shape even when tender=0). '
        || 'Do not write paid_amount and do not patch the party RPC from this queue.'
      WHEN 'duplicate_receipt' THEN
        'Soft-delete the duplicate receipt voucher(s) after dry-run + 5-row hand-check '
        || '(Parishma class — do not auto-delete): '
        || COALESCE(dl.labels, '(see v_accounting_invariants.rapid_duplicate_receipt)')
      WHEN 'legacy_paid_baseline' THEN
        'Named baseline∩receipts on sale(s) (Asma Shareef / INV/26-27/2288 shape). '
        || 'Capture live compute_sale_settlement DDL before any baseline write. '
        || 'Do not zero all baselines. Sales: '
        || COALESCE(bl.labels, '(see Step 3e)')
      WHEN 'cn_double_count' THEN
        'CN double-count: SRA + credit_note_adjustment voucher + remaining CAB. '
        || 'Repair only via adjust_invoice_balance (Shumama R2). No bare createReceiptVoucher. Sales: '
        || COALESCE(cnl.labels, '(see Step 2 cn_double)')
      WHEN 'manual_adjustment_overlay' THEN
        'Gap equals SUM(customer_balance_adjustments.outstanding_difference). '
        || 'Do not reverse a shop-entered patch without dry-run. Adjustments: '
        || COALESCE(al.labels, '(no label)')
      WHEN 'advance_over_application' THEN
        'Gap equals SUM(customer_advances.used_amount). '
        || 'Do not auto-refund (Anusha / Parishma class — human judgement). Advances: '
        || COALESCE(avl.labels, '(no label)')
      WHEN 'unrecorded_refund' THEN
        'Party subtracts customer payment voucher(s) the seven-component omits. '
        || 'Investigate before any write (Farhaan Fab class: confirm the voucher is a real refund, not a CN memo). Vouchers: '
        || COALESCE(rfl.labels, '(no label)')
      WHEN 'orphan_receipt' THEN
        'Receipts sitting on soft-deleted sales. Recycle-bin / deleted_at investigation — no hard delete. '
        || COALESCE(ol.labels, '(no label)')
      ELSE
        'GENUINELY UNEXPLAINED — fresh look required. Do not force-fit into party_trusts_paid_amount or any other named pattern. No write from this queue.'
    END AS proposed_write
  FROM ranked r
  LEFT JOIN dup_labels dl ON dl.customer_id = r.customer_id
  LEFT JOIN baseline_labels bl ON bl.customer_id = r.customer_id
  LEFT JOIN cn_labels cnl ON cnl.customer_id = r.customer_id
  LEFT JOIN adj_labels al ON al.customer_id = r.customer_id
  LEFT JOIN advance_labels avl ON avl.customer_id = r.customer_id
  LEFT JOIN refund_labels rfl ON rfl.customer_id = r.customer_id
  LEFT JOIN orphan_labels ol ON ol.customer_id = r.customer_id
)

SELECT
  COUNT(*) AS n_queue,
  COUNT(*) FILTER (WHERE named_pattern <> 'off_cause_unclear') AS n_classified,
  COUNT(*) FILTER (WHERE named_pattern = 'off_cause_unclear') AS n_genuinely_unexplained,
  COUNT(*) FILTER (WHERE queue_tier = 'P0') AS n_p0,
  COUNT(*) FILTER (WHERE queue_tier = 'P1') AS n_p1,
  COUNT(*) FILTER (WHERE queue_tier = 'P2') AS n_p2,
  COUNT(*) FILTER (WHERE queue_tier = 'P0' AND named_pattern = 'party_trusts_paid_amount')
    AS n_p0_party_trusts_paid_amount,
  COUNT(*) FILTER (WHERE queue_tier = 'P0' AND named_pattern = 'off_cause_unclear')
    AS n_p0_unexplained,
  ROUND(SUM(abs_gap), 2) AS abs_gap_all,
  ROUND(SUM(abs_gap) FILTER (WHERE queue_tier = 'P0'), 2) AS abs_gap_p0,
  ROUND(SUM(ABS(party_signed)) FILTER (WHERE queue_tier = 'P0'), 2) AS abs_party_p0,
  ROUND(SUM(abs_gap) FILTER (
    WHERE queue_tier = 'P0' AND named_pattern = 'party_trusts_paid_amount'
  ), 2) AS abs_gap_p0_party_trusts_paid_amount,
  ROUND(SUM(abs_gap) FILTER (WHERE queue_tier = 'P1'), 2) AS abs_gap_p1,
  ROUND(SUM(abs_gap) FILTER (WHERE queue_tier = 'P2'), 2) AS abs_gap_p2,
  ROUND(SUM(abs_gap) FILTER (WHERE named_pattern = 'party_trusts_paid_amount'), 2)
    AS abs_gap_party_trusts_paid_amount,
  ROUND(SUM(abs_gap) FILTER (WHERE named_pattern = 'off_cause_unclear'), 2)
    AS abs_gap_unexplained
FROM with_write;


-- -----------------------------------------------------------------------------
-- STEP 5-unexplained — the 35 genuinely-unexplained customers.
-- Separate worklist. Do NOT fold these into party_trusts_paid_amount or any
-- other named pattern by force-fit. Fresh look required. SELECT-only.
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
dup_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      COALESCE(i.entity_ref, ve.voucher_number)::text
        || ' ₹' || ROUND(ABS(COALESCE(i.detail, ve.total_amount, 0))::numeric, 2)::text AS label,
      row_number() OVER (
        PARTITION BY s.customer_id
        ORDER BY ABS(COALESCE(i.detail, 0)) DESC, i.entity_ref
      ) AS rn
    FROM public.v_accounting_invariants i
    CROSS JOIN params p
    JOIN public.voucher_entries ve
      ON ve.id = i.entity_id AND ve.organization_id = i.organization_id
    JOIN public.sales s
      ON s.id = ve.reference_id AND s.organization_id = i.organization_id
    WHERE i.organization_id = p.org_id
      AND i.check_name = 'rapid_duplicate_receipt'
      AND s.customer_id IS NOT NULL
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
baseline_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      s.sale_number
        || ' baseline=' || ROUND(COALESCE(s.legacy_paid_baseline, 0), 2)::text
        || ' receipts=' || ROUND(r.receipt_total, 2)::text AS label,
      row_number() OVER (
        PARTITION BY s.customer_id
        ORDER BY LEAST(COALESCE(s.legacy_paid_baseline, 0), r.receipt_total) DESC
      ) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
cn_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      s.sale_number
        || ' SRA=' || ROUND(COALESCE(s.sale_return_adjust, 0), 2)::text
        || ' CN=' || ROUND(cn.cn_amt, 2)::text AS label,
      row_number() OVER (PARTITION BY s.customer_id ORDER BY COALESCE(s.sale_return_adjust, 0) DESC) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
adj_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      cba.customer_id,
      COALESCE(cba.adjustment_date::text, '')
        || ' ₹' || ROUND(cba.outstanding_difference, 2)::text
        || ' ' || left(COALESCE(cba.reason, ''), 40) AS label,
      row_number() OVER (
        PARTITION BY cba.customer_id
        ORDER BY ABS(cba.outstanding_difference) DESC
      ) AS rn
    FROM public.customer_balance_adjustments cba
    CROSS JOIN params p
    WHERE cba.organization_id = p.org_id
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
advance_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      ca.customer_id,
      ca.advance_number
        || ' used=' || ROUND(COALESCE(ca.used_amount, 0), 2)::text
        || '/' || ROUND(COALESCE(ca.amount, 0), 2)::text AS label,
      row_number() OVER (PARTITION BY ca.customer_id ORDER BY COALESCE(ca.used_amount, 0) DESC) AS rn
    FROM public.customer_advances ca
    CROSS JOIN params p
    WHERE ca.organization_id = p.org_id
      AND COALESCE(ca.used_amount, 0) > 0.009
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
refund_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      ve.reference_id AS customer_id,
      COALESCE(ve.voucher_number, ve.id::text)
        || ' ₹' || ROUND(GREATEST(0::numeric, COALESCE(ve.total_amount, 0)), 2)::text AS label,
      row_number() OVER (
        PARTITION BY ve.reference_id
        ORDER BY COALESCE(ve.total_amount, 0) DESC
      ) AS rn
    FROM public.voucher_entries ve
    CROSS JOIN params p
    WHERE ve.organization_id = p.org_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
orphan_labels AS (
  SELECT customer_id, string_agg(label, '; ' ORDER BY label) AS labels
  FROM (
    SELECT
      s.customer_id,
      COALESCE(s.sale_number, s.id::text)
        || ' (deleted) '
        || COALESCE(ve.voucher_number, ve.id::text)
        || ' ₹' || ROUND(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 2)::text AS label,
      row_number() OVER (PARTITION BY s.customer_id ORDER BY COALESCE(ve.total_amount, 0) DESC) AS rn
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
  ) x
  WHERE rn <= 15
  GROUP BY customer_id
),
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
),
with_write AS (
  SELECT
    r.customer_id,
    r.customer_name,
    r.phone,
    r.party_signed,
    r.recomputed_7_both_eras,
    r.gap_recompute_minus_party,
    r.abs_gap,
    r.cohort,
    r.paid_trust_kind,
    r.named_pattern,
    r.queue_tier,
    r.paid_amount_sum,
    r.receipt_payments_both_eras,
    CASE r.named_pattern
      WHEN 'party_trusts_paid_amount' THEN
        'QUEUE ONLY — two options pending Tausif architecture sign-off: '
        || '(A) correct sales.paid_amount to match receipts+tender+advances '
        || '(paid_amount_sum=' || ROUND(r.paid_amount_sum, 2)::text
        || ', receipts=' || ROUND(r.receipt_payments_both_eras, 2)::text
        || ', gap=' || ROUND(r.gap_recompute_minus_party, 2)::text
        || ', kind=' || r.paid_trust_kind
        || '); (B) stop crediting paid_amount in the party function '
        || '(live GREATEST(paid_amount, tender) shape even when tender=0). '
        || 'Do not write paid_amount and do not patch the party RPC from this queue.'
      WHEN 'duplicate_receipt' THEN
        'Soft-delete the duplicate receipt voucher(s) after dry-run + 5-row hand-check '
        || '(Parishma class — do not auto-delete): '
        || COALESCE(dl.labels, '(see v_accounting_invariants.rapid_duplicate_receipt)')
      WHEN 'legacy_paid_baseline' THEN
        'Named baseline∩receipts on sale(s) (Asma Shareef / INV/26-27/2288 shape). '
        || 'Capture live compute_sale_settlement DDL before any baseline write. '
        || 'Do not zero all baselines. Sales: '
        || COALESCE(bl.labels, '(see Step 3e)')
      WHEN 'cn_double_count' THEN
        'CN double-count: SRA + credit_note_adjustment voucher + remaining CAB. '
        || 'Repair only via adjust_invoice_balance (Shumama R2). No bare createReceiptVoucher. Sales: '
        || COALESCE(cnl.labels, '(see Step 2 cn_double)')
      WHEN 'manual_adjustment_overlay' THEN
        'Gap equals SUM(customer_balance_adjustments.outstanding_difference). '
        || 'Do not reverse a shop-entered patch without dry-run. Adjustments: '
        || COALESCE(al.labels, '(no label)')
      WHEN 'advance_over_application' THEN
        'Gap equals SUM(customer_advances.used_amount). '
        || 'Do not auto-refund (Anusha / Parishma class — human judgement). Advances: '
        || COALESCE(avl.labels, '(no label)')
      WHEN 'unrecorded_refund' THEN
        'Party subtracts customer payment voucher(s) the seven-component omits. '
        || 'Investigate before any write (Farhaan Fab class: confirm the voucher is a real refund, not a CN memo). Vouchers: '
        || COALESCE(rfl.labels, '(no label)')
      WHEN 'orphan_receipt' THEN
        'Receipts sitting on soft-deleted sales. Recycle-bin / deleted_at investigation — no hard delete. '
        || COALESCE(ol.labels, '(no label)')
      ELSE
        'GENUINELY UNEXPLAINED — fresh look required. Do not force-fit into party_trusts_paid_amount or any other named pattern. No write from this queue.'
    END AS proposed_write
  FROM ranked r
  LEFT JOIN dup_labels dl ON dl.customer_id = r.customer_id
  LEFT JOIN baseline_labels bl ON bl.customer_id = r.customer_id
  LEFT JOIN cn_labels cnl ON cnl.customer_id = r.customer_id
  LEFT JOIN adj_labels al ON al.customer_id = r.customer_id
  LEFT JOIN advance_labels avl ON avl.customer_id = r.customer_id
  LEFT JOIN refund_labels rfl ON rfl.customer_id = r.customer_id
  LEFT JOIN orphan_labels ol ON ol.customer_id = r.customer_id
)

SELECT
  w.queue_tier,
  w.named_pattern,
  w.customer_name,
  w.phone,
  w.customer_id,
  w.party_signed,
  w.recomputed_7_both_eras,
  w.gap_recompute_minus_party,
  w.abs_gap,
  w.cohort,
  w.paid_amount_sum,
  w.receipt_payments_both_eras,
  true AS force_fit_forbidden,
  w.proposed_write
FROM with_write w
WHERE w.named_pattern = 'off_cause_unclear'
ORDER BY
  CASE w.queue_tier WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
  w.abs_gap DESC,
  w.customer_name
LIMIT 1000 OFFSET 0;


-- END. No writes follow.
