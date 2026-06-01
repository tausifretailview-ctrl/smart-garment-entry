-- =============================================================================
-- ELLA NOOR — Receivables Audit (READ-ONLY)
-- =============================================================================
-- Purpose: reconcile customer receivables across all four UI surfaces and the
-- raw ledger, one row per customer, so the true economic AR can be agreed BEFORE
-- any data repair. NOTHING here writes/updates/deletes.
--
-- How to run (Supabase SQL editor):
--   1. Run SECTION 1 (per-customer detail) and "Download CSV".
--   2. Run SECTIONS 2-5 for the org-level totals and the three flag lists.
--
-- Org resolution: by name. If more than one org matches, replace the subselect
--   (SELECT id FROM public.organizations WHERE name ILIKE '%ELLA NOOR%' ...)
--   with the literal org id everywhere below.
--
-- Formula notes (all amounts are rupees):
--   * sales.net_amount is stored POST-adjust (already net of sale_return_adjust).
--   * receipt "cash" = total_amount + discount_amount, EXCLUDING advance/CN
--     application receipts (payment_method advance_adjustment / credit_note_adjustment).
--   * balance_* columns reconstruct each screen's formula for side-by-side diffing:
--       - balance_main_dashboard : Σ max(0, net − paid_amount − sale_return_adjust)  [current Main Dashboard]
--       - balance_accounts_mgmt  : Σ max(0, net − min(net, max(paid_amount, voucher_all)))  [Accounts Mgmt tiles]
--       - balance_ledger_approx  : opening + Σnet − (cash + cn_applied + cust_cash) − refunds_paid − adv_used − unused_advance  [useCustomerBalance core, audit formula]
--       - balance_master_recon   : opening + Σnet − receipts_all − sale_returns_total + refunds_paid − unused_cn − unused_advance  [target formula AS STATED — understated by sra]
--       - balance_master_recon_corrected : same but adds sra back (net is post-adjust, so full sale_returns_total double-counts the billed-adjust part)  [recommended "true economic AR"]
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECTION 1 — Per-customer detail (export this as CSV)
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
cust AS (
  SELECT c.id, c.customer_name, COALESCE(c.opening_balance, 0) AS opening
  FROM public.customers c, org
  WHERE c.organization_id = org.id
    AND c.deleted_at IS NULL
),
sale_rows AS (
  SELECT s.id, s.customer_id,
         COALESCE(s.net_amount, 0)            AS net_amount,
         COALESCE(s.sale_return_adjust, 0)    AS sra,
         COALESCE(s.paid_amount, 0)           AS paid_amount
  FROM public.sales s, org
  WHERE s.organization_id = org.id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND s.customer_id IS NOT NULL
),
sale_voucher AS (
  SELECT ve.reference_id AS sale_id,
         SUM(CASE WHEN LOWER(COALESCE(ve.payment_method,'')) IN ('advance_adjustment','credit_note_adjustment')
                  THEN 0 ELSE COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0) END) AS v_cash,
         SUM(CASE WHEN LOWER(COALESCE(ve.payment_method,'')) = 'advance_adjustment'
                  THEN COALESCE(ve.total_amount,0) ELSE 0 END) AS v_adv,
         SUM(CASE WHEN LOWER(COALESCE(ve.payment_method,'')) = 'credit_note_adjustment'
                  THEN COALESCE(ve.total_amount,0) ELSE 0 END) AS v_cn,
         SUM(COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)) AS v_all
  FROM public.voucher_entries ve, org
  WHERE ve.organization_id = org.id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type IN ('sale','SALE','customer','CustomerReceipt')
    AND ve.deleted_at IS NULL
    AND ve.reference_id IN (SELECT id FROM sale_rows)
  GROUP BY ve.reference_id
),
sale_calc AS (
  SELECT sr.customer_id,
         sr.net_amount, sr.sra, sr.paid_amount,
         COALESCE(sv.v_cash,0) AS v_cash,
         COALESCE(sv.v_adv,0)  AS v_adv,
         COALESCE(sv.v_cn,0)   AS v_cn,
         COALESCE(sv.v_all,0)  AS v_all,
         GREATEST(0, sr.net_amount - sr.paid_amount - sr.sra) AS md_out,
         GREATEST(0, sr.net_amount - LEAST(sr.net_amount, GREATEST(sr.paid_amount, COALESCE(sv.v_all,0)))) AS am_out
  FROM sale_rows sr
  LEFT JOIN sale_voucher sv ON sv.sale_id = sr.id
),
cust_sales AS (
  SELECT customer_id,
         SUM(net_amount)  AS gross_sales,
         SUM(sra)         AS sra_on_sales,
         SUM(paid_amount) AS sales_paid_amount,
         SUM(v_cash)      AS v_cash,
         SUM(v_adv)       AS v_adv,
         SUM(v_cn)        AS v_cn,
         SUM(v_all)       AS v_all,
         SUM(md_out)      AS balance_main_dashboard,
         SUM(am_out)      AS balance_accounts_mgmt
  FROM sale_calc
  GROUP BY customer_id
),
-- Customer-level cash receipts NOT tied to a sale (opening-balance payments).
cust_cash AS (
  SELECT ve.reference_id AS customer_id,
         SUM(COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)) AS cust_cash
  FROM public.voucher_entries ve, org
  WHERE ve.organization_id = org.id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type IN ('customer','customer_payment','CustomerReceipt')
    AND ve.deleted_at IS NULL
    AND LOWER(COALESCE(ve.payment_method,'')) NOT IN ('advance_adjustment','credit_note_adjustment')
    AND ve.reference_id IN (SELECT id FROM cust)
  GROUP BY ve.reference_id
),
cust_refunds AS (
  SELECT ve.reference_id AS customer_id,
         SUM(COALESCE(ve.total_amount,0)) AS refunds_paid
  FROM public.voucher_entries ve, org
  WHERE ve.organization_id = org.id
    AND ve.voucher_type = 'payment'
    AND ve.reference_type IN ('customer','CustomerReceipt')
    AND ve.deleted_at IS NULL
    AND ve.reference_id IN (SELECT id FROM cust)
  GROUP BY ve.reference_id
),
cust_returns AS (
  SELECT sr.customer_id, SUM(COALESCE(sr.net_amount,0)) AS sale_returns_total
  FROM public.sale_returns sr, org
  WHERE sr.organization_id = org.id
    AND sr.deleted_at IS NULL
    AND sr.customer_id IS NOT NULL
  GROUP BY sr.customer_id
),
cust_adv AS (
  SELECT ca.customer_id,
         SUM(COALESCE(ca.amount,0))      AS adv_amount,
         SUM(COALESCE(ca.used_amount,0)) AS adv_used
  FROM public.customer_advances ca, org
  WHERE ca.organization_id = org.id
  GROUP BY ca.customer_id
),
cust_advref AS (
  SELECT ca.customer_id, SUM(COALESCE(ar.refund_amount,0)) AS adv_refunded
  FROM public.advance_refunds ar
  JOIN public.customer_advances ca ON ca.id = ar.advance_id
  JOIN org ON org.id = ca.organization_id
  GROUP BY ca.customer_id
),
cust_cn AS (
  SELECT cn.customer_id,
         SUM(GREATEST(0, COALESCE(cn.credit_amount,0) - COALESCE(cn.used_amount,0))) AS unused_cn
  FROM public.credit_notes cn, org
  WHERE cn.organization_id = org.id
    AND cn.deleted_at IS NULL
    AND LOWER(COALESCE(cn.status,'')) NOT IN ('void','cancelled')
    AND cn.customer_id IS NOT NULL
  GROUP BY cn.customer_id
)
SELECT
  c.customer_name,
  ROUND(c.opening, 2)                                            AS opening,
  ROUND(COALESCE(cs.gross_sales,0), 2)                           AS gross_sales,
  ROUND(COALESCE(cs.sra_on_sales,0), 2)                          AS sale_return_adjust_on_sales,
  ROUND(COALESCE(cs.sales_paid_amount,0), 2)                     AS sales_paid_amount,
  ROUND(COALESCE(cs.v_cash,0) + COALESCE(cc.cust_cash,0), 2)     AS voucher_receipts_cash,
  ROUND(COALESCE(cs.v_adv,0), 2)                                 AS voucher_receipts_adv_applied,
  ROUND(COALESCE(cs.v_cn,0), 2)                                  AS voucher_receipts_cn_applied,
  ROUND(COALESCE(cs.v_all,0) + COALESCE(cc.cust_cash,0), 2)      AS voucher_receipts_all,
  ROUND(COALESCE(cr.sale_returns_total,0), 2)                    AS sale_returns_total,
  ROUND(COALESCE(cf.refunds_paid,0), 2)                          AS refunds_paid,
  ROUND(GREATEST(0, COALESCE(ca.adv_amount,0) - COALESCE(ca.adv_used,0) - COALESCE(cv.adv_refunded,0)), 2) AS unused_advance,
  ROUND(COALESCE(ccn.unused_cn,0), 2)                            AS unused_cn,
  -- Drift: at-sale paid_amount vs cash receipts actually on file
  ROUND(COALESCE(cs.sales_paid_amount,0) - (COALESCE(cs.v_cash,0) + COALESCE(cc.cust_cash,0)), 2) AS drift_paid_vs_voucher,
  -- Screen reconstructions
  ROUND(COALESCE(cs.balance_main_dashboard,0), 2)                AS balance_main_dashboard,
  ROUND(COALESCE(cs.balance_accounts_mgmt,0), 2)                 AS balance_accounts_mgmt,
  ROUND(
    c.opening
    + COALESCE(cs.gross_sales,0)
    - (COALESCE(cs.v_cash,0) + COALESCE(cs.v_cn,0) + COALESCE(cc.cust_cash,0))
    - COALESCE(cf.refunds_paid,0)
    - COALESCE(ca.adv_used,0)
    - GREATEST(0, COALESCE(ca.adv_amount,0) - COALESCE(ca.adv_used,0) - COALESCE(cv.adv_refunded,0))
  , 2)                                                            AS balance_ledger_approx,
  ROUND(
    c.opening
    + COALESCE(cs.gross_sales,0)
    - (COALESCE(cs.v_all,0) + COALESCE(cc.cust_cash,0))
    - COALESCE(cr.sale_returns_total,0)
    + COALESCE(cf.refunds_paid,0)
    - COALESCE(ccn.unused_cn,0)
    - GREATEST(0, COALESCE(ca.adv_amount,0) - COALESCE(ca.adv_used,0) - COALESCE(cv.adv_refunded,0))
  , 2)                                                            AS balance_master_recon,
  -- Corrected master AR: net_amount is already post-adjust, so subtracting the
  -- FULL sale_returns_total double-counts the part absorbed at billing (sra).
  -- Add sra back (equivalently: use gross_invoiced = net + sra) to avoid that.
  ROUND(
    c.opening
    + COALESCE(cs.gross_sales,0) + COALESCE(cs.sra_on_sales,0)
    - (COALESCE(cs.v_all,0) + COALESCE(cc.cust_cash,0))
    - COALESCE(cr.sale_returns_total,0)
    + COALESCE(cf.refunds_paid,0)
    - COALESCE(ccn.unused_cn,0)
    - GREATEST(0, COALESCE(ca.adv_amount,0) - COALESCE(ca.adv_used,0) - COALESCE(cv.adv_refunded,0))
  , 2)                                                            AS balance_master_recon_corrected
