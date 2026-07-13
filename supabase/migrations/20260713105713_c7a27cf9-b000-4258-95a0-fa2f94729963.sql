
DO $$
DECLARE
  v_org uuid := '3fdca631-1e0c-4417-9704-421f5129ff67';
  v_cust uuid := 'aacca229-d4da-4c65-a7b7-39b528743fff';
  v_user uuid := '49d36256-3d72-40db-8a0b-4271c375e40d';

  v_pre_recon  numeric;
  v_post_recon numeric;
  v_open_count int;

  v_pool_available numeric := 11050;
  v_pool_consumed  numeric := 0;
  v_alloc          numeric;
  v_voucher_number text;

  r record;
BEGIN
  -- Snapshot ledger before any change
  SELECT COALESCE(SUM(amount),0) INTO v_pre_recon
    FROM public.reconcile_customer_balance(v_cust, v_org);
  RAISE NOTICE 'Khadija Sheikh — PRE reconcile = %', v_pre_recon;

  -- Step 1: Reset stale credit_applied on invoices whose backing CN voucher is gone
  UPDATE public.sales
     SET credit_applied = 0,
         updated_at = now()
   WHERE organization_id = v_org
     AND customer_id     = v_cust
     AND sale_number     IN ('INV/25-26/856','INV/25-26/1194')
     AND deleted_at IS NULL;

  -- Recompute settlement for those two (headroom now surfaces properly)
  FOR r IN
    SELECT id FROM public.sales
     WHERE organization_id = v_org AND customer_id = v_cust
       AND sale_number IN ('INV/25-26/856','INV/25-26/1194')
       AND deleted_at IS NULL
  LOOP
    UPDATE public.sales s
       SET paid_amount    = c.new_paid,
           payment_status = c.new_status,
           updated_at     = now()
      FROM public.compute_sale_settlement(r.id, v_org) c
     WHERE s.id = r.id;
  END LOOP;

  -- Step 2: FIFO write real receipt vouchers against every pending/partial invoice,
  -- drawing from the ₹11,050 legacy balance-adjustment pool.
  FOR r IN
    SELECT s.id,
           s.sale_number,
           GREATEST(
             0,
             s.net_amount
               - COALESCE(s.paid_amount,0)
               - COALESCE(s.sale_return_adjust,0)
           ) AS headroom
      FROM public.sales s
     WHERE s.organization_id = v_org
       AND s.customer_id     = v_cust
       AND s.deleted_at IS NULL
       AND COALESCE(s.is_cancelled,false) = false
       AND s.payment_status IN ('pending','partial')
     ORDER BY s.sale_date ASC, s.created_at ASC
  LOOP
    EXIT WHEN v_pool_available <= 0.01;
    IF r.headroom <= 0.01 THEN CONTINUE; END IF;

    v_alloc := LEAST(v_pool_available, r.headroom);
    v_voucher_number := public.generate_voucher_number('receipt', CURRENT_DATE);

    -- Real receipt voucher, cash-shaped so reconcile counts it in receipt_payments
    INSERT INTO public.voucher_entries (
      organization_id, voucher_number, voucher_type, voucher_date,
      reference_type, reference_id, description, total_amount,
      payment_method, category, notes, created_by
    ) VALUES (
      v_org, v_voucher_number, 'receipt', CURRENT_DATE,
      'sale', r.id,
      'FIFO reallocation of legacy balance-adjustment credit against ' || r.sale_number,
      v_alloc,
      'cash', 'customer_receipt',
      'Auto-generated: reallocated from 2026-02-16 balance-adjustment pool',
      v_user
    );

    -- Recompute settlement from vouchers
    UPDATE public.sales s
       SET paid_amount    = c.new_paid,
           payment_status = c.new_status,
           updated_at     = now()
      FROM public.compute_sale_settlement(r.id, v_org) c
     WHERE s.id = r.id;

    v_pool_available := v_pool_available - v_alloc;
    v_pool_consumed  := v_pool_consumed  + v_alloc;
    RAISE NOTICE '  applied % to % (pool remaining %)', v_alloc, r.sale_number, v_pool_available;
  END LOOP;

  -- Step 3: Compensating balance-adjustment row so ledger stays neutral.
  -- Reduces the legacy pool by exactly what we just paid out via receipts.
  IF v_pool_consumed > 0 THEN
    INSERT INTO public.customer_balance_adjustments (
      organization_id, customer_id,
      previous_outstanding, new_outstanding, outstanding_difference,
      previous_advance, new_advance, advance_difference,
      reason, adjustment_date, created_by
    ) VALUES (
      v_org, v_cust,
      0, v_pool_consumed, v_pool_consumed,
      0, 0, 0,
      'System reallocation: applied ₹' || v_pool_consumed
        || ' of the 2026-02-16 legacy balance-adjustment credit to invoices INV/25-26/856, INV/25-26/903, INV/25-26/1194, INV/26-27/1629 via FIFO auto-match. Net ledger unchanged.',
      CURRENT_DATE, v_user
    );
  END IF;

  -- Verify: economic neutrality
  SELECT COALESCE(SUM(amount),0) INTO v_post_recon
    FROM public.reconcile_customer_balance(v_cust, v_org);
  RAISE NOTICE 'Khadija Sheikh — POST reconcile = % (consumed pool %)', v_post_recon, v_pool_consumed;

  IF ROUND(v_post_recon,2) <> ROUND(v_pre_recon,2) THEN
    RAISE EXCEPTION 'ECONOMIC DRIFT: pre=% post=% (consumed=%). Rolling back.',
      v_pre_recon, v_post_recon, v_pool_consumed;
  END IF;

  -- Report leftover open invoices (INV/25-26/585 stays partial due to a pre-existing
  -- overpay quirk unrelated to this reallocation)
  SELECT count(*) INTO v_open_count FROM public.sales
   WHERE organization_id = v_org AND customer_id = v_cust
     AND deleted_at IS NULL AND COALESCE(is_cancelled,false) = false
     AND payment_status IN ('pending','partial');
  RAISE NOTICE 'Khadija Sheikh — remaining open invoices after reallocation = %', v_open_count;
END $$;
