-- TIER 1 — duplicate-receipt repair, DUP_DOUBLE_SUBMIT only.
-- 11 voucher_entries rows / 10 customers / ₹62,916. Nothing from Tier 2 or HOLD.
--
-- Source of the 11 ids: docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv
-- (receipt rows with status = DELETE and shape = DUP_DOUBLE_SUBMIT whose customer is READY
-- and has NO DUP_TENDER_REKEYED leg). Hand-checks: docs/ssot-tier1-hand-checks-2026-09-19.md.
-- The set is locked in test/money/ssotTier1RepairSet.test.ts — if that test and this file
-- disagree, stop.
--
-- THREE BLOCKS. Paste ONE block at a time (the SQL editor shows only the last result set).
--
--   BLOCK A  DRY RUN.  Read-only. One row per id with every gate flag + a headline row.
--                      Expect: rows = 11, customers = 10, amount = 62916.00, all_ok = true.
--   BLOCK B  MUTATE.   v_mode := 'REHEARSE' (default) writes, asserts, then RAISES so the
--                      whole transaction rolls back and the assertions print in the error.
--                      Flip to 'EXECUTE' ONLY on explicit go-ahead. Guards RAISE on any
--                      mismatch (count, sum, voucher number, amount, org, bill, live state,
--                      post-trigger paid/status), so a partial write cannot survive.
--   BLOCK C  DIGEST.   Read-only. Run BEFORE Block B and AFTER it; paid_diverges_from_receipts
--                      must fall (these 11 bills are in it today: paid = net, receipts = 2×net)
--                      and nothing else may rise.
--
-- Soft delete only (deleted_at). Tag goes in `notes` — the queryable audit column the
-- 2026-06-06 ELLA NOOR repair used ([cn_over_apply_repair_20260606]); `description` is
-- printed on the receipt and stays untouched. Reversal = clear deleted_at on these ids
-- (Recycle Bin or SQL). The AFTER UPDATE trigger trg_sync_sale_payment_status_from_receipts
-- recomputes sales.paid_amount / payment_status; because every bill is already capped at
-- paid = net − SRA, the expected post-state is paid UNCHANGED and status still 'completed'.

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- BLOCK A — DRY RUN (read-only)
-- ═══════════════════════════════════════════════════════════════════════════════════════
WITH org_ids AS (
  SELECT unnest(ARRAY[
    'e8fbf0d8-182c-4364-8570-96c756b72db8'::uuid, -- GURUKRUPA
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid, -- VELVET
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid, -- ELLA NOOR
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid  -- KS FOOTWEAR
  ]) AS id
),
tier1 (voucher_id, exp_voucher_number, exp_sale_number, exp_amount, keep_voucher_number) AS (
  VALUES
    ('2a51f673-1518-41cd-ab47-b0698d70c1fe'::uuid, 'RCP/26-27/1137',           'POS/26-27/416',  2000::numeric,  'RCP/26-27/6#dedfea962'),
    ('791657cc-d8b9-465f-a226-604883de9f86'::uuid, 'RCP/26-27/2442#d791657cc', 'INV/26-27/1089', 5250::numeric,  'RCP/26-27/2442'),
    ('66e65c3a-2057-4eec-95f5-9360275e0452'::uuid, 'RCP/26-27/1838',           'INV/26-27/1621', 250::numeric,   'RCP/26-27/1836'),
    ('02284321-f364-470e-922e-76f516de515d'::uuid, 'RCP/26-27/1133',           'POS/26-27/1116', 5570::numeric,  'RCP/26-27/1104'),
    ('bda7d2cc-f371-489b-92f2-6475a42f268d'::uuid, 'RCP/26-27/1141',           'POS/26-27/292',  570::numeric,   'RCP/26-27/8#da922b887'),
    ('175e6639-af1c-4012-a37c-f05637f519b6'::uuid, 'RCP/26-27/1143',           'POS/26-27/558',  3300::numeric,  'RCP/26-27/9#dfab7999b'),
    ('528c1293-6fad-454c-99ed-cf5a718552df'::uuid, 'RCP/26-27/1131',           'POS/26-27/808',  13700::numeric, 'RCP/26-27/20#da15b3b8d'),
    ('ce4a35e7-e621-4565-9cf5-ec512aa5c361'::uuid, 'RCP/26-27/2859',           'INV/26-27/1117', 3150::numeric,  'RCP/26-27/2858'),
    ('b6a73a78-daf1-4b95-86e6-828912fe2505'::uuid, 'RCP/26-27/1135',           'POS/26-27/610',  2299::numeric,  'RCP/26-27/10#d2ad9f600'),
    ('e8563be4-fb32-45a4-844f-630f2e0506a9'::uuid, 'RCP/26-27/1142',           'POS/26-27/378',  1977::numeric,  'BCK/dcf49184/13df2d'),
    ('9a59ec53-932b-4fc9-8ffe-9894ae5dc6dd'::uuid, 'RCP/25-26/937',            'INV/25-26/821',  24850::numeric, 'RCP/25-26/936')
),
row_state AS (
  SELECT
    t.*,
    ve.id IS NOT NULL                                          AS found,
    ve.deleted_at IS NULL                                      AS live,
    ve.voucher_number,
    ve.voucher_date,
    ve.created_at AT TIME ZONE 'Asia/Kolkata'                  AS created_ist,
    ve.payment_method,
    ve.description,
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amount,
    ve.organization_id,
    o.name                                                     AS org_name,
    s.id                                                       AS sale_id,
    s.sale_number,
    s.customer_id,
    c.customer_name,
    (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date            AS sale_day,
    GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) AS net_due,
    COALESCE(s.paid_amount, 0)                                 AS paid_live,
    s.payment_status                                           AS status_live,
    GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0)                 AS tender,
    s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false AS sale_live,
    k.id IS NOT NULL AND k.deleted_at IS NULL                  AS keep_leg_live,
    GREATEST(0::numeric, COALESCE(k.total_amount, 0) + COALESCE(k.discount_amount, 0)) AS keep_amount,
    k.voucher_date                                             AS keep_voucher_date,
    k.created_at AT TIME ZONE 'Asia/Kolkata'                   AS keep_created_ist,
    -- every OTHER live cash receipt on the bill (the leg(s) that stay)
    (SELECT COALESCE(SUM(GREATEST(0::numeric, COALESCE(o2.total_amount, 0) + COALESCE(o2.discount_amount, 0))), 0)
       FROM public.voucher_entries o2
      WHERE o2.reference_id::text = s.id::text
        AND o2.organization_id = s.organization_id
        AND o2.deleted_at IS NULL
        AND o2.id <> t.voucher_id
        AND lower(COALESCE(o2.voucher_type, '')) = 'receipt'
        AND NOT public._is_settlement_memo_receipt(o2.payment_method, o2.description)) AS receipts_others,
    (SELECT COUNT(*)
       FROM public.voucher_entries o3
      WHERE o3.reference_id::text = s.id::text
        AND o3.organization_id = s.organization_id
        AND o3.deleted_at IS NULL
        AND lower(COALESCE(o3.voucher_type, '')) = 'receipt'
        AND NOT public._is_settlement_memo_receipt(o3.payment_method, o3.description)) AS live_receipt_rows
  FROM tier1 t
  LEFT JOIN public.voucher_entries ve ON ve.id = t.voucher_id
  LEFT JOIN public.organizations o    ON o.id = ve.organization_id
  LEFT JOIN public.sales s            ON s.id::text = ve.reference_id::text AND s.organization_id = ve.organization_id
  LEFT JOIN public.customers c        ON c.id = s.customer_id
  LEFT JOIN public.voucher_entries k  ON k.voucher_number = t.keep_voucher_number
                                     AND k.organization_id = ve.organization_id
                                     AND k.reference_id::text = s.id::text
),
checked AS (
  SELECT
    rs.*,
    -- ledger credit on the bill WITHOUT this row: other receipts + at-sale tender.
    -- Tier 1 is tender = 0 everywhere, so this is just receipts_others.
    rs.receipts_others + rs.tender - rs.net_due                   AS over_after,
    (rs.found
      AND rs.live
      AND rs.sale_live
      AND rs.organization_id IN (SELECT id FROM org_ids)
      AND rs.voucher_number = rs.exp_voucher_number
      AND rs.sale_number    = rs.exp_sale_number
      AND abs(rs.amount - rs.exp_amount) <= 0.005
      AND rs.tender = 0
      AND rs.keep_leg_live
      AND abs(rs.keep_amount - rs.exp_amount) <= 1
      AND rs.receipts_others + rs.tender >= rs.net_due - 0.5        -- bill stays fully paid without it
      AND rs.receipts_others + rs.tender - rs.net_due <= 1           -- and is not still over-credited
      AND abs(rs.paid_live - rs.net_due) <= 0.5                      -- paid already capped at net
      AND lower(COALESCE(rs.status_live, '')) = 'completed'
      AND lower(COALESCE(rs.payment_method, '')) NOT IN ('balance_adjustment')
      AND NOT public._is_settlement_memo_receipt(rs.payment_method, rs.description)
    ) AS row_ok
  FROM row_state rs
)
SELECT 'row' AS section,
       org_name, customer_name, customer_id, sale_number, sale_day,
       net_due, tender, paid_live, status_live,
       keep_voucher_number, keep_voucher_date, keep_created_ist, keep_amount,
       exp_voucher_number AS delete_voucher, voucher_date AS delete_voucher_date, created_ist AS delete_created_ist,
       payment_method, amount,
       live_receipt_rows, receipts_others, over_after,
       found, live, sale_live, keep_leg_live, row_ok,
       voucher_id
