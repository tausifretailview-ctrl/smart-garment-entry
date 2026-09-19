-- TIER 2 — DUP_TENDER_REKEYED: REPORT ONLY. READ ONLY. No deletion logic in this file.
--
-- 7 customers / 11 bills / 11 receipt rows / ₹26,164 from the dry-run v2 paste
-- (docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv). Each bill was paid in
-- full at the counter per sales.cash/card/upi_amount, then a receipt for the SAME amount was
-- written days or weeks later. The customer paid once. The balance is correct either way once
-- ONE of the two records goes — but the data cannot say which record is wrong:
--
--   Explanation A — the RECEIPT is wrong: cashier re-keyed money already taken at the counter
--                   (Record Payment on an already-paid POS bill). Fix = soft-delete the receipt.
--                   Day book: receipt-day cash falls by the amount; sale-day unchanged.
--   Explanation B — the AT-SALE TENDER is wrong: POS booked cash_amount at the counter but the
--                   money was actually collected on the receipt day (pay-later sold as paid).
--                   Fix = tender correction on sales (cash_amount → 0 or reduced), keep the
--                   receipt. Day book: sale-day cash falls, receipt-day stands. The customer's
--                   printed receipt stays valid.
--
-- The shop decides per bill: "Did <customer> pay ₹X at the counter on <sale day>, or on
-- <receipt day>? Do they hold receipt <RCP>?" This paste gives the reviewer everything on one
-- line per bill: names, phone, both dates, both methods, who wrote the receipt, both fixes.
--
-- Includes HEENA's POS/26-27/853 (RCP/26-27/1132, a clean DUP_DOUBLE_SUBMIT) because it is
-- held with her three re-keyed bills under customer-atomicity; it is flagged separately.

