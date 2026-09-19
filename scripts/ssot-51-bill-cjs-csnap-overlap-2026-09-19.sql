-- Two-tier SSOT / 51-bill overlap — tables only, READ ONLY.
-- SQL editor has no JWT: do not call get_customer_financial_snapshot* /
-- get_customer_party_balances / reconcile_customer_balance (42501).
--
-- Paste as postgres. No INSERT/UPDATE/DELETE. No 51-bill mutate.
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

WITH org_live AS (
  SELECT o.id, o.name
  FROM public.organizations o
  WHERE o.deleted_at IS NULL
    AND o.id IN (
      'e8fbf0d8-182c-4364-8570-96c756b72db8', -- GURUKRUPA
      'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'  -- VELVET
    )
),
dup_vouchers AS (
  SELECT ve.organization_id, ve.reference_id AS sale_id, ve.id AS voucher_id,
         ve.voucher_number, ve.total_amount, ve.discount_amount
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_live)
    AND (
      ve.voucher_number IN (
        'RCP/26-27/1126', 'RCP/26-27/1128', 'RCP/26-27/1129', 'RCP/26-27/1131-2'
      )
      OR ve.voucher_number IN (
        'RCP/26-27/1131', 'RCP/26-27/1132', 'RCP/26-27/1133', 'RCP/26-27/1134',
        'RCP/26-27/1135', 'RCP/26-27/1136', 'RCP/26-27/1137', 'RCP/26-27/1138',
        'RCP/26-27/1139', 'RCP/26-27/1140', 'RCP/26-27/1141', 'RCP/26-27/1142',
        'RCP/26-27/1143', 'RCP/26-27/1144', 'RCP/26-27/1145'
      )
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
    AND s.organization_id IN (SELECT id FROM org_live)
),
receipts_all AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))) AS amt
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_live)
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
    AND ve.organization_id IN (SELECT id FROM org_live)
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    AND ve.id NOT IN (SELECT voucher_id FROM dup_vouchers)
  GROUP BY ve.organization_id, ve.reference_id
),
-- Per named duplicate bill
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
-- Sibling SNAP-drop on the same customer (POS/824 class)
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
SELECT 'named_bill' AS section, to_jsonb(named_bill.*) AS row FROM named_bill
UNION ALL
SELECT 'sibling_snap_drop', to_jsonb(sibling_drop.*) FROM sibling_drop
ORDER BY 1, 2;