FROM cust c
LEFT JOIN cust_sales   cs  ON cs.customer_id  = c.id
LEFT JOIN cust_cash    cc  ON cc.customer_id  = c.id
LEFT JOIN cust_refunds cf  ON cf.customer_id  = c.id
LEFT JOIN cust_returns cr  ON cr.customer_id  = c.id
LEFT JOIN cust_adv     ca  ON ca.customer_id  = c.id
LEFT JOIN cust_advref  cv  ON cv.customer_id  = c.id
LEFT JOIN cust_cn      ccn ON ccn.customer_id = c.id
ORDER BY balance_master_recon DESC;


-- -----------------------------------------------------------------------------
-- SECTION 2 — Org-level totals (sanity vs each screen). Run separately.
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
)
SELECT
  (SELECT COALESCE(SUM(opening_balance),0) FROM public.customers c, org WHERE c.organization_id = org.id AND c.deleted_at IS NULL) AS opening_total,
  (SELECT COALESCE(SUM(net_amount),0) FROM public.sales s, org WHERE s.organization_id = org.id AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled,false)=false AND COALESCE(s.payment_status,'') NOT IN ('cancelled','hold')) AS gross_sales_total,
  (SELECT COALESCE(SUM(sale_return_adjust),0) FROM public.sales s, org WHERE s.organization_id = org.id AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled,false)=false AND COALESCE(s.payment_status,'') NOT IN ('cancelled','hold')) AS sra_total,
  (SELECT COALESCE(SUM(paid_amount),0) FROM public.sales s, org WHERE s.organization_id = org.id AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled,false)=false AND COALESCE(s.payment_status,'') NOT IN ('cancelled','hold')) AS sales_paid_total,
  (SELECT COALESCE(SUM(COALESCE(total_amount,0)+COALESCE(discount_amount,0)),0) FROM public.voucher_entries ve, org WHERE ve.organization_id = org.id AND ve.voucher_type='receipt' AND ve.deleted_at IS NULL) AS receipts_all_total,
  (SELECT COALESCE(SUM(COALESCE(total_amount,0)+COALESCE(discount_amount,0)),0) FROM public.voucher_entries ve, org WHERE ve.organization_id = org.id AND ve.voucher_type='receipt' AND ve.deleted_at IS NULL AND LOWER(COALESCE(payment_method,'')) NOT IN ('advance_adjustment','credit_note_adjustment')) AS receipts_cash_total,
  (SELECT COALESCE(SUM(total_amount),0) FROM public.voucher_entries ve, org WHERE ve.organization_id = org.id AND ve.voucher_type='payment' AND ve.reference_type IN ('customer','CustomerReceipt') AND ve.deleted_at IS NULL) AS refunds_paid_total,
  (SELECT COALESCE(SUM(net_amount),0) FROM public.sale_returns sr, org WHERE sr.organization_id = org.id AND sr.deleted_at IS NULL) AS sale_returns_total,
  (SELECT COALESCE(SUM(GREATEST(0, amount - used_amount)),0) FROM public.customer_advances ca, org WHERE ca.organization_id = org.id) AS unused_advance_total,
  (SELECT COALESCE(SUM(GREATEST(0, credit_amount - used_amount)),0) FROM public.credit_notes cn, org WHERE cn.organization_id = org.id AND cn.deleted_at IS NULL AND LOWER(COALESCE(status,'')) NOT IN ('void','cancelled')) AS unused_cn_total;


