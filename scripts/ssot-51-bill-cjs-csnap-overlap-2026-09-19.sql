-- Two-tier SSOT / 51-bill overlap — tables only, READ ONLY.
-- SQL editor has no JWT: do not call get_customer_financial_snapshot* /
-- get_customer_party_balances / reconcile_customer_balance (42501).
-- organizations has NO deleted_at (42703) — do not filter it. Org ids are literals.
--
-- Paste as ONE run. Do not click Format SQL first.
-- No INSERT/UPDATE/DELETE. No 51-bill mutate.
--
-- Q1: after excluding the named duplicate voucher, does SNAP still drop at-sale
--     on THAT bill (tender > 0 AND remaining receipts >= tender)?
-- Q2: does the same CUSTOMER have any sibling sale with the same SNAP drop
--     (SHREEVASTAV POS/824 class)?
-- Q3: C-JS gap after repair = GREATEST(paid_amount, tender) - remaining receipts;
--     gap <= 0 while tender > 0 means GREATEST absorb survives the delete.
--
-- Named duplicate voucher_numbers to exclude as "the repair":
--   Gurukrupa: RCP/26-27/1126, 1128, 1129, 1131-2
--   Velvet:    RCP/26-27/1131 .. 1145 (POS Dashboard burst)
-- Walk-in POS/26-27/85 has no customer_id — SNAP/C-JS N/A.

WITH org_ids AS (
  SELECT unnest(ARRAY[
    'e8fbf0d8-182c-4364-8570-96c756b72db8'::uuid, -- GURUKRUPA
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid  -- VELVET
  ]) AS id
),
dup_vouchers AS (
  SELECT ve.organization_id, ve.reference_id AS sale_id, ve.id AS voucher_id,
         ve.voucher_number, ve.total_amount, ve.discount_amount
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_ids)
    AND ve.voucher_number IN (
      'RCP/26-27/1126', 'RCP/26-27/1128', 'RCP/26-27/1129', 'RCP/26-27/1131-2',
      'RCP/26-27/1131', 'RCP/26-27/1132', 'RCP/26-27/1133', 'RCP/26-27/1134',
      'RCP/26-27/1135', 'RCP/26-27/1136', 'RCP/26-27/1137', 'RCP/26-27/1138',
      'RCP/26-27/1139', 'RCP/26-27/1140', 'RCP/26-27/1141', 'RCP/26-27/1142',
      'RCP/26-27/1143', 'RCP/26-27/1144', 'RCP/26-27/1145'
    )
),
sale_tender AS (
  SELECT
    s.id,
    s.organization_id,
    s.customer_id,
    s.sale_number,
    s.net_amount,
    COALESCE(s.sale_return_adjust, 0) AS sra,
    COALESCE(s.paid_amount, 0) AS paid_amount,
    GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0) AS tender
  FROM public.sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.organization_id IN (SELECT id FROM org_ids)
),
receipts_all AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))) AS amt
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_ids)
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY ve.organization_id, ve.reference_id
),
receipts_after_repair AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))) AS amt
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_ids)
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    AND ve.id NOT IN (SELECT voucher_id FROM dup_vouchers)
  GROUP BY ve.organization_id, ve.reference_id
),
named_bill AS (
  SELECT
    st.sale_number,
    st.customer_id,
    st.tender,
    st.paid_amount,
    COALESCE(ra.amt, 0) AS receipts_live,
    COALESCE(rr.amt, 0) AS receipts_after,
    GREATEST(0::numeric, st.tender - COALESCE(rr.amt, 0)) AS snap_drift_after,
    CASE
      WHEN st.tender > 0.005 AND COALESCE(rr.amt, 0) >= st.tender THEN st.tender
      ELSE 0
    END AS snap_drop_after,
    GREATEST(st.paid_amount, st.tender) - COALESCE(rr.amt, 0) AS cjs_gap_after
  FROM dup_vouchers d
  JOIN sale_tender st
    ON st.id::text = d.sale_id::text
   AND st.organization_id = d.organization_id
  LEFT JOIN receipts_all ra
    ON ra.sale_id::text = st.id::text AND ra.organization_id = st.organization_id
  LEFT JOIN receipts_after_repair rr
    ON rr.sale_id::text = st.id::text AND rr.organization_id = st.organization_id
),
sibling_drop AS (
  SELECT
    st.customer_id,
    st.sale_number,
    st.tender,
    COALESCE(rr.amt, 0) AS receipts_after,
    CASE
      WHEN st.tender > 0.005 AND COALESCE(rr.amt, 0) >= st.tender THEN st.tender
      ELSE 0
    END AS snap_drop
  FROM sale_tender st
  LEFT JOIN receipts_after_repair rr
    ON rr.sale_id::text = st.id::text AND rr.organization_id = st.organization_id
  WHERE st.customer_id IN (SELECT DISTINCT customer_id FROM named_bill WHERE customer_id IS NOT NULL)
    AND st.tender > 0.005
    AND COALESCE(rr.amt, 0) >= st.tender
)
SELECT
  'named_bill'::text AS section,
  nb.sale_number,
  nb.customer_id,
  nb.tender,
  nb.paid_amount,
  nb.receipts_live,
  nb.receipts_after,
  nb.snap_drift_after,
  nb.snap_drop_after,
  nb.cjs_gap_after
FROM named_bill nb
UNION ALL
SELECT
  'sibling_snap_drop'::text,
  sd.sale_number,
  sd.customer_id,
  sd.tender,
  NULL::numeric,
  NULL::numeric,
  sd.receipts_after,
  GREATEST(0::numeric, sd.tender - sd.receipts_after),
  sd.snap_drop,
  NULL::numeric
FROM sibling_drop sd
ORDER BY 1, 2;