WITH tier2 (voucher_id, exp_voucher_number, exp_sale_number, exp_amount, leg_kind) AS (
  VALUES
    ('a0a23556-8bd9-4c8f-ac88-e01578e7739a'::uuid, 'RCP/26-27/3109',        'POS/26-27/1919', 442::numeric,  'DUP_TENDER_REKEYED'),
    ('25929549-f3cf-4f39-b5fb-f81a8f18f94e'::uuid, 'RCP/26-27/3110',        'POS/26-27/1971', 1203::numeric, 'DUP_TENDER_REKEYED'),
    ('00d54bbb-7871-4184-8496-e897be96e0b7'::uuid, 'RCP/26-27/27#d00d54bbb','POS/26-27/513',  4500::numeric, 'DUP_TENDER_REKEYED'),
    ('d5f37066-43ee-4d84-bc74-e8051b2e072b'::uuid, 'RCP/26-27/2965',        'POS/26-27/1047', 1205::numeric, 'DUP_TENDER_REKEYED'),
    ('d2c696bc-3bda-4dd6-8b66-f6c91007489f'::uuid, 'RCP/26-27/22#dd2c696bc','POS/26-27/851',  1595::numeric, 'DUP_TENDER_REKEYED'),
    ('4a40ae23-c8c3-466f-aa35-3cfc5d4ebe7c'::uuid, 'RCP/26-27/3186',        'POS/26-27/2250', 763::numeric,  'DUP_TENDER_REKEYED'),
    ('7d3c1396-dec4-4566-a928-607bd2366089'::uuid, 'RCP/26-27/3263',        'POS/26-27/1488', 6290::numeric, 'DUP_TENDER_REKEYED'),
    ('cf2dcf25-9d41-4e88-a563-68f8096cdc8b'::uuid, 'RCP/26-27/3264',        'POS/26-27/1594', 2547::numeric, 'DUP_TENDER_REKEYED'),
    ('2f56202a-0f97-4752-a244-798fe665ffd5'::uuid, 'RCP/26-27/3265',        'POS/26-27/1714', 849::numeric,  'DUP_TENDER_REKEYED'),
    ('654c5eb3-5411-4c9b-a670-7f866eefe428'::uuid, 'RCP/26-27/1132',        'POS/26-27/853',  2770::numeric, 'DUP_DOUBLE_SUBMIT (HEENA, held with her Tier 2 bills)'),
    ('5eeb20ff-2357-4eaa-a814-f24b7c65d8cd'::uuid, 'RCP/26-27/4#d5eeb20ff', 'POS/26-27/270',  4000::numeric, 'DUP_TENDER_REKEYED')
),
r AS (
  SELECT
    t.*,
    o.name AS org_name,
    c.customer_name, c.phone,
    s.id AS sale_id, s.sale_number,
    (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date AS sale_day,
    GREATEST(0::numeric, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) AS net_due,
    COALESCE(s.paid_amount, 0) AS paid_live, s.payment_status,
    s.payment_method AS sale_payment_method,
    COALESCE(s.cash_amount, 0) AS cash_amount, COALESCE(s.card_amount, 0) AS card_amount, COALESCE(s.upi_amount, 0) AS upi_amount,
    GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0) AS tender,
    ve.voucher_number, ve.voucher_date,
    ve.created_at AT TIME ZONE 'Asia/Kolkata' AS receipt_created_ist,
    ve.payment_method AS receipt_method,
    GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS receipt_amount,
    ve.description, ve.paid_by, ve.deleted_at,
    au.email AS receipt_written_by,
    (SELECT COALESCE(SUM(GREATEST(0::numeric, COALESCE(x.total_amount, 0) + COALESCE(x.discount_amount, 0))), 0)
       FROM public.voucher_entries x
      WHERE x.reference_id::text = s.id::text AND x.organization_id = s.organization_id
        AND x.deleted_at IS NULL AND lower(COALESCE(x.voucher_type, '')) = 'receipt'
        AND NOT public._is_settlement_memo_receipt(x.payment_method, x.description)
        AND x.voucher_date = (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date) AS receipts_same_day,
    (SELECT COALESCE(SUM(GREATEST(0::numeric, COALESCE(x.total_amount, 0) + COALESCE(x.discount_amount, 0))), 0)
       FROM public.voucher_entries x
      WHERE x.reference_id::text = s.id::text AND x.organization_id = s.organization_id
        AND x.deleted_at IS NULL AND lower(COALESCE(x.voucher_type, '')) = 'receipt'
        AND NOT public._is_settlement_memo_receipt(x.payment_method, x.description)) AS receipts_live
  FROM tier2 t
  LEFT JOIN public.voucher_entries ve ON ve.id = t.voucher_id
  LEFT JOIN public.organizations o ON o.id = ve.organization_id
  LEFT JOIN public.sales s ON s.id::text = ve.reference_id::text AND s.organization_id = ve.organization_id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN auth.users au ON au.id = ve.created_by   -- SQL editor runs as postgres; auth schema readable
)
SELECT
  org_name, customer_name, phone,
  exp_sale_number AS bill, sale_day, net_due, paid_live, payment_status,
  sale_payment_method, cash_amount, card_amount, upi_amount, tender,
  receipts_same_day, GREATEST(0::numeric, tender - receipts_same_day) AS tender_residual,
  receipts_live,
  round(receipts_live + GREATEST(0::numeric, tender - receipts_same_day) - net_due, 2) AS over_credit,
  voucher_number AS receipt, voucher_date AS receipt_day, receipt_created_ist, receipt_method, receipt_amount,
  receipt_written_by, paid_by, description,
  (voucher_date - sale_day) AS days_after_sale,
  CASE WHEN lower(COALESCE(receipt_method, '')) <> '' AND lower(COALESCE(sale_payment_method, '')) <> ''
            AND lower(receipt_method) <> lower(sale_payment_method)
       THEN 'method differs (' || sale_payment_method || ' at sale vs ' || receipt_method || ' on receipt)'
       ELSE 'same / blank' END AS method_hint,
  leg_kind,
  'A: receipt ' || voucher_number || ' re-keyed money already taken on ' || sale_day::text
    || ' → soft-delete receipt; day book ' || voucher_date::text || ' −₹' || receipt_amount::text AS explanation_a,
  'B: POS booked ₹' || tender::text || ' at sale but cash came on ' || voucher_date::text
    || ' → tender correction on ' || exp_sale_number || ' (cash/card/upi_amount −₹' || receipt_amount::text
    || '), keep receipt; day book ' || sale_day::text || ' −₹' || receipt_amount::text AS explanation_b,
  'Did ' || COALESCE(customer_name, '(walk-in)') || ' pay ₹' || receipt_amount::text || ' for ' || exp_sale_number
    || ' at the counter on ' || sale_day::text || ', or on ' || voucher_date::text
    || '? Do they hold receipt ' || voucher_number || '?' AS ask_the_shop,
  deleted_at IS NOT NULL AS already_deleted,
  voucher_id
FROM r
ORDER BY customer_name, sale_day;
