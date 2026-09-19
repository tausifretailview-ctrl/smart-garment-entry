-- STEP 1 — materialise the "51" by sale_number and diff it against the confirmed 91.
-- READ ONLY. Tables only (no RPC, no organizations.deleted_at). Paste as ONE run.
-- No INSERT/UPDATE/DELETE. Nothing in the 51, the 91, or group B moves in this step.
--
-- Where the 51 came from (docs/duplicate-receipt-51-bill-repair-set-2026-09-19.md,
-- docs/duplicate-receipt-audit-2026-09-18.md, definition A → CN-netted):
--
--   OLD_51  over_credit = receipts_cn_netted − (net − SRA)   > 1
--           receipts_cn_netted = receipt vouchers on the bill EXCLUDING ONLY
--           payment_method = 'credit_note_adjustment' (the 29-30 May scripts'
--           predicate). At-sale tender is NOT added. Advance-application memo
--           receipts ('advance_adjustment', 'Adjusted from advance balance…') ARE
--           counted as cash under this definition.
--
--   SET_91  over_credit = receipts_memo_excl + tender − (net − SRA) > 1, receipts > 0
--           receipts_memo_excl uses public._is_settlement_memo_receipt (CN AND advance
--           memos excluded). At-sale tender IS added (leftover-sum, the way the ledger
--           and the printed bill add it).
--
-- The 51-row list was never committed — only the headline (51 / ₹2,99,467). This
-- paste rebuilds it from the same rule on today's data, so today's OLD_51 count may
-- differ from 51 if receipts moved since 18 Sep. That delta is reported, not hidden.
--
-- Diff reason codes (one per bill in OLD_51 ∪ SET_91):
--   BOTH                      in both sets
--   OLD_ONLY_ADVANCE_MEMO     old counted an advance-application memo as cash;
--                             remove it and the bill is not over-credited
--   OLD_ONLY_OTHER            in old only for another reason — hand-check
--   NEW_ONLY_AT_SALE_TENDER   receipts alone ≤ net, receipts + at-sale tender > net.
--                             The GREATEST hole (VIMLA 765 / HEENA 1488 / Shreevastav's
--                             missing ₹1,000 class). Old headline missed these entirely.
--   NEW_ONLY_OTHER            in new only for another reason — hand-check

