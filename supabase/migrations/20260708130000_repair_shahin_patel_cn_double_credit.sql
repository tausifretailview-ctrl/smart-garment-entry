-- One-off data repair: SHAHIN PATEL credit-note double-credit.
--
-- Pattern (the bug): a sale return was adjusted at billing (sale_returns.credit_status =
-- 'adjusted' with linked_sale_id set -> already baked into the invoice's net_amount) AND
-- it still carries a credit_note_id whose CN was ALSO applied to the same invoice via a
-- credit_note_adjustment receipt. That hands the customer the same credit twice
-- (SHAHIN PATEL: SR/26-27/18 -> CN/26-27/4 -> RCP/26-27/25 = ₹1,000 and
--  SR/26-27/19 -> CN/26-27/5 -> RCP/26-27/26 = ₹750).
--
-- This repair is SCOPED to the customer "SHAHIN PATEL" and to that exact signature, so it
-- cannot touch legitimate, separately-applied credit notes for other customers.
--
-- REVIEW FIRST (run these SELECTs before applying):
--   -- target returns
--   SELECT sr.return_number, sr.net_amount, sr.linked_sale_id, sr.credit_note_id
--   FROM sale_returns sr JOIN customers c ON c.id = sr.customer_id
--   WHERE UPPER(TRIM(c.customer_name)) = 'SHAHIN PATEL'
--     AND sr.deleted_at IS NULL AND LOWER(sr.credit_status) = 'adjusted'
--     AND sr.linked_sale_id IS NOT NULL AND sr.credit_note_id IS NOT NULL;
--   -- phantom receipts that will be soft-deleted
--   SELECT ve.voucher_number, ve.total_amount, ve.payment_method, ve.description, ve.reference_id
--   FROM voucher_entries ve JOIN sale_returns sr ON sr.linked_sale_id = ve.reference_id
--   JOIN customers c ON c.id = sr.customer_id
--   WHERE UPPER(TRIM(c.customer_name)) = 'SHAHIN PATEL'
--     AND ve.voucher_type = 'receipt' AND LOWER(COALESCE(ve.payment_method,'')) = 'credit_note_adjustment'
--     AND ve.deleted_at IS NULL AND sr.deleted_at IS NULL AND LOWER(sr.credit_status) = 'adjusted'
--     AND sr.credit_note_id IS NOT NULL;
--
-- Depends on public.compute_sale_settlement (migration 20260708120000).

-- 1. Remove the duplicated CN-application rows from the Customer Account Statement ledger.
DELETE FROM public.customer_ledger_entries cle
USING public.voucher_entries ve,
      public.sale_returns sr,
      public.customers c
WHERE cle.organization_id = ve.organization_id
  AND cle.customer_id = c.id
  AND cle.voucher_no = ve.voucher_number
  AND ve.organization_id = sr.organization_id
  AND ve.reference_id = sr.linked_sale_id
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND sr.customer_id = c.id
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND UPPER(TRIM(c.customer_name)) = 'SHAHIN PATEL';

-- 2. Soft-delete the phantom credit_note_adjustment receipts (RCP/.../25, RCP/.../26).
UPDATE public.voucher_entries ve
SET deleted_at = now()
FROM public.sale_returns sr,
     public.customers c
WHERE ve.organization_id = sr.organization_id
  AND ve.reference_id = sr.linked_sale_id
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.deleted_at IS NULL
  AND sr.customer_id = c.id
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND UPPER(TRIM(c.customer_name)) = 'SHAHIN PATEL';

-- 3. Void the now-redundant credit notes (CN/.../4, CN/.../5). The sale returns stay
--    'adjusted' with their linked_sale_id -> the real credit remains inside the invoice net.
UPDATE public.credit_notes cn
SET status = 'void',
    used_amount = 0
FROM public.sale_returns sr,
     public.customers c
WHERE cn.id = sr.credit_note_id
  AND cn.organization_id = sr.organization_id
  AND cn.deleted_at IS NULL
  AND sr.customer_id = c.id
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND UPPER(TRIM(c.customer_name)) = 'SHAHIN PATEL';

-- 4. Resync paid_amount / payment_status for SHAHIN PATEL's invoices with the corrected model.
--    Expected after repair: INV/20 -> pending (0/1,000), INV/21 -> partial (1,500/2,250),
--    INV/22 -> completed (5,850/5,850). Net customer due: ₹1,750 Dr.
UPDATE public.sales s
SET paid_amount = calc.new_paid,
    payment_status = calc.new_status
FROM public.customers c,
     LATERAL public.compute_sale_settlement(s.id, s.organization_id) AS calc
WHERE s.customer_id = c.id
  AND s.organization_id = c.organization_id
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
  AND calc.new_paid IS NOT NULL
  AND UPPER(TRIM(c.customer_name)) = 'SHAHIN PATEL';
