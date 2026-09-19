-- STEP 2a — Group B duplicate-receipt repair: DRY RUN. READ ONLY.
-- Run only AFTER the step-1 reconciliation (ssot-step1-materialise-51-vs-91) is reviewed.
-- No INSERT/UPDATE/DELETE. This lists every receipt row the mutate WOULD soft-delete,
-- with before/after per bill and per customer. The mutate script is a separate file
-- and does not exist until this output is reviewed and five rows are hand-checked.
--
-- Group B (customer-level, from the 21:09 scan, v2 gate):
--   receipt-bearing leftover-sum over-credit > 1, customer_id not null,
--   NOT Santosh, NOT DOLLY (bc266355 — 454 is genuine instalments, 459/478 refund shape),
--   bill shape ≠ NET_DUE_ZERO (receipt on a fully-returned bill = refund owed, never delete),
--   customer-level SNAP drop after repair = 0 (else Group A — blocked on bucket g).
--
-- Leg selection — chronological walk over the bill's cash receipts (memo receipts
-- excluded via _is_settlement_memo_receipt), at-sale tender treated as paid first:
--   remaining_before = net_due − tender − SUM(earlier cash receipts)
--   DELETE_WHOLE   remaining_before ≤ 0.5            (receipt is entirely redundant)
--   HOLD_PARTIAL   0.5 < remaining_before < amount−0.5 (only part of it is redundant)
--   KEEP           otherwise
-- Customer status:
--   READY          every over-credited bill on the customer reconciles:
--                  SUM(DELETE_WHOLE) = over_credit within ₹1, no HOLD_PARTIAL
--   HOLD           any HOLD_PARTIAL, any reconcile mismatch, or any bill still A/NDZ.
--                  Customer-atomic: a HOLD anywhere holds every bill on the customer.
--
-- Predicted post-repair paid uses the live rule LEAST(net_due, GREATEST(receipts_after, tender))
-- (compute_sale_settlement). Because B has no SNAP drop, receipts_after < tender or tender = 0
-- on every bill, so this equals the ledger view.

