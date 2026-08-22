-- =============================================================================
-- ELLA NOOR — Faiza Adil paid_amount / SRA double-count fix
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Invoice: INV/26-27/2423
-- =============================================================================
-- Symptom: paid_amount ₹2,200 = net = SRA; compute_sale_settlement new_paid=0.
-- R5 resync blocked (would downgrade completed → pending).
-- Fix: zero paid_amount; keep completed (SRA settles invoice).
-- =============================================================================

-- §1 Investigate
SELECT
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.payment_status,
  cs.new_paid,
  cs.new_status,
  s.net_amount - s.paid_amount - COALESCE(s.sale_return_adjust, 0) AS invoice_remaining
FROM public.sales s
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number = 'INV/26-27/2423'
  AND s.deleted_at IS NULL;

-- §2 Repair
/*
BEGIN;

UPDATE public.sales s
SET
  paid_amount = 0,
  payment_status = 'completed',
  notes = COALESCE(s.notes, '') ||
    E'\n[faiza_sra_paid_fix_20260822] paid_amount zeroed; SRA settles invoice',
  updated_at = now()
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number = 'INV/26-27/2423'
  AND s.deleted_at IS NULL
  AND COALESCE(s.sale_return_adjust, 0) >= s.net_amount - 0.5;

COMMIT;
*/

-- §3 Verify — expect 0 paid drift rows for this invoice
SELECT
  s.sale_number,
  s.paid_amount,
  cs.new_paid,
  ROUND(s.paid_amount - cs.new_paid, 2) AS drift
FROM public.sales s
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
WHERE s.sale_number = 'INV/26-27/2423'
  AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.deleted_at IS NULL;
