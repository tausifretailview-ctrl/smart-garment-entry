-- =============================================================================
-- ELLA NOOR — P1 CN queue component breakdown (§1F-batch style)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Run as ONE block. Edit name_patterns array to add customers.
-- Uses _get_customer_party_balances_rows (works in SQL editor without JWT).
-- =============================================================================

WITH target AS (
  SELECT c.id, c.customer_name, COALESCE(c.opening_balance, 0) AS opening_balance
  FROM public.customers c
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.deleted_at IS NULL
    AND (
      c.customer_name ILIKE ANY (ARRAY[
        '%FAIZA SALMAN MERCHANT%',
        '%Parina Bhujwala%',
        '%Saba Ali%',
        '%Siya Kapoor%'
      ])
    )
),
party AS (
  SELECT pb.out_customer_id, pb.out_signed_balance, pb.out_direction,
         pb.out_advance_available, pb.out_cn_available
  FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) pb
  JOIN target t ON t.id = pb.out_customer_id
),
cn_vouchers AS (
  SELECT s.customer_id, SUM(ve.total_amount) AS cn_on_sales
  FROM public.voucher_entries ve
  JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
  JOIN target t ON t.id = s.customer_id
  WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt')
  GROUP BY s.customer_id
),
pending_pool AS (
  SELECT sr.customer_id,
         SUM(COALESCE(sr.credit_available_balance, sr.net_amount, 0)) AS pending_cab,
         COUNT(*) FILTER (
           WHERE LOWER(COALESCE(sr.credit_status, '')) IN ('pending', 'partially_adjusted')
         ) AS open_return_count
  FROM public.sale_returns sr
  JOIN target t ON t.id = sr.customer_id
  WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND sr.deleted_at IS NULL
    AND LOWER(COALESCE(sr.credit_status, '')) IN ('pending', 'partially_adjusted')
    AND COALESCE(sr.refund_type, '') <> 'cash_refund'
  GROUP BY sr.customer_id
),
sra AS (
  SELECT s.customer_id, SUM(COALESCE(s.sale_return_adjust, 0)) AS total_sra
  FROM public.sales s
  JOIN target t ON t.id = s.customer_id
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND s.deleted_at IS NULL
  GROUP BY s.customer_id
)
SELECT
  t.customer_name,
  ROUND(p.out_signed_balance, 2) AS party_balance,
  p.out_direction,
  ROUND(t.opening_balance, 2) AS opening_balance,
  ROUND(COALESCE(cn.cn_on_sales, 0), 2) AS cn_vouchers_on_sales,
  ROUND(COALESCE(sr.total_sra, 0), 2) AS sale_return_adjust_total,
  ROUND(COALESCE(pp.pending_cab, 0), 2) AS pending_return_pool,
  COALESCE(pp.open_return_count, 0) AS open_returns,
  ROUND(COALESCE(cn.cn_on_sales, 0) + COALESCE(pp.pending_cab, 0), 2) AS double_count_ceiling,
  ROUND(COALESCE(p.out_advance_available, 0), 2) AS advance_available,
  ROUND(COALESCE(p.out_cn_available, 0), 2) AS cn_available_rpc
FROM target t
LEFT JOIN party p ON p.out_customer_id = t.id
LEFT JOIN cn_vouchers cn ON cn.customer_id = t.id
LEFT JOIN pending_pool pp ON pp.customer_id = t.id
LEFT JOIN sra sr ON sr.customer_id = t.id
ORDER BY party_balance DESC;
