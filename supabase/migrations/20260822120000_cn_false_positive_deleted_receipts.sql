-- Detect credit_note_adjustment receipts soft-deleted by automated repair batches
-- where the linked invoice never received sale_return_adjust (false-positive deletions).
--
-- Pattern: cn_over_apply_repair_20260606 and similar scripts removed CN-adjust receipts
-- assuming billing-time absorption, but sales.sale_return_adjust = 0 proves nothing was
-- absorbed — restoring the receipt (or re-applying via adjust_invoice_balance) is required.
--
-- Example: ELLA NOOR Hanif bhai — RCP/26-27/330 deleted while INV/26-27/287 stayed
-- pending at ₹3,200 with sale_return_adjust = 0.

CREATE OR REPLACE VIEW public.cn_false_positive_deleted_receipts
WITH (security_invoker = true) AS
SELECT
  ve.id                    AS voucher_id,
  ve.voucher_number,
  ve.organization_id,
  ve.reference_id          AS sale_id,
  s.sale_number,
  s.customer_id,
  c.customer_name,
  ve.total_amount          AS cn_amount,
  COALESCE(s.sale_return_adjust, 0) AS invoice_sra,
  COALESCE(s.paid_amount, 0)      AS invoice_paid,
  COALESCE(s.net_amount, 0)
    - COALESCE(s.paid_amount, 0)
    - COALESCE(s.sale_return_adjust, 0) AS invoice_outstanding,
  ve.deleted_at,
  ve.notes,
  ve.description,
  sr.id                    AS sale_return_id,
  sr.return_number,
  COALESCE(sr.net_amount, 0) AS return_net,
  COALESCE(sr.credit_available_balance, sr.net_amount, 0) AS return_cab
FROM public.voucher_entries ve
INNER JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN public.customers c
  ON c.id = s.customer_id
 AND c.organization_id = ve.organization_id
LEFT JOIN public.sale_returns sr
  ON sr.linked_sale_id = s.id
 AND sr.organization_id = ve.organization_id
 AND sr.deleted_at IS NULL
 AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
WHERE ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.deleted_at IS NOT NULL
  AND COALESCE(s.sale_return_adjust, 0) < 0.5
  AND (
    COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
    OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
    OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
    OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
  );

COMMENT ON VIEW public.cn_false_positive_deleted_receipts IS
  'Deleted CN-adjust receipts whose linked invoice has sale_return_adjust = 0 — likely '
  'false-positive removals from automated repair batches. Do NOT restore via Recycle Bin '
  'without also setting sales.sale_return_adjust; use scripts/ella-noor-cn-false-positive-restore.sql.';

GRANT SELECT ON public.cn_false_positive_deleted_receipts TO authenticated;

-- Per-org digest for Customer Audit / platform integrity alerts.
CREATE OR REPLACE FUNCTION public.get_cn_false_positive_digest(p_organization_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH rows AS (
    SELECT *
    FROM public.cn_false_positive_deleted_receipts v
    WHERE p_organization_id IS NULL OR v.organization_id = p_organization_id
  ),
  agg AS (
    SELECT
      COUNT(*)::int AS row_count,
      COALESCE(SUM(cn_amount), 0)::numeric AS total_cn_amount
    FROM rows
  ),
  top AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'voucher_number', voucher_number,
        'customer_name', customer_name,
        'sale_number', sale_number,
        'cn_amount', cn_amount,
        'invoice_outstanding', invoice_outstanding,
        'return_number', return_number,
        'deleted_at', deleted_at
      )
      ORDER BY cn_amount DESC
    ) AS items
    FROM (SELECT * FROM rows ORDER BY cn_amount DESC LIMIT 15) t
  )
  SELECT jsonb_build_object(
    'row_count', (SELECT row_count FROM agg),
    'total_cn_amount', (SELECT total_cn_amount FROM agg),
    'top_rows', COALESCE((SELECT items FROM top), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_cn_false_positive_digest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cn_false_positive_digest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cn_false_positive_digest(uuid) TO service_role;
