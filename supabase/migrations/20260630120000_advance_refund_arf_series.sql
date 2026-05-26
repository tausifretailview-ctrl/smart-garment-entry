-- Advance booking refunds: ARF/YY-YY/N voucher series + link to voucher_entries.

ALTER TABLE public.advance_refunds
  ADD COLUMN IF NOT EXISTS refund_number text,
  ADD COLUMN IF NOT EXISTS voucher_entry_id uuid REFERENCES public.voucher_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_advance_refunds_voucher_entry_id
  ON public.advance_refunds(voucher_entry_id)
  WHERE voucher_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_advance_refunds_refund_number_org
  ON public.advance_refunds(organization_id, refund_number)
  WHERE refund_number IS NOT NULL;

COMMENT ON COLUMN public.advance_refunds.refund_number IS
  'FY series ARF/YY-YY/N from generate_voucher_number(advance_refund).';
COMMENT ON COLUMN public.advance_refunds.voucher_entry_id IS
  'Customer payment voucher (cash out) for this advance refund.';

CREATE OR REPLACE FUNCTION public.generate_voucher_number(p_type text, p_date date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_number TEXT;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  v_prefix := CASE p_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'receipt' THEN 'RCP'
    WHEN 'expense' THEN 'EXP'
    WHEN 'journal' THEN 'JV'
    WHEN 'contra' THEN 'CNT'
    WHEN 'cn_refund' THEN 'RF'
    WHEN 'advance_refund' THEN 'ARF'
    ELSE 'VCH'
  END;

  current_month := EXTRACT(MONTH FROM p_date);
  current_year := EXTRACT(YEAR FROM p_date);

  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;

  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  IF p_type IN ('cn_refund', 'advance_refund') THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)),
      0
    ) + 1
    INTO v_count
    FROM public.voucher_entries
    WHERE voucher_number LIKE v_prefix || '/' || financial_year || '/%'
      AND deleted_at IS NULL;
  ELSE
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)),
      0
    ) + 1
    INTO v_count
    FROM public.voucher_entries
    WHERE voucher_type = p_type
      AND voucher_number LIKE v_prefix || '/' || financial_year || '/%'
      AND deleted_at IS NULL;
  END IF;

  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$function$;

COMMENT ON FUNCTION public.generate_voucher_number(text, date) IS
  'FY voucher numbers: RCP, PAY, RF (cn_refund), ARF (advance_refund), etc.';