WITH org_ids AS (
  SELECT unnest(ARRAY[
    'e8fbf0d8-182c-4364-8570-96c756b72db8'::uuid, -- GURUKRUPA
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid, -- VELVET
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid, -- ELLA NOOR
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid  -- KS FOOTWEAR
  ]) AS id
),
excluded_customers AS (
  SELECT unnest(ARRAY[
    '1167547a-2ef1-4931-8993-2cb21ebcb619'::uuid, -- SANTOSH — own thread (1131-1)
    'bc266355-68d6-424b-b71c-855aad2395c4'::uuid  -- DOLLY — 454 genuine, 459/478 refund shape
  ]) AS id
),
sale_base AS (
  SELECT
    s.id,
    s.organization_id,
    s.customer_id,
    s.sale_number,
    s.sale_date,
    s.payment_status,
    GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) AS net_due,
    COALESCE(s.paid_amount, 0) AS paid_amount,
    GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0) AS tender
  FROM public.sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
    AND s.organization_id IN (SELECT id FROM org_ids)
),
cash_receipts AS (
  SELECT
    ve.id AS voucher_id,
    ve.organization_id,
    ve.reference_id AS sale_id,
    ve.voucher_number,
    ve.voucher_date,
    ve.created_at,
    ve.payment_method,
    ve.description,
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amount
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_ids)
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
),
per_sale AS (
  SELECT
    sb.*,
    COALESCE(SUM(cr.amount), 0) AS receipts_live,
    COUNT(cr.voucher_id)        AS receipt_rows,
    GREATEST(0::numeric, COALESCE(SUM(cr.amount), 0) + sb.tender - sb.net_due) AS over_credit
  FROM sale_base sb
  LEFT JOIN cash_receipts cr
    ON cr.sale_id::text = sb.id::text
   AND cr.organization_id = sb.organization_id
  GROUP BY sb.id, sb.organization_id, sb.customer_id, sb.sale_number, sb.sale_date,
           sb.payment_status, sb.net_due, sb.paid_amount, sb.tender
),
repair_bills AS (
  SELECT
    ps.*,
    GREATEST(0::numeric, ps.receipts_live - ps.over_credit) AS receipts_after,
    CASE
      WHEN ps.net_due <= 0.005 THEN 'NET_DUE_ZERO'
      WHEN ps.tender <= 0.005 AND abs(ps.receipts_live - 2 * ps.net_due) <= 1 THEN 'EXACT_DOUBLE_RECEIPT'
      WHEN ps.tender > 0.005 AND ps.receipts_live - ps.over_credit <= 0.005 THEN 'RECEIPT_DUPLICATES_AT_SALE_TENDER'
      WHEN ps.receipts_live - ps.net_due > 1 THEN 'RECEIPT_OVER_PARTIAL'
      ELSE 'MIXED_TENDER_PLUS_RECEIPT_OVER'
    END AS shape
  FROM per_sale ps
  WHERE ps.over_credit > 1
    AND ps.receipts_live > 0.005
    AND ps.customer_id IS NOT NULL
),
repair_customers AS (
  SELECT DISTINCT customer_id FROM repair_bills
),
-- customer-level SNAP drop AFTER repair (same rule as the v2 scan)
customer_snap AS (
  SELECT
    ps.customer_id,
    SUM(
      CASE
        WHEN ps.tender > 0.005
         AND (CASE WHEN rb.id IS NOT NULL THEN rb.receipts_after ELSE ps.receipts_live END) >= ps.tender
          THEN ps.tender ELSE 0
      END
    ) AS snap_drop_after
  FROM per_sale ps
  JOIN repair_customers rc ON rc.customer_id = ps.customer_id
  LEFT JOIN repair_bills rb ON rb.id = ps.id
  GROUP BY ps.customer_id
),
group_b_bills AS (
  SELECT rb.*
  FROM repair_bills rb
  JOIN customer_snap cs ON cs.customer_id = rb.customer_id
  WHERE cs.snap_drop_after <= 0.005
    AND rb.customer_id NOT IN (SELECT id FROM excluded_customers)
    AND rb.shape <> 'NET_DUE_ZERO'
),
-- chronological walk
legs AS (
  SELECT
    gb.customer_id,
    gb.organization_id,
    gb.sale_number,
    gb.id AS sale_id,
    gb.shape,
    gb.net_due,
    gb.tender,
    gb.over_credit,
    cr.voucher_id,
    cr.voucher_number,
    cr.voucher_date,
    cr.created_at,
    cr.payment_method,
    cr.amount,
    gb.net_due - gb.tender
      - COALESCE(SUM(cr.amount) OVER (
          PARTITION BY gb.id ORDER BY cr.created_at, cr.voucher_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS remaining_before
  FROM group_b_bills gb
  JOIN cash_receipts cr
    ON cr.sale_id::text = gb.id::text
   AND cr.organization_id = gb.organization_id
),
legs_action AS (
  SELECT
    l.*,
    CASE
      WHEN l.remaining_before <= 0.5 THEN 'DELETE_WHOLE'
      WHEN l.remaining_before < l.amount - 0.5 THEN 'HOLD_PARTIAL'
      ELSE 'KEEP'
    END AS action
  FROM legs l
),
bill_recon AS (
  SELECT
    gb.customer_id,
    gb.organization_id,
    gb.sale_number,
    gb.id AS sale_id,
    gb.shape,
    gb.net_due,
    gb.tender,
    gb.receipts_live,
    gb.over_credit,
    gb.paid_amount,
    gb.payment_status,
    COALESCE(SUM(la.amount) FILTER (WHERE la.action = 'DELETE_WHOLE'), 0) AS delete_sum,
    COUNT(*) FILTER (WHERE la.action = 'DELETE_WHOLE')  AS delete_rows,
    COUNT(*) FILTER (WHERE la.action = 'HOLD_PARTIAL')  AS partial_rows,
    gb.receipts_live - COALESCE(SUM(la.amount) FILTER (WHERE la.action = 'DELETE_WHOLE'), 0) AS receipts_after_pred
  FROM group_b_bills gb
  LEFT JOIN legs_action la ON la.sale_id = gb.id
  GROUP BY gb.customer_id, gb.organization_id, gb.sale_number, gb.id, gb.shape, gb.net_due,
           gb.tender, gb.receipts_live, gb.over_credit, gb.paid_amount, gb.payment_status
),
bill_pred AS (
  SELECT
    br.*,
    LEAST(br.net_due, GREATEST(br.receipts_after_pred, br.tender)) AS paid_pred,
    CASE
      WHEN br.net_due - LEAST(br.net_due, GREATEST(br.receipts_after_pred, br.tender)) <= 0.5 THEN 'completed'
      WHEN LEAST(br.net_due, GREATEST(br.receipts_after_pred, br.tender)) > 0 THEN 'partial'
      ELSE 'pending'
    END AS status_pred,
    CASE
      WHEN br.partial_rows > 0 THEN 'HOLD_PARTIAL'
      WHEN abs(br.delete_sum - br.over_credit) > 1 THEN 'HOLD_RECON_MISMATCH'
      WHEN br.delete_rows = 0 THEN 'HOLD_NO_WHOLE_LEG'
      ELSE 'OK'
    END AS bill_status
  FROM bill_recon br
),
customer_status AS (
  SELECT
    bp.customer_id,
    COUNT(*) AS bills,
    SUM(bp.over_credit) AS over_credit,
    SUM(bp.delete_sum) AS delete_sum,
    SUM(bp.delete_rows) AS delete_rows,
    CASE WHEN bool_and(bp.bill_status = 'OK') THEN 'READY' ELSE 'HOLD' END AS customer_status,
    string_agg(DISTINCT bp.bill_status, '+') AS statuses,
    string_agg(bp.sale_number, ', ' ORDER BY bp.sale_number) AS bill_list
  FROM bill_pred bp
  GROUP BY bp.customer_id
)
SELECT
  'headline'::text AS section,
  NULL::text AS status,
  NULL::uuid AS customer_id,
  NULL::text AS sale_number,
  NULL::text AS voucher_number,
  NULL::text AS shape,
  COUNT(*)::numeric AS a,                                        -- customers in B
  SUM(bills)::numeric AS b,                                      -- bills
  SUM(over_credit) AS c,                                         -- over-credit
  SUM(delete_sum) AS d,                                          -- rupees the mutate would remove
  SUM(delete_rows)::numeric AS e,                                -- receipt rows
  COUNT(*) FILTER (WHERE customer_status = 'READY')::numeric AS f, -- READY customers
  COUNT(*) FILTER (WHERE customer_status = 'HOLD')::numeric AS g,  -- HOLD customers
  NULL::text AS h,
  NULL::text AS i
FROM customer_status
UNION ALL
SELECT
  'customer',
  cs.customer_status,
  cs.customer_id,
  NULL,
  NULL,
  cs.statuses,
  cs.bills::numeric,
  NULL,
  cs.over_credit,
  cs.delete_sum,
  cs.delete_rows::numeric,
  NULL, NULL,
  cs.bill_list,
  NULL
FROM customer_status cs
UNION ALL
SELECT
  'bill',
  bp.bill_status,
  bp.customer_id,
  bp.sale_number,
  NULL,
  bp.shape,
  bp.net_due,                    -- a
  bp.tender,                     -- b
  bp.receipts_live,              -- c
  bp.over_credit,                -- d
  bp.delete_sum,                 -- e
  bp.paid_amount,                -- f  live paid_amount
  bp.paid_pred,                  -- g  predicted paid_amount after
  bp.payment_status,             -- h  live status
  bp.status_pred                 -- i  predicted status after
FROM bill_pred bp
UNION ALL
SELECT
  'receipt',
  la.action,
  la.customer_id,
  la.sale_number,
  la.voucher_number,
  la.shape,
  la.amount,                     -- a
  la.remaining_before,           -- b
  la.net_due,                    -- c
  la.tender,                     -- d
  la.over_credit,                -- e
  NULL, NULL,
  to_char(la.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' ' || COALESCE(la.payment_method, ''),  -- h
  la.voucher_id::text            -- i  (needed by the mutate: id-scoped soft delete)
FROM legs_action la
ORDER BY 1, 3 NULLS FIRST, 4 NULLS FIRST, 5 NULLS FIRST;

-- Column map:
--   headline : a customers, b bills, c over-credit, d delete ₹, e receipt rows, f READY, g HOLD
--   customer : status READY/HOLD, shape = bill statuses, a bills, c over-credit, d delete ₹, e rows, h bill list
--   bill     : status OK/HOLD_*, a net_due, b tender, c receipts_live, d over_credit, e delete ₹,
--              f paid live, g paid predicted, h status live, i status predicted
--   receipt  : status DELETE_WHOLE/HOLD_PARTIAL/KEEP, a amount, b remaining_before, c net_due,
--              d tender, e over_credit, h created IST + method, i voucher_entries.id
--
-- Expect from the 21:09 scan: ≈ 49 customers / 57 bills / ≈ ₹1,75,637 over-credit
-- (B ₹1,82,134.51 − 4 NET_DUE_ZERO ₹4,998 − DOLLY 454 ₹1,500). delete ₹ will be LOWER than
-- over-credit wherever a leg is HOLD_PARTIAL; those customers are HOLD, not averaged in.
-- Five hand-checks before any mutate — one each from EXACT_DOUBLE_RECEIPT, RECEIPT_OVER_PARTIAL,
-- RECEIPT_DUPLICATES_AT_SALE_TENDER, MIXED_TENDER_PLUS_RECEIPT_OVER, and one multi-bill customer
-- (HEENA dde74df8: 853 + 1488 + 1594 + 1714 must all be READY together).
