-- =====================================================================
-- Trial-balance vs operational-data reconciliation audit
-- =====================================================================
--
-- Usage (per-org, all-time):
--   psql -v org_id="'3fdca631-1e0c-4417-9704-421f5129ff67'" \
--        -v as_of_date="'9999-12-31'" \
--        -f scripts/trial-balance-audit.sql
--
-- Output sections:
--   1. GL Trial Balance (account_code, account_name, dr, cr, net_dr)
--   2. Operational source totals (sales, purchases, returns, vouchers, stock)
--   3. GL bucket vs Operational bucket comparison with drift column
--      (drift > Rs 1 = needs investigation; tolerance Rs 0.50 = clean)
--
-- The script is READ-ONLY. Safe to run in production.
-- =====================================================================

\set ON_ERROR_STOP on
\pset border 2
\pset format aligned

\echo ''
\echo '======================================================================'
\echo '1) GL TRIAL BALANCE (posted journal_entries / journal_lines)'
\echo '======================================================================'

SELECT
  coa.account_code,
  coa.account_name,
  coa.account_type,
  ROUND(SUM(jl.debit_amount)::numeric, 2)              AS dr,
  ROUND(SUM(jl.credit_amount)::numeric, 2)             AS cr,
  ROUND(SUM(jl.debit_amount - jl.credit_amount)::numeric, 2) AS net_dr
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.organization_id = :org_id::uuid
  AND je.date <= :as_of_date::date
GROUP BY coa.account_code, coa.account_name, coa.account_type
ORDER BY coa.account_code;

\echo ''
\echo '----- TB control totals -----'
SELECT
  ROUND(SUM(jl.debit_amount)::numeric, 2)  AS total_dr,
  ROUND(SUM(jl.credit_amount)::numeric, 2) AS total_cr,
  ROUND(SUM(jl.debit_amount - jl.credit_amount)::numeric, 2) AS imbalance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.organization_id = :org_id::uuid
  AND je.date <= :as_of_date::date;

\echo ''
\echo '======================================================================'
\echo '2) OPERATIONAL SOURCE TOTALS'
\echo '======================================================================'