FROM checked
UNION ALL
SELECT 'headline', NULL, NULL, NULL,
       COUNT(*)::text || ' rows / ' || COUNT(DISTINCT customer_id)::text || ' customers',
       NULL,
       NULL, SUM(tender), NULL, NULL,
       NULL, NULL, NULL, NULL,
       CASE WHEN bool_and(row_ok) AND COUNT(*) = 11 AND COUNT(DISTINCT customer_id) = 10
                 AND abs(SUM(amount) - 62916) <= 0.005
            THEN 'ALL_OK' ELSE 'STOP' END,
       NULL, NULL, NULL,
       SUM(amount),
       SUM(live_receipt_rows), SUM(receipts_others), SUM(over_after),
       bool_and(found), bool_and(live), bool_and(sale_live), bool_and(keep_leg_live), bool_and(row_ok),
       NULL
FROM checked
ORDER BY 1, 5;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- BLOCK B — MUTATE. Default v_mode = 'REHEARSE' → always rolls back.
--           Change to 'EXECUTE' only after Block A shows ALL_OK and the five hand-checks
--           in docs/ssot-tier1-hand-checks-2026-09-19.md are signed off.
-- ═══════════════════════════════════════════════════════════════════════════════════════
/*
DO $$
DECLARE
  v_mode       text := 'REHEARSE';          -- 'REHEARSE' | 'EXECUTE'
  v_tag        text := '[dup_receipt_repair_20260919]';
  v_orgs       uuid[] := ARRAY[
    'e8fbf0d8-182c-4364-8570-96c756b72db8', -- GURUKRUPA
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5', -- VELVET
    '3fdca631-1e0c-4417-9704-421f5129ff67', -- ELLA NOOR
    '4bc73037-e877-4123-9261-eb6e3876698c'  -- KS FOOTWEAR
  ];
  v_expected_rows   int     := 11;
  v_expected_custs  int     := 10;
  v_expected_sum    numeric := 62916;
  v_n        int;
  v_custs    int;
  v_sum      numeric;
  v_bad      text;
  v_post     text;
  v_summary  text;
BEGIN
  CREATE TEMP TABLE tier1 (voucher_id uuid, exp_voucher_number text, exp_sale_number text,
                           exp_amount numeric, keep_voucher_number text) ON COMMIT DROP;
  INSERT INTO tier1 VALUES
    ('2a51f673-1518-41cd-ab47-b0698d70c1fe', 'RCP/26-27/1137',           'POS/26-27/416',  2000,  'RCP/26-27/6#dedfea962'),
    ('791657cc-d8b9-465f-a226-604883de9f86', 'RCP/26-27/2442#d791657cc', 'INV/26-27/1089', 5250,  'RCP/26-27/2442'),
    ('66e65c3a-2057-4eec-95f5-9360275e0452', 'RCP/26-27/1838',           'INV/26-27/1621', 250,   'RCP/26-27/1836'),
    ('02284321-f364-470e-922e-76f516de515d', 'RCP/26-27/1133',           'POS/26-27/1116', 5570,  'RCP/26-27/1104'),
    ('bda7d2cc-f371-489b-92f2-6475a42f268d', 'RCP/26-27/1141',           'POS/26-27/292',  570,   'RCP/26-27/8#da922b887'),
    ('175e6639-af1c-4012-a37c-f05637f519b6', 'RCP/26-27/1143',           'POS/26-27/558',  3300,  'RCP/26-27/9#dfab7999b'),
    ('528c1293-6fad-454c-99ed-cf5a718552df', 'RCP/26-27/1131',           'POS/26-27/808',  13700, 'RCP/26-27/20#da15b3b8d'),
    ('ce4a35e7-e621-4565-9cf5-ec512aa5c361', 'RCP/26-27/2859',           'INV/26-27/1117', 3150,  'RCP/26-27/2858'),
    ('b6a73a78-daf1-4b95-86e6-828912fe2505', 'RCP/26-27/1135',           'POS/26-27/610',  2299,  'RCP/26-27/10#d2ad9f600'),
    ('e8563be4-fb32-45a4-844f-630f2e0506a9', 'RCP/26-27/1142',           'POS/26-27/378',  1977,  'BCK/dcf49184/13df2d'),
    ('9a59ec53-932b-4fc9-8ffe-9894ae5dc6dd', 'RCP/25-26/937',            'INV/25-26/821',  24850, 'RCP/25-26/936');

  -- 1. PRE-GUARD: same predicate as Block A row_ok. Any failing id aborts everything.
  CREATE TEMP TABLE pre ON COMMIT DROP AS
  SELECT t.voucher_id, t.exp_voucher_number, t.exp_sale_number, t.exp_amount, t.keep_voucher_number,
         ve.organization_id, s.id AS sale_id, s.customer_id,
         GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) AS net_due,
         COALESCE(s.paid_amount, 0) AS paid_before, s.payment_status AS status_before,
         GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS amount,
         (ve.id IS NOT NULL AND ve.deleted_at IS NULL
           AND s.id IS NOT NULL AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false
           AND ve.organization_id = ANY(v_orgs)
           AND ve.voucher_number = t.exp_voucher_number
           AND s.sale_number = t.exp_sale_number
           AND abs(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) - t.exp_amount) <= 0.005
           AND GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0)
             + GREATEST(COALESCE(s.upi_amount, 0), 0) = 0
           AND k.id IS NOT NULL AND k.deleted_at IS NULL
           AND abs(GREATEST(0::numeric, COALESCE(k.total_amount, 0) + COALESCE(k.discount_amount, 0)) - t.exp_amount) <= 1
           AND lower(COALESCE(s.payment_status, '')) = 'completed'
           AND abs(COALESCE(s.paid_amount, 0) - GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0))) <= 0.5
           AND lower(COALESCE(ve.payment_method, '')) <> 'balance_adjustment'
           AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
           AND (SELECT COALESCE(SUM(GREATEST(0::numeric, COALESCE(o2.total_amount, 0) + COALESCE(o2.discount_amount, 0))), 0)
                  FROM public.voucher_entries o2
                 WHERE o2.reference_id::text = s.id::text AND o2.organization_id = s.organization_id
                   AND o2.deleted_at IS NULL AND o2.id <> t.voucher_id
                   AND lower(COALESCE(o2.voucher_type, '')) = 'receipt'
                   AND NOT public._is_settlement_memo_receipt(o2.payment_method, o2.description))
               BETWEEN GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) - 0.5
                   AND GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) + 1
         ) AS row_ok
  FROM tier1 t
  LEFT JOIN public.voucher_entries ve ON ve.id = t.voucher_id
  LEFT JOIN public.sales s ON s.id::text = ve.reference_id::text AND s.organization_id = ve.organization_id
  LEFT JOIN public.voucher_entries k ON k.voucher_number = t.keep_voucher_number
                                    AND k.organization_id = ve.organization_id
                                    AND k.reference_id::text = s.id::text;

  SELECT string_agg(exp_voucher_number, ', ') INTO v_bad FROM pre WHERE NOT row_ok;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'TIER1 PRE-GUARD FAILED — not written. Rows failing row_ok: %', v_bad;
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT customer_id), SUM(amount) INTO v_n, v_custs, v_sum FROM pre;
  IF v_n <> v_expected_rows OR v_custs <> v_expected_custs OR abs(v_sum - v_expected_sum) > 0.005 THEN
    RAISE EXCEPTION 'TIER1 PRE-GUARD FAILED — not written. rows=% customers=% sum=% (expected 11 / 10 / 62916)',
      v_n, v_custs, v_sum;
  END IF;

  -- 2. SOFT DELETE + TAG. Scoped by id AND organization_id AND live state.
  UPDATE public.voucher_entries ve
     SET deleted_at = now(),
         notes = COALESCE(ve.notes, '') || E'\n' || v_tag
              || ' Tier 1 DUP_DOUBLE_SUBMIT of ' || p.keep_voucher_number
              || ' on ' || p.exp_sale_number
              || ' (bill already settled before this row; dry-run v2 22:25 IST 19 Sep 2026;'
              || ' docs/ssot-tier1-hand-checks-2026-09-19.md)'
    FROM pre p
   WHERE ve.id = p.voucher_id
     AND ve.organization_id = p.organization_id
     AND ve.organization_id = ANY(v_orgs)
     AND ve.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_expected_rows THEN
    RAISE EXCEPTION 'TIER1 UPDATE touched % rows, expected % — rolled back', v_n, v_expected_rows;
  END IF;

  -- 3. POST-GUARD: trigger must have left paid = net − SRA, status completed, and the
  --    canonical settlement (compute_sale_settlement) must agree with what is stored.
  SELECT string_agg(format('%s paid %s→%s status %s→%s settle %s/%s',
                           p.exp_sale_number, p.paid_before, s.paid_amount,
                           p.status_before, s.payment_status, cs.new_paid, cs.new_status), '; ')
    INTO v_post
  FROM pre p
  JOIN public.sales s ON s.id = p.sale_id
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
  WHERE abs(COALESCE(s.paid_amount, 0) - p.net_due) > 0.5
     OR lower(COALESCE(s.payment_status, '')) <> 'completed'
     OR abs(COALESCE(cs.new_paid, 0) - COALESCE(s.paid_amount, 0)) > 0.5
     OR (SELECT COUNT(*) FROM public.voucher_entries x
          WHERE x.id = p.voucher_id AND x.deleted_at IS NOT NULL AND x.notes LIKE '%' || v_tag || '%') <> 1;
  IF v_post IS NOT NULL THEN
    RAISE EXCEPTION 'TIER1 POST-GUARD FAILED — rolled back. %', v_post;
  END IF;

  SELECT string_agg(format('%s %s ₹%s paid %s→%s', p.exp_sale_number, p.exp_voucher_number, p.amount,
                           p.paid_before, s.paid_amount), ' | ' ORDER BY p.exp_sale_number)
    INTO v_summary
  FROM pre p JOIN public.sales s ON s.id = p.sale_id;

  IF v_mode <> 'EXECUTE' THEN
    RAISE EXCEPTION 'REHEARSAL OK (rolled back, nothing written). % rows / % customers / ₹% would be soft-deleted. %',
      v_expected_rows, v_expected_custs, v_sum, v_summary;
  END IF;
END $$;

-- After an EXECUTE run only — what was written:
SELECT ve.voucher_number, ve.deleted_at, ve.notes, s.sale_number, s.paid_amount, s.payment_status
FROM public.voucher_entries ve
JOIN public.sales s ON s.id::text = ve.reference_id::text AND s.organization_id = ve.organization_id
WHERE ve.notes LIKE '%[dup_receipt_repair_20260919]%'
ORDER BY s.sale_number;
*/

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- BLOCK C — INVARIANT DIGEST (read-only). Paste before Block B and again after EXECUTE.
--   Expected delta: paid_diverges_from_receipts count falls by up to 11 (VELVET / ELLA NOOR);
--   every other check_name unchanged. Any rise = stop-ship, reverse (clear deleted_at on the
--   tagged ids) before leaving the session.
-- ═══════════════════════════════════════════════════════════════════════════════════════
/*
SELECT v.check_name, o.name AS org, COUNT(*) AS violations, round(SUM(v.detail), 2) AS total_detail,
       string_agg(v.entity_ref, ', ' ORDER BY v.entity_ref)
         FILTER (WHERE v.check_name = 'paid_diverges_from_receipts'
                   AND v.entity_ref IN ('POS/26-27/416','INV/26-27/1089','INV/26-27/1621','POS/26-27/1116',
                                        'POS/26-27/292','POS/26-27/558','POS/26-27/808','INV/26-27/1117',
                                        'POS/26-27/610','POS/26-27/378','INV/25-26/821')) AS tier1_bills_still_listed
FROM public.v_accounting_invariants v
JOIN public.organizations o ON o.id = v.organization_id
WHERE v.organization_id IN ('e8fbf0d8-182c-4364-8570-96c756b72db8','dafc3d0c-874e-4784-bac3-5eab5f3c85b5',
                            '3fdca631-1e0c-4417-9704-421f5129ff67','4bc73037-e877-4123-9261-eb6e3876698c')
GROUP BY v.check_name, o.name
ORDER BY v.check_name, o.name;
*/
