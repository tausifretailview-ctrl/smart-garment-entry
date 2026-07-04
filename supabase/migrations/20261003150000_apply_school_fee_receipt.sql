-- Atomic school fee receipt: student_fees + voucher + voucher_items + student_ledger in one transaction.

CREATE OR REPLACE FUNCTION public._school_fee_map_payment_method(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(COALESCE(p_raw, '')))
    WHEN 'upi' THEN 'upi'
    WHEN 'card' THEN 'card'
    WHEN 'bank transfer' THEN 'bank_transfer'
    ELSE 'cash'
  END;
$$;

CREATE OR REPLACE FUNCTION public._school_fee_get_or_create_cash_ledger(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.account_ledgers
  WHERE organization_id = p_org
    AND account_type = 'asset'
    AND account_name ILIKE '%cash%'
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.account_ledgers (
    organization_id, account_name, account_type, opening_balance, current_balance
  ) VALUES (
    p_org, 'Cash in Hand', 'asset', 0, 0
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._school_fee_get_or_create_default_income(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.account_ledgers
  WHERE organization_id = p_org
    AND account_type = 'income'
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.account_ledgers (
    organization_id, account_name, account_type, opening_balance, current_balance
  ) VALUES (
    p_org, 'School Fee Income', 'income', 0, 0
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._school_fee_get_debit_account(p_org uuid, p_mapped_method text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_mapped_method = 'cash' THEN
    SELECT id INTO v_id
    FROM public.account_ledgers
    WHERE organization_id = p_org
      AND account_type = 'asset'
      AND account_name ILIKE '%cash%'
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
    RETURN public._school_fee_get_or_create_cash_ledger(p_org);
  END IF;

  FOR v_id IN
    SELECT al.id
    FROM public.account_ledgers al
    WHERE al.organization_id = p_org
      AND al.account_type = 'asset'
      AND (
        al.account_name ILIKE '%bank%'
        OR al.account_name ILIKE '%upi%'
        OR al.account_name ILIKE '%card%'
        OR al.account_name ILIKE '%settlement%'
      )
    LIMIT 1
  LOOP
    RETURN v_id;
  END LOOP;

  RETURN public._school_fee_get_or_create_cash_ledger(p_org);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_school_fee_receipt(
  p_organization_id uuid,
  p_student_id uuid,
  p_academic_year_id uuid,
  p_receipt_number text,
  p_paid_at timestamptz,
  p_voucher_date date,
  p_payment_method text,
  p_transaction_id text,
  p_student_name text,
  p_admission_number text,
  p_grand_total numeric,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher_id uuid;
  v_mapped_method text;
  v_debit_account_id uuid;
  v_default_income_id uuid;
  v_line jsonb;
  v_pay numeric;
  v_income_id uuid;
  v_fee_head_id uuid;
  v_sum_lines numeric := 0;
  v_grand numeric;
  v_desc text;
  v_head_names text;
  v_credit record;
BEGIN
  PERFORM public.assert_org_member(p_organization_id);

  v_grand := round(COALESCE(p_grand_total, 0)::numeric, 2);
  IF v_grand <= 0 THEN
    RAISE EXCEPTION 'grand_total must be positive';
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one fee line is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = p_student_id
      AND s.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Student not found in organization';
  END IF;

  v_mapped_method := public._school_fee_map_payment_method(p_payment_method);
  v_default_income_id := public._school_fee_get_or_create_default_income(p_organization_id);
  v_debit_account_id := public._school_fee_get_debit_account(p_organization_id, v_mapped_method);

  CREATE TEMP TABLE _fee_credit_totals (
    account_id uuid PRIMARY KEY,
    amount numeric NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  -- 1) student_fees rows + accumulate income credits + validate line sum
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value)
  LOOP
    v_pay := round(COALESCE((v_line->>'paid_amount')::numeric, 0), 2);
    IF v_pay <= 0 THEN
      CONTINUE;
    END IF;

    v_sum_lines := v_sum_lines + v_pay;

    v_fee_head_id := NULL;
    IF COALESCE(v_line->>'fee_head_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_fee_head_id := (v_line->>'fee_head_id')::uuid;
    END IF;

    INSERT INTO public.student_fees (
      organization_id,
      student_id,
      fee_head_id,
      fee_structure_id,
      academic_year_id,
      amount,
      paid_amount,
      paid_date,
      payment_method,
      transaction_id,
      payment_receipt_id,
      status,
      notes
    ) VALUES (
      p_organization_id,
      p_student_id,
      v_fee_head_id,
      CASE
        WHEN COALESCE(v_line->>'fee_structure_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (v_line->>'fee_structure_id')::uuid
        ELSE NULL
      END,
      p_academic_year_id,
      COALESCE((v_line->>'amount')::numeric, v_pay),
      v_pay,
      COALESCE(p_voucher_date, (p_paid_at AT TIME ZONE 'Asia/Kolkata')::date),
      p_payment_method,
      NULLIF(trim(COALESCE(p_transaction_id, '')), ''),
      p_receipt_number,
      COALESCE(NULLIF(trim(v_line->>'status'), ''), 'paid'),
      NULLIF(trim(COALESCE(v_line->>'notes', '')), '')
    );

    v_income_id := v_default_income_id;
    IF v_fee_head_id IS NOT NULL THEN
      SELECT COALESCE(fh.income_account_id, v_default_income_id)
      INTO v_income_id
      FROM public.fee_heads fh
      WHERE fh.id = v_fee_head_id
        AND fh.organization_id = p_organization_id;
    END IF;

    INSERT INTO _fee_credit_totals (account_id, amount)
    VALUES (v_income_id, v_pay)
    ON CONFLICT (account_id) DO UPDATE
      SET amount = round(_fee_credit_totals.amount + EXCLUDED.amount, 2);
  END LOOP;

  IF v_sum_lines <= 0 THEN
    RAISE EXCEPTION 'No positive fee lines to collect';
  END IF;

  IF abs(v_sum_lines - v_grand) > 0.02 THEN
    RAISE EXCEPTION 'Fee receipt lines (%) do not match total (%)', v_sum_lines, v_grand;
  END IF;

  SELECT string_agg(COALESCE(l->>'head_name', 'Fee'), ', ' ORDER BY ord)
  INTO v_head_names
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(l, ord)
  WHERE COALESCE((l->>'paid_amount')::numeric, 0) > 0;

  v_desc := format(
    'Fee Collection - %s (%s) | %s | %s%s',
    COALESCE(p_student_name, ''),
    COALESCE(p_admission_number, ''),
    COALESCE(v_head_names, ''),
    COALESCE(p_payment_method, ''),
    CASE
      WHEN NULLIF(trim(COALESCE(p_transaction_id, '')), '') IS NOT NULL
        THEN ' | Txn: ' || trim(p_transaction_id)
      ELSE ''
    END
  );

  -- 2) voucher header
  INSERT INTO public.voucher_entries (
    organization_id,
    voucher_type,
    voucher_number,
    voucher_date,
    total_amount,
    description,
    reference_type,
    reference_id,
    payment_method
  ) VALUES (
    p_organization_id,
    'receipt',
    p_receipt_number,
    p_voucher_date,
    v_grand,
    v_desc,
    'student_fee',
    p_student_id,
    v_mapped_method
  )
  RETURNING id INTO v_voucher_id;

  -- 3) voucher_items — Dr cash/bank, Cr income per head/default
  INSERT INTO public.voucher_items (
    voucher_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_voucher_id,
    v_debit_account_id,
    v_grand,
    0,
    format('Fee receipt %s — %s', p_receipt_number, v_mapped_method)
  );

  FOR v_credit IN SELECT account_id, amount FROM _fee_credit_totals WHERE amount > 0
  LOOP
    INSERT INTO public.voucher_items (
      voucher_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES (
      v_voucher_id,
      v_credit.account_id,
      0,
      round(v_credit.amount, 2),
      format('Fee income — %s', p_receipt_number)
    );
  END LOOP;

  -- 4) student_ledger_entries — one credit per line
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) AS t(value)
  LOOP
    v_pay := round(COALESCE((v_line->>'paid_amount')::numeric, 0), 2);
    IF v_pay <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.student_ledger_entries (
      organization_id,
      student_id,
      voucher_type,
      voucher_no,
      particulars,
      transaction_date,
      debit,
      credit,
      created_by
    ) VALUES (
      p_organization_id,
      p_student_id,
      'FEE_RECEIPT',
      p_receipt_number,
      COALESCE(v_line->>'head_name', 'Fee') || ' — receipt',
      p_voucher_date,
      0,
      v_pay,
      auth.uid()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'voucher_id', v_voucher_id,
    'receipt_number', p_receipt_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_school_fee_receipt(
  uuid, uuid, uuid, text, timestamptz, date, text, text, text, text, numeric, jsonb
) TO authenticated;
