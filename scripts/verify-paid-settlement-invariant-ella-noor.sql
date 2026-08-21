-- Phase 1 acceptance for cn_over_apply_repair_20260606 (ELLA NOOR).
--
-- A) paid ≠ compute_sale_settlement may be EMPTY: the June repair triggered receipt
--    sync, so paid_amount was rewritten to match remaining vouchers.
-- B) deleted_cn_adjust_without_sra must list the residual defects (CN-adjust soft-
--    deleted while sale_return_adjust stayed ~0). Zero on B = invariant wrong or
--    those receipts were undeleted / SRA was backfilled.

-- A) May be 0 rows (expected after synced paid)
SELECT
  i.entity_ref AS sale_number,
  i.detail AS recorded_minus_expected,
  s.paid_amount AS recorded_paid,
  c.new_paid AS expected_paid
FROM public.v_accounting_invariants i
JOIN public.sales s ON s.id = i.entity_id
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
WHERE i.check_name = 'paid_diverges_from_receipts'
  AND i.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
ORDER BY abs(i.detail) DESC
LIMIT 50;

-- B) Must return rows for ELLA NOOR while June false-positive deletes remain
SELECT
  i.entity_ref AS sale_or_voucher,
  i.detail AS deleted_cn_amount,
  s.sale_number,
  s.paid_amount,
  s.sale_return_adjust,
  ve.voucher_number,
  ve.deleted_at,
  left(COALESCE(ve.notes, ''), 120) AS notes_prefix
FROM public.v_accounting_invariants i
JOIN public.voucher_entries ve ON ve.id = i.entity_id
JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
WHERE i.check_name = 'deleted_cn_adjust_without_sra'
  AND i.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
ORDER BY i.detail DESC
LIMIT 50;

-- Tagged June batch still soft-deleted with SRA=0 (direct, no view required)
SELECT
  s.sale_number,
  s.paid_amount,
  s.sale_return_adjust,
  ve.voucher_number,
  ve.total_amount,
  ve.deleted_at
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'
  AND ve.deleted_at IS NOT NULL
  AND ve.notes ILIKE '%cn_over_apply_repair_20260606%'
  AND COALESCE(s.sale_return_adjust, 0) <= 1
ORDER BY ve.total_amount DESC;
