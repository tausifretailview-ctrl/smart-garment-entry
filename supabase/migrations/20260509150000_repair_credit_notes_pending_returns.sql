-- Repair credit_notes rows that were incorrectly created with used_amount = credit_amount
-- and status = fully_used while the linked sale_return is still pending (no real consumption).
-- This restores available balance for adjust_invoice_balance and CN payment flows.

UPDATE public.credit_notes cn
SET
  used_amount = 0,
  status = 'active',
  updated_at = NOW()
FROM public.sale_returns sr
WHERE sr.credit_note_id = cn.id
  AND sr.deleted_at IS NULL
  AND cn.deleted_at IS NULL
  AND sr.refund_type = 'credit_note'
  AND (sr.credit_status IS NULL OR sr.credit_status = 'pending')
  AND cn.used_amount >= cn.credit_amount - 0.01
  AND NOT EXISTS (
    SELECT 1
    FROM public.invoice_adjustments ia
    WHERE ia.source_document_id = cn.id
      AND ia.adjustment_type = 'CREDIT_NOTE'
      AND ia.organization_id = cn.organization_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.sale_return_invoice_allocations sria
    WHERE sria.sale_return_id = sr.id
  );