-- -----------------------------------------------------------------------------
-- SECTION 3 — Drift candidates: sales.paid_amount > cash receipts on that sale.
-- (These are the rows whose paid_amount sync needs repair.)
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
sv AS (
  SELECT ve.reference_id AS sale_id,
         SUM(COALESCE(ve.total_amount,0)+COALESCE(ve.discount_amount,0)) AS v_all
  FROM public.voucher_entries ve, org
  WHERE ve.organization_id = org.id AND ve.voucher_type='receipt'
    AND ve.reference_type IN ('sale','customer') AND ve.deleted_at IS NULL
  GROUP BY ve.reference_id
)
SELECT s.sale_number, s.customer_name, s.payment_status,
       s.net_amount, s.sale_return_adjust, s.paid_amount,
       COALESCE(sv.v_all,0) AS voucher_receipts_on_sale,
       ROUND(s.paid_amount - COALESCE(sv.v_all,0), 2) AS drift
FROM public.sales s
CROSS JOIN org
LEFT JOIN sv ON sv.sale_id = s.id
WHERE s.organization_id = org.id
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled,false)=false
  AND COALESCE(s.payment_status,'') NOT IN ('cancelled','hold')
  AND s.paid_amount - COALESCE(sv.v_all,0) > 1
ORDER BY drift DESC;