WITH org_ids AS (
  SELECT unnest(ARRAY[
    'e8fbf0d8-182c-4364-8570-96c756b72db8'::uuid, -- GURUKRUPA
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid, -- VELVET
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid, -- ELLA NOOR
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid  -- KS FOOTWEAR
  ]) AS id
),
sale_base AS (
  SELECT
    s.id,
    s.organization_id,
    s.customer_id,
    s.sale_number,
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
receipts AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    -- OLD_51 basis: only credit_note_adjustment netted out
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (WHERE COALESCE(ve.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment')
      AS receipts_cn_netted,
    -- SET_91 basis: every settlement memo excluded
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (WHERE NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description))
      AS receipts_memo_excl,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (WHERE public._is_settlement_memo_receipt(ve.payment_method, ve.description)
                AND COALESCE(ve.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment')
      AS advance_memo_counted_by_old,
    COUNT(*) FILTER (WHERE NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description))
      AS cash_receipt_rows
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_ids)
  GROUP BY ve.organization_id, ve.reference_id
),
measured AS (
  SELECT
    sb.*,
    COALESCE(r.receipts_cn_netted, 0)         AS receipts_cn_netted,
    COALESCE(r.receipts_memo_excl, 0)         AS receipts_memo_excl,
    COALESCE(r.advance_memo_counted_by_old, 0) AS advance_memo_counted_by_old,
    COALESCE(r.cash_receipt_rows, 0)          AS cash_receipt_rows,
    GREATEST(0::numeric, COALESCE(r.receipts_cn_netted, 0) - sb.net_due)            AS over_old_51,
    GREATEST(0::numeric, COALESCE(r.receipts_memo_excl, 0) + sb.tender - sb.net_due) AS over_set_91
  FROM sale_base sb
  LEFT JOIN receipts r
    ON r.sale_id::text = sb.id::text
   AND r.organization_id = sb.organization_id
),
flagged AS (
  SELECT
    m.*,
    (m.over_old_51 > 1)                                AS in_old_51,
    (m.over_set_91 > 1 AND m.receipts_memo_excl > 0.005) AS in_set_91
  FROM measured m
  WHERE m.over_old_51 > 1
     OR (m.over_set_91 > 1 AND m.receipts_memo_excl > 0.005)
),
diffed AS (
  SELECT
    f.*,
    CASE
      WHEN f.in_old_51 AND f.in_set_91 THEN 'BOTH'
      WHEN f.in_old_51 AND NOT f.in_set_91 THEN
        CASE
          WHEN f.advance_memo_counted_by_old > 0.005
           AND f.receipts_memo_excl + f.tender - f.net_due <= 1
            THEN 'OLD_ONLY_ADVANCE_MEMO'
          ELSE 'OLD_ONLY_OTHER'
        END
      WHEN NOT f.in_old_51 AND f.in_set_91 THEN
        CASE
          WHEN f.receipts_memo_excl - f.net_due <= 1 AND f.tender > 0.005
            THEN 'NEW_ONLY_AT_SALE_TENDER'
          ELSE 'NEW_ONLY_OTHER'
        END
    END AS diff_reason,
    CASE
      WHEN f.net_due <= 0.005 THEN 'NET_DUE_ZERO'
      WHEN f.tender <= 0.005 AND abs(f.receipts_memo_excl - 2 * f.net_due) <= 1 THEN 'EXACT_DOUBLE_RECEIPT'
      WHEN f.tender > 0.005 AND f.receipts_memo_excl - f.over_set_91 <= 0.005 THEN 'RECEIPT_DUPLICATES_AT_SALE_TENDER'
      WHEN f.receipts_memo_excl - f.net_due > 1 THEN 'RECEIPT_OVER_PARTIAL'
      ELSE 'MIXED_TENDER_PLUS_RECEIPT_OVER'
    END AS shape
  FROM flagged f
)
SELECT
  'headline'::text AS section,
  NULL::text AS diff_reason,
  NULL::text AS shape,
  NULL::text AS sale_number,
  NULL::uuid AS customer_id,
  COUNT(*) FILTER (WHERE in_old_51)::numeric            AS old_51_count,
  SUM(over_old_51) FILTER (WHERE in_old_51)              AS old_51_rupees,
  COUNT(*) FILTER (WHERE in_set_91)::numeric            AS set_91_count,
  SUM(over_set_91) FILTER (WHERE in_set_91)              AS set_91_rupees,
  COUNT(*) FILTER (WHERE diff_reason = 'BOTH')::numeric AS both_count,
  COUNT(*) FILTER (WHERE diff_reason LIKE 'OLD_ONLY%')::numeric AS old_only_count,
  COUNT(*) FILTER (WHERE diff_reason LIKE 'NEW_ONLY%')::numeric AS new_only_count,
  NULL::numeric AS tender,
  NULL::numeric AS receipts_cn_netted,
  NULL::numeric AS receipts_memo_excl,
  NULL::numeric AS advance_memo_counted_by_old,
  NULL::numeric AS net_due,
  NULL::numeric AS paid_amount
FROM diffed
UNION ALL
SELECT
  'reason'::text,
  diff_reason,
  NULL,
  NULL,
  NULL,
  COUNT(*)::numeric,
  SUM(over_old_51),
  NULL,
  SUM(over_set_91),
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL, NULL, NULL
FROM diffed
GROUP BY diff_reason
UNION ALL
SELECT
  'bill',
  diff_reason,
  shape,
  sale_number,
  customer_id,
  CASE WHEN in_old_51 THEN 1 ELSE 0 END,
  over_old_51,
  CASE WHEN in_set_91 THEN 1 ELSE 0 END,
  over_set_91,
  NULL, NULL, NULL,
  tender,
  receipts_cn_netted,
  receipts_memo_excl,
  advance_memo_counted_by_old,
  net_due,
  paid_amount
FROM diffed
ORDER BY 1, 2 NULLS LAST, 4 NULLS LAST;

-- Column map for 'bill' rows (UNION reuses headline names):
--   old_51_count  = 1 if in OLD_51          old_51_rupees = over-credit under OLD_51
--   set_91_count  = 1 if in SET_91          set_91_rupees = over-credit under SET_91
-- Expected today from the 21:09 paste: BOTH ≈ 48 (₹1,62,086 under OLD_51 rule),
-- NEW_ONLY_AT_SALE_TENDER ≈ 43 (29 receipt-on-at-sale + 14 mixed), OLD_ONLY_* = whatever
-- advance-memo rows the old headline counted as cash (cannot be seen from the 21:09 CSV).
-- If OLD_51 headline does not reproduce 51 / ₹2,99,467, the difference is the rows that
-- moved since 18 Sep plus the memo-counting rule — list them, do not average them away.
