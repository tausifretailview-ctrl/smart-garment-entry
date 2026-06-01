-- One-off data repair: ELLA NOOR credit-note double-credit + paid_amount resync.
-- Organization: 3fdca631-1e0c-4417-9704-421f5129ff67
--
-- Pattern (the bug, same as SHAHIN PATEL but org-wide): a sale return was adjusted
-- at billing (sale_returns.credit_status = 'adjusted' with linked_sale_id set ->
-- already baked into the invoice's net_amount, so sales.sale_return_adjust > 0) AND
-- it still carries a credit_note_id whose CN was ALSO applied to the same invoice via
-- a credit_note_adjustment receipt. That credits the customer twice for one return.
--
-- The audit (scripts/ella-noor-receivables-audit.sql, Section 4) found 19 such
-- returns (~₹1,16,950 of CN credit). 16 are clean (sale_return_adjust = return net =
-- CN amount); the 3 where the billing adjust does NOT cover the return net
-- (Naseem 14,400/sra 5,900; Shumama 11,250/sra 2,150; Siya 9,700/sra 12,150 — multi
-- return invoices) are intentionally LEFT ALONE by the
--   sale_return_adjust >= return net
-- guard below, so a partially-billed return whose CN is a genuine separate credit is
-- never voided.
--
-- REVIEW FIRST (run before applying):
--   -- target returns that WILL be repaired
--   SELECT sr.return_number, sr.net_amount, s.sale_number, s.sale_return_adjust,
--          sr.credit_note_id
--   FROM sale_returns sr
--   JOIN sales s ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
--   WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
--     AND sr.deleted_at IS NULL AND LOWER(sr.credit_status) = 'adjusted'
--     AND sr.linked_sale_id IS NOT NULL AND sr.credit_note_id IS NOT NULL
--     AND s.deleted_at IS NULL
--     AND COALESCE(s.sale_return_adjust, 0) >= COALESCE(sr.net_amount, 0) - 1;
--
-- Depends on public.compute_sale_settlement (migration 20260708120000).

-- 1. Remove the duplicated CN-application rows from the Customer Account Statement ledger.
DELETE FROM public.customer_ledger_entries cle
USING public.voucher_entries ve
JOIN public.sale_returns sr
  ON sr.linked_sale_id = ve.reference_id
 AND sr.organization_id = ve.organization_id
JOIN public.sales s
  ON s.id = sr.linked_sale_id
 AND s.organization_id = sr.organization_id
WHERE cle.organization_id = ve.organization_id
  AND cle.customer_id = sr.customer_id
  AND cle.voucher_no = ve.voucher_number
  AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.deleted_at IS NULL
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND s.deleted_at IS NULL
  AND COALESCE(s.sale_return_adjust, 0) >= COALESCE(sr.net_amount, 0) - 1;

-- 2. Soft-delete the phantom credit_note_adjustment receipts.
UPDATE public.voucher_entries ve
SET deleted_at = now()
FROM public.sale_returns sr
JOIN public.sales s
  ON s.id = sr.linked_sale_id
 AND s.organization_id = sr.organization_id
WHERE ve.organization_id = sr.organization_id
  AND ve.reference_id = sr.linked_sale_id
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.deleted_at IS NULL
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND s.deleted_at IS NULL
  AND COALESCE(s.sale_return_adjust, 0) >= COALESCE(sr.net_amount, 0) - 1
  AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 3. Void the now-redundant credit notes. The sale returns stay 'adjusted' with their
--    linked_sale_id -> the real credit remains inside the invoice net_amount.
UPDATE public.credit_notes cn
SET status = 'void',
    used_amount = 0
FROM public.sale_returns sr
JOIN public.sales s
  ON s.id = sr.linked_sale_id
 AND s.organization_id = sr.organization_id
WHERE cn.id = sr.credit_note_id
  AND cn.organization_id = sr.organization_id
  AND cn.deleted_at IS NULL
  AND sr.deleted_at IS NULL
  AND LOWER(sr.credit_status) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND sr.credit_note_id IS NOT NULL
  AND s.deleted_at IS NULL
  AND COALESCE(s.sale_return_adjust, 0) >= COALESCE(sr.net_amount, 0) - 1
  AND cn.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67';

-- 4. Resync paid_amount / payment_status for ALL of ELLA NOOR's live invoices with the
--    corrected settlement model (post-adjust net + CN dedupe). Runs AFTER the phantom
--    receipts above are removed, so it also clears the historical paid_amount drift the
--    audit found (Section 3) and re-settles the repaired invoices in one pass.
--
--    STRONG COVER FOR PAID INVOICES: the two guards keep this bulk resync NON-REGRESSIVE so
--    a genuinely settled invoice (whose payment may be a customer-keyed receipt that
--    compute_sale_settlement cannot see) is never flipped to a lower state or stripped of a
--    recorded paid_amount. (a) never downgrade 'completed'; (b) never reduce paid_amount
--    unless the row ends fully settled.
-- Postgres does not allow referencing the UPDATE target table inside a FROM-clause
-- function (LATERAL on the target). Compute via a CTE, then update by id.
WITH recomputed AS (
  SELECT
    s.id,
    s.paid_amount AS old_paid,
    s.payment_status AS old_status,
    c.new_paid,
    c.new_status
  FROM public.sales s
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) AS c
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND c.new_paid IS NOT NULL
)
UPDATE public.sales s
SET paid_amount = r.new_paid,
    payment_status = r.new_status
FROM recomputed r
WHERE r.id = s.id
  AND (
    ABS(COALESCE(r.old_paid, 0) - r.new_paid) > 0.009
    OR COALESCE(r.old_status, '') <> r.new_status
  )
  AND NOT (COALESCE(r.old_status, '') = 'completed' AND r.new_status <> 'completed')
  AND NOT (r.new_paid < COALESCE(r.old_paid, 0) - 0.009 AND r.new_status <> 'completed');
