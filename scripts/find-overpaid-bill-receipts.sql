-- READ-ONLY. Find bills paid more than once (double / extra receipts), all organisations.
-- Same rule as compute_sale_settlement (migration 20261231200000):
--   effective paid = all receipts + counter tender not already a same-day receipt
--   due            = net − sale_return_adjust (only when SRA is not already inside net)
-- A bill is listed when effective paid > due + ₹1. The LAST receipt in receipt_list is usually
-- the duplicate (e.g. Gurukrupa SARASWATI JI: RCP/25-26/180 on POS/25-26/667, RCP/26-27/1090
-- on POS/26-27/718). Rows with kind = 'orphan' are live receipts tagged reference_type 'sale'
-- whose reference_id is not a bill (no screen counts them; check what they were for).
-- Fix: confirm with the customer, then delete the wrong receipt in Payments → Customer receipts.
WITH items_gross AS (
  SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
  FROM public.sale_items si
  WHERE si.deleted_at IS NULL
  GROUP BY si.sale_id
),
rcpt AS (
  SELECT ve.reference_id AS sale_id,
         SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS receipts,
         SUM(CASE WHEN public._is_sale_day_receipt(ve.voucher_date, s.sale_date)
                  THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) ELSE 0 END) AS same_day,
         string_agg(
           ve.voucher_number || ' · ' || ve.voucher_date || ' · ₹' || round(ve.total_amount)
             || ' · ' || left(COALESCE(ve.description, ''), 60),
           E'\n' ORDER BY ve.voucher_date, ve.created_at) AS receipt_list,
         (array_agg(ve.voucher_number ORDER BY ve.voucher_date DESC, ve.created_at DESC))[1] AS last_receipt
  FROM public.voucher_entries ve
  JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
  WHERE lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.deleted_at IS NULL
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY ve.reference_id
),
bills AS (
  SELECT s.organization_id, s.id, s.sale_number, s.sale_date, s.customer_id, s.customer_name,
         s.customer_phone, s.net_amount,
         CASE WHEN COALESCE(ig.gross, 0) > 0
                   AND COALESCE(s.sale_return_adjust, 0) > 0
                   AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
              THEN 0 ELSE COALESCE(s.sale_return_adjust, 0) END AS sra_counted,
         GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0)
           + GREATEST(COALESCE(s.upi_amount, 0), 0) AS tender,
         r.receipts, r.same_day, r.receipt_list, r.last_receipt
  FROM public.sales s
  JOIN rcpt r ON r.sale_id = s.id
  LEFT JOIN items_gross ig ON ig.sale_id = s.id
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
)
SELECT 'overpaid_bill' AS kind,
       o.name AS organization,
       b.sale_number AS bill,
       (b.sale_date AT TIME ZONE 'Asia/Kolkata')::date AS bill_date,
       COALESCE(c.customer_name, b.customer_name) AS customer,
       COALESCE(c.phone, b.customer_phone) AS phone,
       round(b.net_amount) AS net,
       round(b.sra_counted) AS sale_return_adjust,
       round(b.tender) AS counter_tender,
       round(b.receipts) AS receipts,
       round(b.same_day) AS same_day_receipts,
       round(b.receipts + GREATEST(0, b.tender - b.same_day) - (b.net_amount - b.sra_counted)) AS overpaid,
       b.last_receipt AS likely_duplicate,
       b.receipt_list
FROM bills b
JOIN public.organizations o ON o.id = b.organization_id
LEFT JOIN public.customers c ON c.id = b.customer_id
WHERE b.receipts + GREATEST(0, b.tender - b.same_day) > (b.net_amount - b.sra_counted) + 1

UNION ALL

SELECT 'orphan_receipt',
       o.name,
       ve.voucher_number,
       ve.voucher_date,
       c.customer_name,
       c.phone,
       NULL, NULL, NULL,
       round(ve.total_amount),
       NULL, NULL,
       ve.voucher_number,
       left(COALESCE(ve.description, ''), 80)
FROM public.voucher_entries ve
JOIN public.organizations o ON o.id = ve.organization_id
LEFT JOIN public.customers c ON c.id = ve.reference_id
WHERE lower(COALESCE(ve.voucher_type, '')) = 'receipt'
  AND ve.deleted_at IS NULL
  AND lower(COALESCE(ve.reference_type, '')) = 'sale'
  AND ve.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.id = ve.reference_id)

ORDER BY 1, 2, 12 DESC NULLS LAST;
