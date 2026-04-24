CREATE OR REPLACE FUNCTION public.apply_credit_note_to_sale(
  p_customer_id UUID,
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
  v_note RECORD;
  v_sale RECORD;
  v_remaining NUMERIC := p_apply_amount;
  v_applied_total NUMERIC := 0;
  v_notes_used TEXT[] := '{}';
  v_amount_from_note NUMERIC;
  v_new_used NUMERIC;
  v_voucher_number TEXT;
  v_last_num INTEGER;
BEGIN
  IF p_apply_amount IS NULL OR p_apply_amount <= 0 THEN
    RAISE EXCEPTION 'Apply amount must be positive';
  END IF;

  SELECT * INTO v_sale FROM sales
  WHERE id = p_sale_id AND organization_id = p_organization_id
    AND deleted_at IS NULL AND COALESCE(is_cancelled, false) = false
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;

  IF v_sale.customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Sale does not belong to this customer';
  END IF;

  FOR v_note IN
    SELECT * FROM credit_notes
    WHERE customer_id = p_customer_id
      AND organization_id = p_organization_id
      AND status IN ('active', 'partially_used')
      AND deleted_at IS NULL
    ORDER BY created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_amount_from_note := LEAST(v_remaining,
      v_note.credit_amount - COALESCE(v_note.used_amount, 0));

    IF v_amount_from_note <= 0 THEN CONTINUE; END IF;

    v_new_used := COALESCE(v_note.used_amount, 0) + v_amount_from_note;

    UPDATE credit_notes
    SET used_amount = v_new_used,
        status = CASE
          WHEN v_new_used >= v_note.credit_amount THEN 'fully_used'
          WHEN v_new_used > 0 THEN 'partially_used'
          ELSE 'active'
        END,
        updated_at = NOW()
    WHERE id = v_note.id;

    v_applied_total := v_applied_total + v_amount_from_note;
    v_remaining := v_remaining - v_amount_from_note;
    v_notes_used := array_append(v_notes_used, v_note.credit_note_number);
  END LOOP;

  IF v_applied_total <= 0 THEN
    RAISE EXCEPTION 'No credit available for this customer';
  END IF;

  SELECT COALESCE(MAX(CAST(regexp_replace(voucher_number, '^.*/(\d+)$', '\1') AS INTEGER)), 0)
  INTO v_last_num
  FROM voucher_entries
  WHERE organization_id = p_organization_id AND voucher_type = 'receipt'
    AND voucher_number ~ '^RCP/.*/\d+$';

  v_voucher_number := 'RCP/' ||
    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN to_char(CURRENT_DATE, 'YY') || '-' || to_char(CURRENT_DATE + INTERVAL '1 year', 'YY')
      ELSE to_char(CURRENT_DATE - INTERVAL '1 year', 'YY') || '-' || to_char(CURRENT_DATE, 'YY') END
    || '/' || (v_last_num + 1);

  INSERT INTO voucher_entries (
    organization_id, voucher_number, voucher_type, voucher_date,
    reference_type, reference_id, description, total_amount, payment_method
  ) VALUES (
    p_organization_id, v_voucher_number, 'receipt', CURRENT_DATE,
    'sale', p_sale_id,
    'CN Adjusted (₹' || v_applied_total || ') from ' || array_to_string(v_notes_used, ', ') || ' to ' || v_sale.sale_number,
    v_applied_total, 'credit_note_adjustment'
  );

  UPDATE sales
  SET paid_amount = COALESCE(paid_amount, 0) + v_applied_total,
      payment_status = CASE
        WHEN ABS(COALESCE(paid_amount, 0) + v_applied_total - net_amount) < 1 THEN 'completed'
        WHEN COALESCE(paid_amount, 0) + v_applied_total > 0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at = NOW()
  WHERE id = p_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'applied_amount', v_applied_total,
    'notes_used', v_notes_used,
    'voucher_number', v_voucher_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_credit_note_to_sale(UUID, UUID, NUMERIC, UUID) TO authenticated;