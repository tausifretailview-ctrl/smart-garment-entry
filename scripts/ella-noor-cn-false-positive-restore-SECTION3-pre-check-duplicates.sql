-- SECTION 3 PRE-CHECK — voucher_number collisions before restore
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Run read-only before SECTION 3. Any SKIP_RESTORE rows are handled by the updated
-- repair script (SRA still applied; deleted twin left in Recycle Bin with audit note).

WITH false_positive_fp AS (
  SELECT
    ve.id                    AS deleted_voucher_id,
    ve.voucher_number,
    ve.reference_id          AS sale_id,
    s.sale_number,
    c.customer_name,
    ve.total_amount          AS cn_amount,
    ve.deleted_at
  FROM public.voucher_entries ve
  INNER JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  LEFT JOIN public.customers c
    ON c.id = s.customer_id
   AND c.organization_id = ve.organization_id
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
SELECT
  fp.voucher_number,
  fp.customer_name,
  fp.sale_number,
  fp.cn_amount,
  fp.deleted_voucher_id,
  active.id                AS active_voucher_id,
  active.reference_id      AS active_reference_id,
  active_s.sale_number     AS active_sale_number,
  active.total_amount      AS active_amount,
  active.payment_method    AS active_payment_method,
  CASE
    WHEN active.id IS NULL THEN 'RESTORE'
    WHEN active.reference_id = fp.sale_id THEN 'SKIP_RESTORE — same invoice already has active receipt'
    ELSE 'REVIEW — active voucher same number, different sale'
  END AS restore_action
FROM false_positive_fp fp
LEFT JOIN public.voucher_entries active
  ON active.voucher_number = fp.voucher_number
 AND active.deleted_at IS NULL
 AND active.id <> fp.deleted_voucher_id
LEFT JOIN public.sales active_s
  ON active_s.id = active.reference_id
 AND active_s.organization_id = active.organization_id
ORDER BY restore_action DESC, fp.voucher_number;