-- -----------------------------------------------------------------------------
-- SECTION 4 — Sale-return double-credit candidates (the SHAHIN pattern, org-wide):
-- return adjusted at billing (linked + adjusted) AND still carries a credit note,
-- whose CN was applied to the same invoice.
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
)
SELECT sr.return_number, sr.customer_name, sr.net_amount, sr.credit_status,
       sr.linked_sale_id, sr.credit_note_id,
       s.sale_number, s.sale_return_adjust,
       cn.credit_note_number, cn.credit_amount, cn.used_amount, cn.status AS cn_status,
       (SELECT COUNT(*) FROM public.voucher_entries ve
          WHERE ve.organization_id = sr.organization_id
            AND ve.voucher_type='receipt'
            AND LOWER(COALESCE(ve.payment_method,''))='credit_note_adjustment'
            AND ve.reference_id = sr.linked_sale_id
            AND ve.deleted_at IS NULL) AS cn_receipts_on_invoice
FROM public.sale_returns sr
CROSS JOIN org
JOIN public.sales s ON s.id = sr.linked_sale_id
LEFT JOIN public.credit_notes cn ON cn.id = sr.credit_note_id
WHERE sr.organization_id = org.id
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND COALESCE(s.sale_return_adjust,0) > 0
ORDER BY sr.net_amount DESC;


