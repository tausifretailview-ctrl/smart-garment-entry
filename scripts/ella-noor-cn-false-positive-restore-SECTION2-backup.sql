-- SECTION 2 ONLY — backup before 28-row repair (run once)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67

CREATE TABLE IF NOT EXISTS public.ella_noor_cn_false_positive_restore_20260822_snapshot (
  snapshot_kind text NOT NULL,
  row_id uuid NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

WITH false_positive_fp AS (
  SELECT ve.id AS voucher_id, ve.reference_id AS sale_id, sr.id AS sale_return_id
  FROM public.voucher_entries ve
  INNER JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id AND s.deleted_at IS NULL
  LEFT JOIN public.sale_returns sr ON sr.linked_sale_id = s.id AND sr.organization_id = ve.organization_id
    AND sr.deleted_at IS NULL AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
INSERT INTO public.ella_noor_cn_false_positive_restore_20260822_snapshot(snapshot_kind, row_id, payload)
SELECT 'voucher_entry', ve.id, to_jsonb(ve)
FROM public.voucher_entries ve
WHERE ve.id IN (SELECT voucher_id FROM false_positive_fp);

WITH false_positive_fp AS (
  SELECT ve.reference_id AS sale_id
  FROM public.voucher_entries ve
  INNER JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id AND s.deleted_at IS NULL
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
INSERT INTO public.ella_noor_cn_false_positive_restore_20260822_snapshot(snapshot_kind, row_id, payload)
SELECT 'sale', s.id,
  jsonb_build_object(
    'sale_number', s.sale_number,
    'net_amount', s.net_amount,
    'paid_amount', s.paid_amount,
    'sale_return_adjust', s.sale_return_adjust,
    'payment_status', s.payment_status,
    'customer_id', s.customer_id
  )
FROM public.sales s
WHERE s.id IN (SELECT sale_id FROM false_positive_fp);

WITH false_positive_fp AS (
  SELECT sr.id AS sale_return_id
  FROM public.voucher_entries ve
  INNER JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id AND s.deleted_at IS NULL
  INNER JOIN public.sale_returns sr ON sr.linked_sale_id = s.id AND sr.organization_id = ve.organization_id
    AND sr.deleted_at IS NULL AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
INSERT INTO public.ella_noor_cn_false_positive_restore_20260822_snapshot(snapshot_kind, row_id, payload)
SELECT 'sale_return', sr.id, to_jsonb(sr)
FROM public.sale_returns sr
WHERE sr.id IN (SELECT sale_return_id FROM false_positive_fp);

SELECT snapshot_kind, COUNT(*) AS rows_backed_up
FROM public.ella_noor_cn_false_positive_restore_20260822_snapshot
GROUP BY snapshot_kind
ORDER BY snapshot_kind;