WITH
sales_active AS (
  SELECT * FROM sales
  WHERE organization_id = :org_id::uuid
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled,false) = false
    AND sale_date <= :as_of_date::date
),
purchases_active AS (
  SELECT * FROM purchase_bills
  WHERE organization_id = :org_id::uuid
    AND deleted_at IS NULL
    AND bill_date <= :as_of_date::date
),
sr_active AS (
  SELECT * FROM sale_returns
  WHERE organization_id = :org_id::uuid
    AND deleted_at IS NULL
    AND return_date <= :as_of_date::date
),
pr_active AS (
  SELECT * FROM purchase_returns
  WHERE organization_id = :org_id::uuid
    AND deleted_at IS NULL
    AND return_date <= :as_of_date::date
),
ve_active AS (
  SELECT * FROM voucher_entries
  WHERE organization_id = :org_id::uuid
    AND deleted_at IS NULL
    AND voucher_date <= :as_of_date::date
),
stock_now AS (
  SELECT COALESCE(SUM(COALESCE(pv.stock_qty,0) * COALESCE(pv.pur_price,0)),0) AS stock_value
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE p.organization_id = :org_id::uuid
    AND p.deleted_at IS NULL
)
SELECT label, ROUND(value::numeric, 2) AS value FROM (
  SELECT  1 ord, 'sales.count_active'              AS label, COUNT(*)::numeric                  AS value FROM sales_active
  UNION ALL SELECT 2, 'sales.gross_amount',          COALESCE(SUM(gross_amount),0)          FROM sales_active
  UNION ALL SELECT 3, 'sales.discount_amount',       COALESCE(SUM(discount_amount),0)       FROM sales_active
  UNION ALL SELECT 4, 'sales.flat_discount_amount',  COALESCE(SUM(flat_discount_amount),0)  FROM sales_active
  UNION ALL SELECT 5, 'sales.other_charges',         COALESCE(SUM(other_charges),0)         FROM sales_active
  UNION ALL SELECT 6, 'sales.round_off',             COALESCE(SUM(round_off),0)             FROM sales_active
  UNION ALL SELECT 7, 'sales.net_amount',            COALESCE(SUM(net_amount),0)            FROM sales_active
  UNION ALL SELECT 8, 'sales.paid_amount',           COALESCE(SUM(paid_amount),0)           FROM sales_active
  UNION ALL SELECT 9, 'sales.sale_return_adjust',    COALESCE(SUM(sale_return_adjust),0)    FROM sales_active
  UNION ALL SELECT 10,'sales.points_redeemed',       COALESCE(SUM(points_redeemed_amount),0) FROM sales_active
  UNION ALL SELECT 11,'sales.credit_applied',        COALESCE(SUM(credit_applied),0)        FROM sales_active
  UNION ALL SELECT 20,'purchases.count_active',      COUNT(*)::numeric                      FROM purchases_active
  UNION ALL SELECT 21,'purchases.net_amount',        COALESCE(SUM(net_amount),0)            FROM purchases_active
  UNION ALL SELECT 22,'purchases.paid_amount',       COALESCE(SUM(paid_amount),0)           FROM purchases_active
  UNION ALL SELECT 30,'sale_returns.count',          COUNT(*)::numeric                      FROM sr_active
  UNION ALL SELECT 31,'sale_returns.gross_amount',   COALESCE(SUM(gross_amount),0)          FROM sr_active
  UNION ALL SELECT 32,'sale_returns.gst_amount',     COALESCE(SUM(gst_amount),0)            FROM sr_active
  UNION ALL SELECT 33,'sale_returns.net_amount',     COALESCE(SUM(net_amount),0)            FROM sr_active
  UNION ALL SELECT 40,'purchase_returns.count',      COUNT(*)::numeric                      FROM pr_active
  UNION ALL SELECT 41,'purchase_returns.net_amount', COALESCE(SUM(net_amount),0)            FROM pr_active
  UNION ALL SELECT 50,'vouchers.receipts_total',     COALESCE(SUM(total_amount),0)          FROM ve_active WHERE voucher_type='receipt'
  UNION ALL SELECT 51,'vouchers.payments_total',     COALESCE(SUM(total_amount),0)          FROM ve_active WHERE voucher_type='payment'
  UNION ALL SELECT 52,'vouchers.expenses_total',     COALESCE(SUM(total_amount),0)          FROM ve_active WHERE voucher_type='expense'
  UNION ALL SELECT 53,'vouchers.salary_total',       COALESCE(SUM(total_amount),0)          FROM ve_active WHERE voucher_type='salary'
  UNION ALL SELECT 54,'vouchers.credit_note_total',  COALESCE(SUM(total_amount),0)          FROM ve_active WHERE voucher_type='credit_note'
  UNION ALL SELECT 60,'stock_value.current',         stock_value                            FROM stock_now
) t ORDER BY ord;

\echo ''
\echo '======================================================================'
\echo '3) GL vs OPERATIONAL — drift table'
\echo '======================================================================'
\echo '   drift = gl - operational   |   |drift| <= 0.50 = clean'

