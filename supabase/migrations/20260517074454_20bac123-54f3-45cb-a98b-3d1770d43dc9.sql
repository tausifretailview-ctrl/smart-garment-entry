DO $$
DECLARE
  v_org uuid;
  v_cust uuid;
  v_sale uuid := '43a44550-8215-43b4-8eb7-a59e5504ab32';
  v_outstanding numeric;
  v_apply numeric;
  v_res jsonb;
BEGIN
  SELECT organization_id, customer_id,
         GREATEST(0, COALESCE(net_amount,0) - COALESCE(paid_amount,0) - COALESCE(credit_note_amount,0) - COALESCE(sale_return_adjust,0))
    INTO v_org, v_cust, v_outstanding
  FROM sales WHERE id = v_sale;

  v_apply := LEAST(6400, v_outstanding);

  IF v_apply > 0 AND v_cust IS NOT NULL THEN
    SELECT public.apply_credit_note_to_sale(v_cust, v_sale, v_apply, v_org) INTO v_res;

    UPDATE sale_returns
       SET credit_status = CASE WHEN (v_res->>'applied_amount')::numeric >= 6400 - 0.01
                                THEN 'adjusted' ELSE 'adjusted_outstanding' END,
           linked_sale_id = v_sale
     WHERE return_number = 'SR/26-27/29'
       AND credit_note_id = '4a20e317-c3d6-47b9-93d8-b9c091a9b5a5';
  END IF;
END $$;