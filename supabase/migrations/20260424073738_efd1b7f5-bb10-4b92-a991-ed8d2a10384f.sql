CREATE OR REPLACE FUNCTION public.apply_customer_advance_to_sale(
  p_advance_id UUID,
  p_sale_id UUID,
  p_apply_amount NUMERIC,
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_advance RECORD;
  v_sale RECORD;
  v_available NUMERIC;
  v_new_used NUMERIC;
  v_new_paid NUMERIC;
  v_new_status TEXT;
  v_voucher_number TEXT;
  v_voucher_id UUID;
  v_last_num INTEGER;
  v_fy_start TEXT;
  v_fy_end TEXT;
BEGIN
  IF p_apply_amount IS NULL OR p_apply_amount <= 0 THEN
    RAISE EXCEPTION 'Apply amount must be greater than zero';
  END IF;

  SELECT * INTO v_advance
  FROM customer_advances
  WHERE id = p_advance_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Advance not found or belongs to different organization';
  END IF;

  v_available := v_advance.amount - COALESCE(v_advance.used_amount, 0);
  IF v_available < p_apply_amount THEN
    RAISE EXCEPTION 'Insufficient advance. Available: %, Requested: %',
      v_available, p_apply_amount;
  END IF;

  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found, deleted, or cancelled';
  END IF;

  IF v_sale.customer_id IS DISTINCT FROM v_advance.customer_id THEN
    RAISE EXCEPTION 'Advance and sale belong to different customers';
  END IF;

  IF (COALESCE(v_sale.paid_amount, 0) + p_apply_amount) > v_sale.net_amount + 1 THEN
    RAISE EXCEPTION 'Overpayment blocked. Sale net: %, already paid: %, requested: %',
      v_sale.net_amount, COALESCE(v_sale.paid_amount, 0), p_apply_amount;
  END IF;

  v_new_used := COALESCE(v_advance.used_amount, 0) + p_apply_amount;
  UPDATE customer_advances
  SET used_amount = v_new_used,
      status = CASE
        WHEN v_new_used >= v_advance.amount THEN 'fully_used'
        WHEN v_new_used > 0 THEN 'partially_used'
        ELSE 'active'
      END
  WHERE id = p_advance_id;

  v_new_paid := COALESCE(v_sale.paid_amount, 0) + p_apply_amount;
  v_new_status := CASE
    WHEN ABS(v_new_paid - v_sale.net_amount) < 1 THEN 'completed'
    WHEN v_new_paid > 0 THEN 'partial'
    ELSE 'pending'
  END;

  UPDATE sales
  SET paid_amount = v_new_paid,
      payment_status = v_new_status,
      updated_at = NOW()
  WHERE id = p_sale_id;

  BEGIN
    INSERT INTO advance_applications (
      advance_id, sale_id, amount_applied, organization_id, applied_at
    ) VALUES (
      p_advance_id, p_sale_id, p_apply_amount, p_organization_id, NOW()
    );
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
  END;

  v_fy_start := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN to_char(CURRENT_DATE, 'YY')
    ELSE to_char(CURRENT_DATE - INTERVAL '1 year', 'YY')
  END;
  v_fy_end := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
    THEN to_char(CURRENT_DATE + INTERVAL '1 year', 'YY')
    ELSE to_char(CURRENT_DATE, 'YY')
  END;

  SELECT COALESCE(MAX(CAST(regexp_replace(voucher_number, '^.*/(\d+)$', '\1') AS INTEGER)), 0)
  INTO v_last_num
  FROM voucher_entries
  WHERE organization_id = p_organization_id
    AND voucher_type = 'receipt'
    AND voucher_number LIKE 'RCP/' || v_fy_start || '-' || v_fy_end || '/%'
    AND voucher_number ~ '/\d+$';

  v_voucher_number := 'RCP/' || v_fy_start || '-' || v_fy_end || '/' || (v_last_num + 1);

  INSERT INTO voucher_entries (
    organization_id, voucher_number, voucher_type, voucher_date,
    reference_type, reference_id, description, total_amount, payment_method
  ) VALUES (
    p_organization_id, v_voucher_number, 'receipt', CURRENT_DATE,
    'sale', p_sale_id,
    'Advance Applied (₹' || p_apply_amount || ') to ' || v_sale.sale_number,
    p_apply_amount, 'advance_adjustment'
  ) RETURNING id INTO v_voucher_id;

  RETURN jsonb_build_object(
    'success', true,
    'advance_remaining', v_advance.amount - v_new_used,
    'advance_new_used', v_new_used,
    'advance_new_status', CASE
      WHEN v_new_used >= v_advance.amount THEN 'fully_used'
      WHEN v_new_used > 0 THEN 'partially_used'
      ELSE 'active'
    END,
    'sale_new_paid', v_new_paid,
    'sale_new_status', v_new_status,
    'voucher_number', v_voucher_number,
    'voucher_id', v_voucher_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_customer_advance_to_sale(UUID, UUID, NUMERIC, UUID) TO authenticated;