-- -----------------------------------------------------------------------------
-- SECTION 5 — Customers carrying a CREDIT balance (master recon < −100).
-- These are clamped to 0 by the Customer Ledger card; surface them as a pool.
-- -----------------------------------------------------------------------------
-- Re-run SECTION 1 and filter: WHERE balance_master_recon_corrected < -100
-- (kept here as a reminder; the SECTION 1 query already produces this column).


-- -----------------------------------------------------------------------------
-- SECTION 6 — Diagnostics for the two plan-vs-DB mismatches.
-- 6a) Advance breakdown by status (does 'unused' depend on status / refunds?).
-- 6b) Which reference_type do refund (payment) vouchers actually carry?
-- -----------------------------------------------------------------------------
WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
)
SELECT '6a advance by status' AS section,
       COALESCE(ca.status,'(null)') AS status,
       COUNT(*) AS n,
       ROUND(SUM(COALESCE(ca.amount,0)),2)              AS amount,
       ROUND(SUM(COALESCE(ca.used_amount,0)),2)         AS used,
       ROUND(SUM(GREATEST(0, ca.amount - ca.used_amount)),2) AS unused_clamped,
       ROUND(SUM(ca.amount - ca.used_amount),2)         AS unused_raw
FROM public.customer_advances ca, org
WHERE ca.organization_id = org.id
GROUP BY ROLLUP (ca.status)
ORDER BY status;

WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
)
SELECT '6b payment vouchers by reference_type' AS section,
       ve.reference_type,
       COUNT(*) AS n,
       ROUND(SUM(COALESCE(ve.total_amount,0)),2) AS total
FROM public.voucher_entries ve, org
WHERE ve.organization_id = org.id
  AND ve.voucher_type = 'payment'
  AND ve.deleted_at IS NULL
GROUP BY ROLLUP (ve.reference_type)
ORDER BY total DESC;
