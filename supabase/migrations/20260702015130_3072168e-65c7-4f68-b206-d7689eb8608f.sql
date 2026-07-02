-- Repair Ella Noor invoices where credit_applied is a phantom duplicate of sale_return_adjust.
-- Only touches rows where:
--   * organization = ELLA NOOR
--   * not deleted, not cancelled
--   * credit_applied > 0 AND credit_applied = sale_return_adjust
--   * no active (non-deleted) CreditNote voucher backs the sale
-- Effect: sets credit_applied = 0 so pending is no longer double-subtracted.
-- Balance-preserving: the SR credit stays via sale_return_adjust; only the duplicate is cleared.

WITH org AS (SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id),
target AS (
  SELECT s.id
  FROM sales s
  WHERE s.organization_id = (SELECT id FROM org)
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.credit_applied, 0) > 0
    AND COALESCE(s.credit_applied, 0) = COALESCE(s.sale_return_adjust, 0)
    AND NOT EXISTS (
      SELECT 1 FROM voucher_entries ve
      WHERE ve.reference_id = s.id
        AND ve.voucher_type IN ('CreditNoteApplication', 'CustomerCreditNoteApplication', 'CreditNote')
        AND ve.deleted_at IS NULL
    )
)
UPDATE sales
SET credit_applied = 0,
    updated_at = now()
WHERE id IN (SELECT id FROM target);

-- Recompute payment_status for the touched invoices
WITH org AS (SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id)
UPDATE sales s
SET payment_status = CASE
    WHEN COALESCE(s.paid_amount,0) + COALESCE(s.sale_return_adjust,0) + COALESCE(s.credit_applied,0) >= s.net_amount - 0.5 THEN 'completed'
    WHEN COALESCE(s.paid_amount,0) + COALESCE(s.sale_return_adjust,0) + COALESCE(s.credit_applied,0) > 0 THEN 'partial'
    ELSE 'pending'
  END
WHERE s.organization_id = (SELECT id FROM org)
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false;