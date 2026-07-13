
DO $$
DECLARE
  v_org uuid := '3fdca631-1e0c-4417-9704-421f5129ff67';
  v_cust uuid := 'aacca229-d4da-4c65-a7b7-39b528743fff';
  v_user uuid := '49d36256-3d72-40db-8a0b-4271c375e40d';

  v_pre  numeric;
  v_post numeric;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_pre
    FROM public.reconcile_customer_balance(v_cust, v_org);
  RAISE NOTICE 'Rollback PRE reconcile = %', v_pre;

  -- 1) Soft-delete the 4 receipts I just wrote today
  UPDATE public.voucher_entries
     SET deleted_at = now(),
         deleted_by = v_user
   WHERE organization_id = v_org
     AND voucher_type = 'receipt'
     AND payment_method = 'cash'
     AND description LIKE 'FIFO reallocation of legacy balance-adjustment credit against %'
     AND deleted_at IS NULL
     AND voucher_number IN ('RCP/26-27/2802','RCP/26-27/2803','RCP/26-27/2804','RCP/26-27/2805','RCP/26-27/2806','RCP/26-27/2807');

  -- Belt & braces: also target by created_at just today for this org+customer via sale linkage
  UPDATE public.voucher_entries ve
     SET deleted_at = now(),
         deleted_by = v_user
    FROM public.sales s
   WHERE ve.reference_id = s.id
     AND s.customer_id = v_cust
     AND s.organization_id = v_org
     AND ve.organization_id = v_org
     AND ve.voucher_type = 'receipt'
     AND ve.payment_method = 'cash'
     AND ve.reference_type = 'sale'
     AND ve.description LIKE 'FIFO reallocation of legacy balance-adjustment credit against %'
     AND ve.deleted_at IS NULL;

  -- 2) Delete the compensating balance-adjustment row
  DELETE FROM public.customer_balance_adjustments
   WHERE organization_id = v_org
     AND customer_id     = v_cust
     AND reason LIKE 'System reallocation:%'
     AND adjustment_date = CURRENT_DATE;

  -- 3) Restore original per-invoice fields (pre-migration snapshot)
  UPDATE public.sales
     SET credit_applied = 650,
         paid_amount    = 4400,
         payment_status = 'partial',
         updated_at     = now()
   WHERE organization_id = v_org
     AND customer_id     = v_cust
     AND sale_number     = 'INV/25-26/856'
     AND deleted_at IS NULL;

  UPDATE public.sales
     SET credit_applied = 100,
         paid_amount    = 10100,
         payment_status = 'partial',
         updated_at     = now()
   WHERE organization_id = v_org
     AND customer_id     = v_cust
     AND sale_number     = 'INV/25-26/1194'
     AND deleted_at IS NULL;

  -- INV 903 (was pending 4500, untouched by my writes to paid_amount)
  UPDATE public.sales
     SET paid_amount    = 0,
         payment_status = 'pending',
         updated_at     = now()
   WHERE organization_id = v_org
     AND customer_id     = v_cust
     AND sale_number     = 'INV/25-26/903'
     AND deleted_at IS NULL;

  -- INV 1629 (was 2600/3800 partial)
  UPDATE public.sales
     SET paid_amount    = 2600,
         payment_status = 'partial',
         updated_at     = now()
   WHERE organization_id = v_org
     AND customer_id     = v_cust
     AND sale_number     = 'INV/26-27/1629'
     AND deleted_at IS NULL;

  SELECT COALESCE(SUM(amount),0) INTO v_post
    FROM public.reconcile_customer_balance(v_cust, v_org);
  RAISE NOTICE 'Rollback POST reconcile = %', v_post;

  IF ROUND(v_post,2) <> ROUND(v_pre,2) THEN
    RAISE EXCEPTION 'Rollback drift: pre=% post=%', v_pre, v_post;
  END IF;
END $$;
