-- READ-ONLY: org-wide credit-note double-apply / one-sided CN audit.
-- Run ONE block at a time in Supabase SQL editor.
-- Optional org filter: uncomment organization_id lines on each block.
--
-- reference_type: include 'CustomerReceipt' when reference_id = sales.id (legacy Sales Invoice
-- CN path wrote payment_method = credit_note_adjustment but reference_type = CustomerReceipt).
-- Reconcile RPCs often count both; older A1/A2 only matched reference_type = 'sale' and missed those rows.

-- Block A1: Sales Invoice Dashboard-style CN vouchers (legacy description fingerprint)
SELECT ve.organization_id,
       c.customer_name,
       ve.voucher_number,
       ve.voucher_date,
       ve.reference_type,
       ve.total_amount,
       ve.description,
       s.sale_number,
       s.sale_return_adjust,
       s.payment_status
FROM voucher_entries ve
JOIN sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
WHERE ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt')
  AND ve.description ILIKE 'Credit note adjusted against invoice %'
  -- AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY ve.voucher_date DESC, ve.voucher_number;

-- Block A2: Customers with CN vouchers on sales AND pending sale-return CAB (double-count risk)
WITH cn_on_sales AS (
  SELECT ve.organization_id,
         s.customer_id,
         SUM(ve.total_amount) AS cn_voucher_applied
  FROM voucher_entries ve
  JOIN sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
  WHERE ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt')
    AND s.deleted_at IS NULL
  GROUP BY 1, 2
),
pending_sr AS (
  SELECT organization_id,
         customer_id,
         SUM(COALESCE(credit_available_balance, net_amount, 0)) AS pending_cab
  FROM sale_returns
  WHERE deleted_at IS NULL
    AND LOWER(TRIM(COALESCE(credit_status, ''))) IN ('pending', 'partially_adjusted')
    AND COALESCE(refund_type, '') <> 'cash_refund'
  GROUP BY 1, 2
)
SELECT c.customer_name,
       cn.cn_voucher_applied,
       ps.pending_cab,
       ROUND(cn.cn_voucher_applied + ps.pending_cab, 2) AS implied_double_count_ceiling
FROM cn_on_sales cn
JOIN pending_sr ps
  ON ps.organization_id = cn.organization_id AND ps.customer_id = cn.customer_id
JOIN customers c ON c.id = cn.customer_id AND c.organization_id = cn.organization_id
WHERE ps.pending_cab > 0.01
  -- AND cn.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY implied_double_count_ceiling DESC;

-- Block A3: Invoices with sale_return_adjust vs customer pending / unlinked returns
SELECT c.customer_name,
       s.sale_number,
       s.sale_return_adjust,
       sr.return_number,
       sr.credit_status,
       sr.linked_sale_id,
       sr.net_amount AS sr_net,
       COALESCE(sr.credit_available_balance, sr.net_amount) AS sr_cab
FROM sales s
JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
JOIN sale_returns sr
  ON sr.customer_id = s.customer_id
 AND sr.organization_id = s.organization_id
 AND sr.deleted_at IS NULL
WHERE s.deleted_at IS NULL
  AND COALESCE(s.sale_return_adjust, 0) > 0.01
  AND (
    sr.linked_sale_id IS DISTINCT FROM s.id
    OR LOWER(TRIM(COALESCE(sr.credit_status, ''))) IN ('pending', 'partially_adjusted')
  )
  -- AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY c.customer_name, s.sale_number, sr.return_number;

-- Block A4: Mis-tagged invoice CN (CustomerReceipt + reference_id = sale.id + dashboard description)
SELECT ve.organization_id,
       c.customer_name,
       ve.voucher_number,
       ve.voucher_date,
       ve.reference_type,
       ve.total_amount,
       ve.description,
       s.id AS sale_id,
       s.sale_number,
       s.sale_return_adjust
FROM voucher_entries ve
JOIN sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
WHERE ve.deleted_at IS NULL
  AND s.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.reference_type = 'CustomerReceipt'
  AND ve.description ILIKE 'Credit note adjusted against invoice %'
  -- AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY ve.voucher_date DESC, ve.voucher_number;

-- Block A3b: A3 skew — A2 repair queue only (ELLA NOOR, 8 customers from widened A2)
SELECT c.customer_name,
       s.sale_number,
       s.sale_return_adjust,
       sr.return_number,
       sr.credit_status,
       sr.linked_sale_id,
       sr.net_amount AS sr_net,
       COALESCE(sr.credit_available_balance, sr.net_amount) AS sr_cab
FROM sales s
JOIN customers c ON c.id = s.customer_id AND c.organization_id = s.organization_id
JOIN sale_returns sr
  ON sr.customer_id = s.customer_id
 AND sr.organization_id = s.organization_id
 AND sr.deleted_at IS NULL
WHERE s.deleted_at IS NULL
  AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND COALESCE(s.sale_return_adjust, 0) > 0.01
  AND (
    sr.linked_sale_id IS DISTINCT FROM s.id
    OR LOWER(TRIM(COALESCE(sr.credit_status, ''))) IN ('pending', 'partially_adjusted')
  )
  AND UPPER(TRIM(c.customer_name)) IN (
    'SHUMAMA BAIRELI',
    'PARINA BHUJWALA',
    'FAIZA SHEIKH',
    'FAIZA SALMAN MERCHANT',
    'ATIYA MERCHANT',
    'MONIKA VERMA',
    'AAISHA',
    'SHAREEN NATALIA'
  )
ORDER BY c.customer_name, s.sale_number, sr.return_number;
