-- Backfill legacy CN / sale-return cash refund vouchers to RF/YY-YY/N (per org, per financial year).
-- Matches app detection in src/utils/cnRefundVoucher.ts (Customer Ledger CN Refund tab).

CREATE OR REPLACE FUNCTION public._voucher_financial_year_label(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    SUBSTRING(
      CASE
        WHEN EXTRACT(MONTH FROM COALESCE(p_date, CURRENT_DATE)) >= 4
          THEN EXTRACT(YEAR FROM COALESCE(p_date, CURRENT_DATE))::integer
        ELSE EXTRACT(YEAR FROM COALESCE(p_date, CURRENT_DATE))::integer - 1
      END::text
      FROM 3 FOR 2
    )
    || '-'
    || SUBSTRING(
      CASE
        WHEN EXTRACT(MONTH FROM COALESCE(p_date, CURRENT_DATE)) >= 4
          THEN EXTRACT(YEAR FROM COALESCE(p_date, CURRENT_DATE))::integer + 1
        ELSE EXTRACT(YEAR FROM COALESCE(p_date, CURRENT_DATE))::integer
      END::text
      FROM 3 FOR 2
    );
$$;

CREATE OR REPLACE FUNCTION public._is_cn_refund_payment_voucher(
  p_voucher_type text,
  p_reference_type text,
  p_description text,
  p_payment_method text,
  p_voucher_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    lower(trim(COALESCE(p_voucher_type, ''))) = 'payment'
    AND lower(trim(COALESCE(p_reference_type, ''))) = 'customer'
    AND NOT lower(trim(COALESCE(p_description, ''))) LIKE '%overpayment refund%'
    AND (
      lower(trim(COALESCE(p_payment_method, ''))) = 'cn_refund'
      OR lower(trim(COALESCE(p_description, ''))) LIKE '%credit note refund%'
      OR lower(trim(COALESCE(p_description, ''))) LIKE '%refund paid for sale return%'
      OR upper(trim(COALESCE(p_voucher_number, ''))) LIKE 'CN-REFUND%'
      OR (
        upper(trim(COALESCE(p_voucher_number, ''))) LIKE 'PAY%'
        AND lower(trim(COALESCE(p_description, ''))) LIKE '%refund paid for sale return%'
      )
    );
$$;

COMMENT ON FUNCTION public._is_cn_refund_payment_voucher(text, text, text, text, text) IS
  'True for customer payment vouchers that pay CN / sale-return credit (not advance_refunds or overpayment refunds).';

-- Phase 1: move legacy numbers aside (avoids RF/FY/N collisions during reassignment).
UPDATE public.voucher_entries ve
SET voucher_number = 'RF-MIG-' || replace(ve.id::text, '-', '')
WHERE ve.deleted_at IS NULL
  AND public._is_cn_refund_payment_voucher(
    ve.voucher_type,
    ve.reference_type,
    ve.description,
    ve.payment_method,
    ve.voucher_number
  )
  AND ve.voucher_number !~ '^RF/[0-9]{2}-[0-9]{2}/[0-9]+$';

-- Phase 2: assign RF/YY-YY/N continuing from max existing RF in each org + FY.
WITH legacy AS (
  SELECT
    ve.id,
    ve.organization_id,
    public._voucher_financial_year_label(
      COALESCE(ve.voucher_date, (ve.created_at AT TIME ZONE 'UTC')::date)
    ) AS fy_label,
    ROW_NUMBER() OVER (
      PARTITION BY
        ve.organization_id,
        public._voucher_financial_year_label(
          COALESCE(ve.voucher_date, (ve.created_at AT TIME ZONE 'UTC')::date)
        )
      ORDER BY
        COALESCE(ve.voucher_date, (ve.created_at AT TIME ZONE 'UTC')::date) ASC,
        ve.created_at ASC NULLS LAST,
        ve.id ASC
    ) AS seq_in_fy
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND ve.voucher_number LIKE 'RF-MIG-%'
),
max_rf AS (
  SELECT
    ve.organization_id,
    substring(ve.voucher_number FROM '^RF/([0-9]{2}-[0-9]{2})/') AS fy_label,
    MAX(
      CAST(substring(ve.voucher_number FROM '^RF/[0-9]{2}-[0-9]{2}/([0-9]+)$') AS integer)
    ) AS max_seq
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND ve.voucher_number ~ '^RF/[0-9]{2}-[0-9]{2}/[0-9]+$'
  GROUP BY ve.organization_id, 2
)
UPDATE public.voucher_entries ve
SET voucher_number = 'RF/' || l.fy_label || '/' || (COALESCE(m.max_seq, 0) + l.seq_in_fy)::text
FROM legacy l
LEFT JOIN max_rf m
  ON m.organization_id = l.organization_id
 AND m.fy_label = l.fy_label
WHERE ve.id = l.id;
