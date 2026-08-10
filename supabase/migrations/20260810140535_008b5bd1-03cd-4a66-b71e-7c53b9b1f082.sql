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
  v_exists BOOLEAN;
  v_iter INTEGER := 0;
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

  PERFORM pg_advisory_xact_lock(hashtext('voucher:' || v_prefix || ':' || financial_year));

  -- NOTE: pattern is intentionally NOT anchored with $ so that split-receipt
  -- numbers (RCP/26-27/3665-1, -2, -OB) contribute their base number to the
  -- sequence. Anchoring made them invisible, so a base already used for a split
  -- receipt could be handed out again and collide with uq_voucher_entries_number_active.
  IF p_type IN ('cn_refund', 'advance_refund') THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)') AS INTEGER)),
      0
    ) + 1
    INTO v_count
    FROM public.voucher_entries
    WHERE voucher_number LIKE v_prefix || '/' || financial_year || '/%'
      AND deleted_at IS NULL
      AND voucher_number !~ '#d';
  ELSE
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)') AS INTEGER)),
      0
    ) + 1
    INTO v_count
    FROM public.voucher_entries
    WHERE voucher_type = p_type
      AND voucher_number LIKE v_prefix || '/' || financial_year || '/%'
      AND deleted_at IS NULL
      AND voucher_number !~ '#d';
  END IF;

  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 10000 THEN
      RAISE EXCEPTION 'generate_voucher_number exceeded 10000 iterations for %/%', v_prefix, financial_year;
    END IF;

    v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;

    -- Base is free only when neither the base nor any of its split variants exist.
    SELECT EXISTS(
      SELECT 1
      FROM public.voucher_entries
      WHERE deleted_at IS NULL
        AND (voucher_number = v_number OR voucher_number LIKE v_number || '-%')
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_number;
END;
$function$;

COMMENT ON FUNCTION public.generate_voucher_number(text, date) IS
  'FY voucher numbers (RCP/PAY/EXP/JV/CNT/RF/ARF). Global series (all orgs). Race-safe via pg_advisory_xact_lock(prefix:FY) + EXISTS loop that also reserves split suffixes (-1, -OB); unique index uq_voucher_entries_number_active.';