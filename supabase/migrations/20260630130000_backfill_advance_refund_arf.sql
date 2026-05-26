-- Backfill advance_refunds: ARF numbers + payment vouchers for rows created before ARF series.

CREATE OR REPLACE FUNCTION public._is_advance_refund_payment_voucher(
  p_voucher_type text,
  p_reference_type text,
  p_description text,
  p_voucher_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    lower(trim(COALESCE(p_voucher_type, ''))) = 'payment'
    AND lower(trim(COALESCE(p_reference_type, ''))) = 'customer'
    AND (
      upper(trim(COALESCE(p_voucher_number, ''))) LIKE 'ARF/%'
      OR (
        lower(trim(COALESCE(p_description, ''))) LIKE '%advance refund%'
        AND lower(trim(COALESCE(p_description, ''))) NOT LIKE '%credit note%'
      )
    );
$$;

-- Link existing ARF vouchers to advance_refunds by amount + date + customer (best-effort).
UPDATE public.advance_refunds ar
SET
  voucher_entry_id = ve.id,
  refund_number = COALESCE(ar.refund_number, ve.voucher_number)
FROM public.customer_advances ca
JOIN public.voucher_entries ve
  ON ve.organization_id = ar.organization_id
  AND ve.reference_type = 'customer'
  AND ve.reference_id = ca.customer_id
  AND ve.voucher_date = ar.refund_date
  AND ve.deleted_at IS NULL
  AND public._is_advance_refund_payment_voucher(
    ve.voucher_type, ve.reference_type, ve.description, ve.voucher_number
  )
  AND round(COALESCE(ve.total_amount, 0)::numeric, 2) = round(ar.refund_amount::numeric, 2)
WHERE ar.advance_id = ca.id
  AND ar.voucher_entry_id IS NULL
  AND ar.refund_number IS NULL;

-- Assign ARF/YY-YY/N to rows still missing refund_number (no voucher yet).
WITH numbered AS (
  SELECT
    ar.id,
    ar.organization_id,
    ar.refund_date,
    public._voucher_financial_year_label(ar.refund_date) AS fy_label,
    row_number() OVER (
      PARTITION BY ar.organization_id, public._voucher_financial_year_label(ar.refund_date)
      ORDER BY ar.refund_date, ar.created_at NULLS LAST, ar.id
    ) AS seq_in_fy
  FROM public.advance_refunds ar
  WHERE ar.refund_number IS NULL
),
max_existing AS (
  SELECT
    ve.organization_id,
    substring(ve.voucher_number FROM '^ARF/([0-9]{2}-[0-9]{2})/') AS fy_label,
    COALESCE(
      MAX(CAST(substring(ve.voucher_number FROM '^ARF/[0-9]{2}-[0-9]{2}/([0-9]+)$') AS integer)),
      0
    ) AS max_seq
  FROM public.voucher_entries ve
  WHERE ve.voucher_number ~ '^ARF/[0-9]{2}-[0-9]{2}/[0-9]+$'
    AND ve.deleted_at IS NULL
  GROUP BY ve.organization_id, substring(ve.voucher_number FROM '^ARF/([0-9]{2}-[0-9]{2})/')
)
UPDATE public.advance_refunds ar
SET refund_number = 'ARF/' || n.fy_label || '/' || (COALESCE(m.max_seq, 0) + n.seq_in_fy)::text
FROM numbered n
LEFT JOIN max_existing m
  ON m.organization_id = n.organization_id AND m.fy_label = n.fy_label
WHERE ar.id = n.id;

-- Create missing payment vouchers for backfilled refund_numbers.
INSERT INTO public.voucher_entries (
  organization_id,
  voucher_type,
  voucher_number,
  voucher_date,
  reference_type,
  reference_id,
  total_amount,
  payment_method,
  description,
  created_by
)
SELECT
  ar.organization_id,
  'payment',
  ar.refund_number,
  ar.refund_date,
  'customer',
  ca.customer_id,
  ar.refund_amount,
  COALESCE(ar.payment_method, 'cash'),
  COALESCE(
    NULLIF(trim(ar.reason), ''),
    'Advance refund (backfill) — ' || COALESCE(ca.advance_number, ar.id::text)
  ),
  ar.created_by
FROM public.advance_refunds ar
JOIN public.customer_advances ca ON ca.id = ar.advance_id
WHERE ar.voucher_entry_id IS NULL
  AND ar.refund_number IS NOT NULL
  AND ca.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.voucher_entries ve
    WHERE ve.organization_id = ar.organization_id
      AND ve.voucher_number = ar.refund_number
      AND ve.deleted_at IS NULL
  );

UPDATE public.advance_refunds ar
SET voucher_entry_id = ve.id
FROM public.customer_advances ca,
  public.voucher_entries ve
WHERE ar.advance_id = ca.id
  AND ar.voucher_entry_id IS NULL
  AND ar.refund_number IS NOT NULL
  AND ve.organization_id = ar.organization_id
  AND ve.voucher_number = ar.refund_number
  AND ve.deleted_at IS NULL;