WITH gl AS (
  SELECT coa.account_code, coa.account_name,
         SUM(jl.debit_amount)              AS dr,
         SUM(jl.credit_amount)             AS cr,
         SUM(jl.debit_amount - jl.credit_amount) AS net_dr
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jl.account_id
  WHERE je.organization_id = :org_id::uuid
    AND je.date <= :as_of_date::date
  GROUP BY coa.account_code, coa.account_name
),
op AS (
  SELECT
    (SELECT COALESCE(SUM(net_amount),0)         FROM sales
      WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(is_cancelled,false)=false AND sale_date<=:as_of_date::date) AS sales_net,
    (SELECT COALESCE(SUM(gross_amount),0)       FROM sales
      WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(is_cancelled,false)=false AND sale_date<=:as_of_date::date) AS sales_gross,
    (SELECT COALESCE(SUM(discount_amount),0) + COALESCE(SUM(flat_discount_amount),0) FROM sales
      WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(is_cancelled,false)=false AND sale_date<=:as_of_date::date) AS sales_discount,
    (SELECT COALESCE(SUM(net_amount),0)         FROM purchase_bills
      WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND bill_date<=:as_of_date::date) AS purchase_net,
    (SELECT COALESCE(SUM(net_amount),0)         FROM sale_returns
      WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND return_date<=:as_of_date::date) AS sr_net,
    (SELECT COALESCE(SUM(net_amount),0)         FROM purchase_returns
      WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND return_date<=:as_of_date::date) AS pr_net,
    (SELECT COALESCE(SUM(COALESCE(pv.stock_qty,0)*COALESCE(pv.pur_price,0)),0)
       FROM product_variants pv JOIN products p ON p.id=pv.product_id
      WHERE p.organization_id=:org_id::uuid AND p.deleted_at IS NULL) AS stock_value
)
SELECT bucket, gl_value, op_value, ROUND((gl_value-op_value)::numeric,2) AS drift,
       CASE WHEN ABS(gl_value-op_value) <= 0.50 THEN 'clean'
            WHEN ABS(gl_value-op_value) <= 100  THEN 'minor'
            ELSE 'INVESTIGATE' END AS status
FROM (
  SELECT 'Sales Revenue (Cr) vs sales.net_amount' AS bucket,
         ROUND(COALESCE((SELECT -net_dr FROM gl WHERE account_code='4000'),0)::numeric,2) AS gl_value,
         ROUND((SELECT sales_net FROM op)::numeric,2) AS op_value
  UNION ALL
  SELECT 'Sales Returns (Dr) vs sale_returns.net_amount',
         ROUND(COALESCE((SELECT net_dr FROM gl WHERE account_code='4050'),0)::numeric,2),
         ROUND((SELECT sr_net FROM op)::numeric,2)
  UNION ALL
  SELECT 'COGS (Dr) — info only, compare to gross margin',
         ROUND(COALESCE((SELECT net_dr FROM gl WHERE account_code='5000'),0)::numeric,2),
         NULL
  UNION ALL
  SELECT 'Accounts Payable (Cr) vs purchases - paid',
         ROUND(COALESCE((SELECT -net_dr FROM gl WHERE account_code='2000'),0)::numeric,2),
         ROUND(((SELECT purchase_net FROM op) - (SELECT pr_net FROM op))::numeric,2)
  UNION ALL
  SELECT 'Purchase Returns (Cr) vs purchase_returns.net_amount',
         ROUND(COALESCE((SELECT -net_dr FROM gl WHERE account_code='5050'),0)::numeric,2),
         ROUND((SELECT pr_net FROM op)::numeric,2)
  UNION ALL
  SELECT 'Stock-in-Hand (Dr) vs current stock valuation',
         ROUND(COALESCE((SELECT net_dr FROM gl WHERE account_code='1300'),0)::numeric,2),
         ROUND((SELECT stock_value FROM op)::numeric,2)
  UNION ALL
  SELECT 'Cash + Bank (Dr) — info, compare to physical day-end',
         ROUND((COALESCE((SELECT net_dr FROM gl WHERE account_code='1000'),0)
              + COALESCE((SELECT net_dr FROM gl WHERE account_code='1010'),0))::numeric,2),
         NULL
) x;

\echo ''
\echo '======================================================================'
\echo '4) Journal posting backlog (rows that should be in GL but are not)'
\echo '======================================================================'
SELECT 'sales'           AS source, COUNT(*) FROM sales
  WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(is_cancelled,false)=false AND COALESCE(journal_status,'pending')<>'posted'
UNION ALL SELECT 'purchase_bills',     COUNT(*) FROM purchase_bills
  WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(journal_status,'pending')<>'posted'
UNION ALL SELECT 'sale_returns',       COUNT(*) FROM sale_returns
  WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(journal_status,'pending')<>'posted'
UNION ALL SELECT 'purchase_returns',   COUNT(*) FROM purchase_returns
  WHERE organization_id=:org_id::uuid AND deleted_at IS NULL AND COALESCE(journal_status,'pending')<>'posted';

\echo ''
\echo '======================================================================'
\echo 'END OF AUDIT'
\echo '======================================================================'