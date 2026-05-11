
DO $$
DECLARE
  v_org uuid := '4bc73037-e877-4123-9261-eb6e3876698c';
  v_inv314 uuid := 'c8d5043d-ed13-434f-8439-ca16daec7bd2';
  v_new_paid numeric;
  v_net numeric;
  v_sr_adjust numeric;
  v_new_status text;
BEGIN
  -- Soft-delete the two problematic receipts (org-scoped, IF EXISTS guarded)
  UPDATE voucher_entries
     SET deleted_at = now()
   WHERE organization_id = v_org
     AND voucher_number IN ('RCP/25-26/40', 'RCP/26-27/139')
     AND deleted_at IS NULL;

  -- Recompute INV/25-26/314 paid_amount from non-deleted receipts
  SELECT COALESCE(SUM(total_amount), 0)
    INTO v_new_paid
    FROM voucher_entries
   WHERE organization_id = v_org
     AND voucher_type = 'receipt'
     AND reference_id = v_inv314
     AND deleted_at IS NULL;

  SELECT net_amount, COALESCE(sale_return_adjust, 0)
    INTO v_net, v_sr_adjust
    FROM sales
   WHERE id = v_inv314 AND organization_id = v_org;

  IF v_net IS NOT NULL THEN
    v_new_status := CASE
      WHEN v_new_paid + v_sr_adjust >= v_net - 0.5 THEN 'completed'
      WHEN v_new_paid > 0 OR v_sr_adjust > 0 THEN 'partial'
      ELSE 'pending'
    END;

    UPDATE sales
       SET paid_amount = v_new_paid,
           payment_status = v_new_status
     WHERE id = v_inv314
       AND organization_id = v_org;
  END IF;
END $$;
