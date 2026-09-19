-- STEP 2a — Group B duplicate-receipt repair: DRY RUN v2. READ ONLY.
-- No INSERT/UPDATE/DELETE. Lists every receipt row a mutate WOULD soft-delete, with the
-- evidence needed to say WHY it is a duplicate. The mutate script does not exist yet.
--
-- v1 (pasted 19 Sep 22:01 IST, docs/ssot-step2-group-b-dry-run-v1-live-2026-09-19-22-01-26.csv)
-- got 49 customers / 57 bills / ₹1,75,636.51 and marked 32 customers READY. Review found
-- three defects in v1, all fixed here:
--   1. Full at-sale tender was added to receipts. A POS bill that dual-writes cash_amount
--      AND a same-day receipt (or the app's own "Counter payment received for sale …"
--      backfill, saleSettlement.ts ensureAtSaleTenderReceipt) is NOT over-credited — the
--      printed ledger nets same-day receipts against tender. v2 does the same.
--   2. A "redundant" leg was deletable regardless of what it echoed. A ₹4,200 receipt on a
--      ₹8,200 bill already paid at the counter is not a duplicate of anything — it is
--      almost certainly a real payment referenced to the wrong bill (or the counter tender
--      was mis-keyed). Deleting it erases cash. v2 only auto-marks a leg when it ECHOES:
--      same amount (±1) as an earlier receipt on the bill (double submit), or same amount
--      as the residual counter tender on a LATER day (re-keyed counter cash). Everything
--      else is HOLD_NON_ECHO → re-reference or tender correction, decided by hand.
--   3. Same-minute pairs where the echo came FIRST (POS/26-27/2442: ₹7,000 then ₹5,000,
--      tender ₹7,000) deleted the wrong leg. v2 marks the leg that matches, not the last one.
--
-- Leg kinds:
--   DUP_DOUBLE_SUBMIT      amount = an earlier receipt on the bill (±1), bill already ≤ 0.5 due
--   DUP_TENDER_REKEYED     amount = tender_residual (±1), voucher_date ≠ sale day, bill already ≤ 0.5 due
--   COUNTER_MATERIALISED   description 'Counter payment received for sale%' — app backfill, by design
--   SAME_DAY_DUAL_WRITE    voucher_date = sale day and amount ≤ tender — POS dual-write, by design
--   BALANCE_ADJUSTMENT     payment_method balance_adjustment — 1 Jul 2026 15:25 batch, own thread
--   PARTIAL                only part of the leg is redundant
--   NON_ECHO_REDUNDANT     whole leg redundant but matches nothing — mis-reference / tender mis-key
--   KEEP                   needed
-- Action: DELETE only for DUP_DOUBLE_SUBMIT / DUP_TENDER_REKEYED. Everything else HOLD/KEEP.
-- Customer READY only if every over-credited bill reconciles on DELETE legs alone.

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
    (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date AS sale_day,
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
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amount,
    (ve.voucher_date IS NOT DISTINCT FROM sb.sale_day) AS same_day,
    (COALESCE(ve.description, '') ILIKE 'Counter payment received for sale%') AS is_counter_materialised,
    (lower(COALESCE(ve.payment_method, '')) = 'balance_adjustment') AS is_balance_adjustment
  FROM public.voucher_entries ve
  JOIN sale_base sb
    ON sb.id::text = ve.reference_id::text
   AND sb.organization_id = ve.organization_id
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
),
per_sale AS (
  SELECT
    sb.*,
    COALESCE(SUM(cr.amount), 0) AS receipts_live,
    COALESCE(SUM(cr.amount) FILTER (WHERE cr.same_day), 0) AS receipts_same_day,
    GREATEST(0::numeric, sb.tender - COALESCE(SUM(cr.amount) FILTER (WHERE cr.same_day), 0)) AS tender_residual,
    COUNT(cr.voucher_id) AS receipt_rows,
    GREATEST(
      0::numeric,
      COALESCE(SUM(cr.amount), 0)
        + GREATEST(0::numeric, sb.tender - COALESCE(SUM(cr.amount) FILTER (WHERE cr.same_day), 0))
        - sb.net_due
    ) AS over_credit
  FROM sale_base sb
  LEFT JOIN cash_receipts cr
    ON cr.sale_id::text = sb.id::text
   AND cr.organization_id = sb.organization_id
  GROUP BY sb.id, sb.organization_id, sb.customer_id, sb.sale_number, sb.sale_date, sb.sale_day,
           sb.payment_status, sb.net_due, sb.paid_amount, sb.tender
),
repair_bills AS (
  SELECT
    ps.*,
    GREATEST(0::numeric, ps.receipts_live - ps.over_credit) AS receipts_after,
    CASE
      WHEN ps.net_due <= 0.005 THEN 'NET_DUE_ZERO'
      WHEN ps.tender_residual <= 0.005 AND abs(ps.receipts_live - 2 * ps.net_due) <= 1 THEN 'EXACT_DOUBLE_RECEIPT'
      WHEN ps.tender_residual > 0.005 AND ps.receipts_live - ps.over_credit <= 0.005 THEN 'RECEIPT_DUPLICATES_AT_SALE_TENDER'
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
-- customer-level bucket-(g) drop AFTER repair: tender_residual − GREATEST(0, tender − receipts_effective)
customer_snap AS (
  SELECT
    ps.customer_id,
    SUM(
      GREATEST(
        0::numeric,
        ps.tender_residual
          - GREATEST(0::numeric, ps.tender - (CASE WHEN rb.id IS NOT NULL THEN rb.receipts_after ELSE ps.receipts_live END))
      )
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
-- One leg per bill may be the re-keyed counter tender: amount = tender_residual (±1), not on
-- the sale day, and the bill's over-credit is at least that amount. It is marked by amount,
-- not by position — same-minute pairs where the echo landed first are handled correctly.
legs_raw AS (
  SELECT
    gb.customer_id,
    gb.organization_id,
    gb.sale_number,
    gb.id AS sale_id,
    gb.sale_day,
    gb.shape,
    gb.net_due,
    gb.tender,
    gb.tender_residual,
    gb.over_credit,
    cr.voucher_id,
    cr.voucher_number,
    cr.voucher_date,
    cr.created_at,
    cr.payment_method,
    cr.description,
    cr.amount,
    cr.same_day,
    cr.is_counter_materialised,
    cr.is_balance_adjustment,
    (
      NOT cr.same_day
      AND NOT cr.is_balance_adjustment
      AND gb.tender_residual > 0.005
      AND abs(cr.amount - gb.tender_residual) <= 1
      AND gb.over_credit >= cr.amount - 1
      AND ROW_NUMBER() OVER (
            PARTITION BY gb.id,
              (NOT cr.same_day AND gb.tender_residual > 0.005 AND abs(cr.amount - gb.tender_residual) <= 1)
            ORDER BY cr.created_at, cr.voucher_id) = 1
    ) AS is_tender_echo
  FROM group_b_bills gb
  JOIN cash_receipts cr
    ON cr.sale_id::text = gb.id::text
   AND cr.organization_id = gb.organization_id
),
-- chronological walk over the remaining legs; residual tender is paid first
legs AS (
  SELECT
    lr.*,
    lr.net_due - lr.tender_residual
      - COALESCE(SUM(CASE WHEN lr.is_tender_echo THEN 0 ELSE lr.amount END) OVER (
          PARTITION BY lr.sale_id ORDER BY lr.created_at, lr.voucher_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS remaining_before,
    EXISTS (
      SELECT 1 FROM cash_receipts p
      WHERE p.sale_id::text = lr.sale_id::text
        AND p.organization_id = lr.organization_id
        AND p.voucher_id <> lr.voucher_id
        AND (p.created_at < lr.created_at OR (p.created_at = lr.created_at AND p.voucher_id < lr.voucher_id))
        AND abs(p.amount - lr.amount) <= 1
    ) AS echoes_earlier_receipt
  FROM legs_raw lr
),
legs_kind AS (
  SELECT
    l.*,
    CASE
      WHEN l.is_balance_adjustment THEN 'BALANCE_ADJUSTMENT'
      WHEN l.is_counter_materialised THEN 'COUNTER_MATERIALISED'
      WHEN l.same_day AND l.amount <= l.tender + 1 THEN 'SAME_DAY_DUAL_WRITE'
      WHEN l.is_tender_echo THEN 'DUP_TENDER_REKEYED'
      WHEN l.remaining_before <= 0.5 AND l.echoes_earlier_receipt THEN 'DUP_DOUBLE_SUBMIT'
      WHEN l.remaining_before <= 0.5 THEN 'NON_ECHO_REDUNDANT'
      WHEN l.remaining_before < l.amount - 0.5 THEN 'PARTIAL'
      ELSE 'KEEP'
    END AS leg_kind
  FROM legs l
),
legs_action AS (
  SELECT
    lk.*,
    CASE
      WHEN lk.leg_kind IN ('DUP_DOUBLE_SUBMIT', 'DUP_TENDER_REKEYED') THEN 'DELETE'
      WHEN lk.leg_kind = 'KEEP' THEN 'KEEP'
      WHEN lk.leg_kind = 'SAME_DAY_DUAL_WRITE' THEN 'KEEP'                        -- by design, already netted
      WHEN lk.leg_kind = 'COUNTER_MATERIALISED' AND lk.same_day THEN 'KEEP'      -- by design, already netted
      ELSE 'HOLD_' || lk.leg_kind
    END AS action
  FROM legs_kind lk
),
bill_recon AS (
  SELECT
    gb.customer_id,
    gb.organization_id,
    gb.sale_number,
    gb.id AS sale_id,
    gb.sale_day,
    gb.shape,
    gb.net_due,
    gb.tender,
    gb.tender_residual,
    gb.receipts_live,
    gb.receipts_same_day,
    gb.over_credit,
    gb.paid_amount,
    gb.payment_status,
    COALESCE(SUM(la.amount) FILTER (WHERE la.action = 'DELETE'), 0) AS delete_sum,
    COUNT(*) FILTER (WHERE la.action = 'DELETE') AS delete_rows,
    COUNT(*) FILTER (WHERE la.action LIKE 'HOLD_%') AS hold_rows,
    string_agg(DISTINCT la.leg_kind, '+') FILTER (WHERE la.action LIKE 'HOLD_%') AS hold_kinds,
    gb.receipts_live - COALESCE(SUM(la.amount) FILTER (WHERE la.action = 'DELETE'), 0) AS receipts_after_pred
  FROM group_b_bills gb
  LEFT JOIN legs_action la ON la.sale_id = gb.id
  GROUP BY gb.customer_id, gb.organization_id, gb.sale_number, gb.id, gb.sale_day, gb.shape,
           gb.net_due, gb.tender, gb.tender_residual, gb.receipts_live, gb.receipts_same_day,
           gb.over_credit, gb.paid_amount, gb.payment_status
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
      WHEN br.hold_rows > 0 THEN 'HOLD_' || br.hold_kinds
      WHEN abs(br.delete_sum - br.over_credit) > 1 THEN 'HOLD_RECON_MISMATCH'
      WHEN br.delete_rows = 0 THEN 'HOLD_NO_DELETE_LEG'
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
    string_agg(DISTINCT bp.bill_status, ' | ') AS statuses,
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
  COUNT(*)::numeric AS a,                                          -- customers in B (v2 rule)
  SUM(bills)::numeric AS b,                                        -- bills
  SUM(over_credit) AS c,                                           -- over-credit (residual rule)
  SUM(delete_sum) AS d,                                            -- rupees a mutate would remove
  SUM(delete_rows)::numeric AS e,                                  -- receipt rows
  COUNT(*) FILTER (WHERE customer_status = 'READY')::numeric AS f, -- READY customers
  COUNT(*) FILTER (WHERE customer_status = 'HOLD')::numeric AS g,  -- HOLD customers
  NULL::text AS h,
  NULL::text AS i,
  NULL::text AS j
FROM customer_status
UNION ALL
SELECT
  'customer', cs.customer_status, cs.customer_id, NULL, NULL, cs.statuses,
  cs.bills::numeric, NULL, cs.over_credit, cs.delete_sum, cs.delete_rows::numeric, NULL, NULL,
  cs.bill_list, NULL, NULL
FROM customer_status cs
UNION ALL
SELECT
  'bill', bp.bill_status, bp.customer_id, bp.sale_number, NULL, bp.shape,
  bp.net_due,                    -- a
  bp.tender,                     -- b
  bp.receipts_live,              -- c
  bp.over_credit,                -- d
  bp.delete_sum,                 -- e
  bp.paid_amount,                -- f  live paid_amount
  bp.paid_pred,                  -- g  predicted paid_amount after
  bp.payment_status || ' → ' || bp.status_pred,          -- h  live → predicted status
  to_char(bp.sale_day, 'YYYY-MM-DD'),                     -- i  sale day IST
  'same_day ' || bp.receipts_same_day::text || ' residual ' || bp.tender_residual::text   -- j
FROM bill_pred bp
UNION ALL
SELECT
  'receipt', la.action, la.customer_id, la.sale_number, la.voucher_number, la.leg_kind,
  la.amount,                     -- a
  la.remaining_before,           -- b
  la.net_due,                    -- c
  la.tender_residual,            -- d
  la.over_credit,                -- e
  NULL, NULL,
  to_char(la.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' ' || COALESCE(la.payment_method, '')
    || ' vdate ' || to_char(la.voucher_date, 'YYYY-MM-DD') || ' sale ' || to_char(la.sale_day, 'YYYY-MM-DD'),  -- h
  la.voucher_id::text,           -- i  (id-scoped soft delete needs this)
  left(COALESCE(la.description, ''), 80)   -- j
FROM legs_action la
ORDER BY 1, 3 NULLS FIRST, 4 NULLS FIRST, 5 NULLS FIRST;

-- Column map:
--   headline : a customers, b bills, c over-credit, d delete ₹, e receipt rows, f READY, g HOLD
--   customer : status READY/HOLD, shape = bill statuses, a bills, c over-credit, d delete ₹, e rows, h bill list
--   bill     : status OK/HOLD_*, a net_due, b tender, c receipts_live, d over_credit, e delete ₹,
--              f paid live, g paid predicted, h live → predicted status, i sale day, j same-day/residual
--   receipt  : status DELETE / KEEP / HOLD_<kind>, shape = leg_kind, a amount, b remaining_before,
--              c net_due, d tender_residual, e over_credit, h created IST + method + voucher date + sale day,
--              i voucher_entries.id, j description (first 80 chars)
--
-- Five hand-checks before any mutate, across shapes and one multi-bill customer:
--   DUP_DOUBLE_SUBMIT same-minute pair (INV/26-27/1089 RCP/2442 twice), DUP_DOUBLE_SUBMIT 30 May
--   17:0x Velvet batch row (POS/26-27/808), DUP_TENDER_REKEYED (whatever survives v2),
--   a RECEIPT_OVER_PARTIAL pair (INV/25-26/799 RCP/909–912), and HEENA dde74df8 (all four bills
--   must be OK together or none).
