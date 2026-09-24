-- READ ONLY. Do not insert from this file.
-- Proposed sale_returns parents for orphaned POS credit notes.
-- Same predicate as the 24 Sep 2026 org scan (34 notes, ₹39,639).
--
-- linked_sale_id is NULL on purpose. The issuing sale's sale_return_adjust
-- already consumed the original return. This row is only the unused excess.
--
-- issuance_voucher_id: if set, that voucher already credits the customer.
-- Inserting the parent without retiring the voucher double-counts. Do not
-- insert until that column is reviewed.

SELECT
  o.name AS org_name,
  cn.organization_id,
  cn.customer_name,
  cn.customer_id,
  cn.id AS credit_note_id,
  cn.credit_note_number,
  s.sale_number,
  round((cn.credit_amount - cn.used_amount)::numeric, 2) AS amount,
  'pending'::text AS credit_status,
  'credit_note'::text AS refund_type,
  NULL::uuid AS linked_sale_id,
  'Backfilled 24 Sep 2026 — repair for orphaned exchange-excess credit note'::text AS notes,
  v.id AS issuance_voucher_id
FROM public.credit_notes cn
JOIN public.organizations o ON o.id = cn.organization_id
LEFT JOIN public.sales s
  ON s.id = cn.sale_id
 AND s.organization_id = cn.organization_id
LEFT JOIN LATERAL (
  SELECT ve.id
  FROM public.voucher_entries ve
  WHERE ve.organization_id = cn.organization_id
    AND ve.deleted_at IS NULL
    AND ve.voucher_type = 'credit_note'
    AND ve.reference_type = 'customer'
    AND ve.reference_id = cn.customer_id
    AND ve.description ILIKE '%' || cn.credit_note_number || '%'
  LIMIT 1
) v ON true
WHERE cn.deleted_at IS NULL
  AND cn.sale_id IS NOT NULL
  AND cn.status = 'active'
  AND cn.used_amount < cn.credit_amount
  AND NOT EXISTS (
    SELECT 1
    FROM public.sale_returns sr
    WHERE sr.credit_note_id = cn.id
      AND sr.deleted_at IS NULL
  )
ORDER BY o.name, cn.credit_note_number;
