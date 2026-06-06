
-- =========================================================================
-- ELLA NOOR CN over-apply repair — single migration, scoped to org only.
-- =========================================================================
DO $$
DECLARE
  v_org uuid := '3fdca631-1e0c-4417-9704-421f5129ff67';
  v_voucher_ids uuid[] := ARRAY[
    -- 28 REVERSE_NO_SOURCE
    '304b4ad1-c856-41c9-953a-e3264bea19b6',
    '4f4224fa-ed2c-40bb-902c-c2dbe7d32b3f',
    '4825c4ce-ec2c-42e6-9b50-83cbb40167a7',
    'd2f11a7b-8b47-4156-9a78-0c7f5e9499e0',
    'b7ed786f-7bb6-4a4f-984e-95ff1513dad6',
    '16c75d74-a428-4192-82b7-62aabddfd79f',
    'db48cf07-af4b-4dc2-804d-fe321eeab7cb',
    '27d4fac1-9320-4145-951f-76457320c46b',
    '47e10ab4-a822-4ff9-bfaf-0156c239a592',
    '9e95f83e-1226-4022-bf6f-936fe2d18c01',
    '66df3c8e-d1c9-4e58-ad2b-9d7f3d99c5d1',
    '2f56ede1-c6be-4a7f-97d6-8b0154681756',
    'cd7a6566-1b2c-47ad-9688-1d3f658bd92b',
    'e93af5f1-9fc6-4177-bd58-729123edd47a',
    '149e398c-9ced-421c-83de-59e4a196bc4c',
    'd0e0be7a-6829-459d-893b-f0ab3faafd45',
    '5b6e4e29-d3fb-4ff3-a8ca-682c02f9a3c2',
    '75bdeb2e-0b56-4fc4-a2a8-31baca083753',
    '88456392-d66b-42fc-996b-5fe9a4bea453',
    '1ae111d3-811f-4afb-b218-f9e9a9a6278f',
    'b956d4c2-ff7a-4143-a809-f9bdca0e46b2',
    '404e1839-7d9d-43db-9281-320c11eb42aa',
    '45776713-c85e-4f11-a564-f4148e8a5540',
    '053be273-9f2f-426e-9c80-e8f6c8d0b60b',
    '14e4f05c-d14d-41fc-a9a3-50f8a76954a5',
    '31496db7-b32a-45a6-8d41-1cbe8ba9d395',
    'e6848d88-9f03-4e8e-a297-46a59b78f830',
    '6f98f5a8-2666-4faf-9985-12c78ef6ec2c',
    -- + Sharmin Mewara RCP-00714 (REVIEW_MIXED option A)
    '0aef31d3-aa50-431e-862f-0df401d29434'
  ];
  v_sr_ids uuid[] := ARRAY[
    'b27a2315-ad51-4483-9b17-f4ad9a085604', -- SR/36 Shumama
    '5007a78b-6292-496f-a66c-ec42173df0c2', -- SR/37 Shumama
    '12329454-abf9-462e-8974-cbba236c0ad4', -- SR/41 Shumama
    'd96db19d-03ef-4866-a721-1c99c239a3a0', -- SR/35 FAIZA
    '80dae4ba-44c6-4530-8f94-868fbae5687f'  -- SR/64 Parina
  ];
BEGIN
  -- 1. SNAPSHOT  ---------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.ella_noor_cn_repair_20260606_snapshot (
    snapshot_kind text,
    row_id uuid,
    payload jsonb,
    captured_at timestamptz NOT NULL DEFAULT now()
  );
  GRANT SELECT ON public.ella_noor_cn_repair_20260606_snapshot TO service_role;

  INSERT INTO public.ella_noor_cn_repair_20260606_snapshot(snapshot_kind, row_id, payload)
  SELECT 'voucher_entry', ve.id, to_jsonb(ve)
  FROM public.voucher_entries ve
  WHERE ve.id = ANY(v_voucher_ids)
    AND ve.organization_id = v_org;

  INSERT INTO public.ella_noor_cn_repair_20260606_snapshot(snapshot_kind, row_id, payload)
  SELECT 'sale_state', s.id,
         jsonb_build_object('sale_number', s.sale_number,
                            'net_amount', s.net_amount,
                            'paid_amount', s.paid_amount,
                            'payment_status', s.payment_status,
                            'sale_return_adjust', s.sale_return_adjust,
                            'customer_id', s.customer_id)
  FROM public.sales s
  WHERE s.organization_id = v_org
    AND s.id IN (SELECT ve.reference_id FROM public.voucher_entries ve WHERE ve.id = ANY(v_voucher_ids));

  INSERT INTO public.ella_noor_cn_repair_20260606_snapshot(snapshot_kind, row_id, payload)
  SELECT 'sale_return', sr.id, to_jsonb(sr)
  FROM public.sale_returns sr
  WHERE sr.id = ANY(v_sr_ids) AND sr.organization_id = v_org;

  INSERT INTO public.ella_noor_cn_repair_20260606_snapshot(snapshot_kind, row_id, payload)
  SELECT 'credit_note', cn.id, to_jsonb(cn)
  FROM public.credit_notes cn
  WHERE cn.id = 'c343416b-ac28-45b1-9934-a272954f32f4' AND cn.organization_id = v_org;

  -- 2. SOFT-DELETE 29 phantom CN-adjust receipts  ------------------------
  --    (trigger trg_sync_sale_payment_status_from_receipts auto-recomputes
  --     sales.paid_amount and payment_status on UPDATE)
  UPDATE public.voucher_entries
  SET deleted_at = now(),
      notes = COALESCE(notes, '') ||
        E'\n[cn_over_apply_repair_20260606] phantom credit_note_adjustment ' ||
        'receipt removed (audit: ella_noor_cn_over_applied_invoices.csv)'
  WHERE id = ANY(v_voucher_ids)
    AND organization_id = v_org
    AND deleted_at IS NULL;

  -- 3. BACKFILL credit notes from pending sale returns  ------------------

  -- 3a. Shumama Baireli — 3 CNs from SR/36, SR/37, SR/41 = ₹28,900
  INSERT INTO public.credit_notes
    (organization_id, credit_note_number, customer_id, customer_name,
     credit_amount, used_amount, status, notes)
  VALUES
    (v_org, 'CN/26-27/37', '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9', 'Shumama Baireli',
     11100, 11100, 'used',
     'Backfilled from SR/26-27/36 (repair 20260606) to back existing CN-adjust receipts'),
    (v_org, 'CN/26-27/38', '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9', 'Shumama Baireli',
     11400, 11400, 'used',
     'Backfilled from SR/26-27/37 (repair 20260606)'),
    (v_org, 'CN/26-27/39', '224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9', 'Shumama Baireli',
     6400, 6400, 'used',
     'Backfilled from SR/26-27/41 partial (repair 20260606)');

  UPDATE public.sale_returns SET
    credit_note_id = (SELECT id FROM public.credit_notes
                      WHERE organization_id = v_org AND credit_note_number = 'CN/26-27/37'),
    credit_status = 'adjusted', credit_available_balance = 0
  WHERE id = 'b27a2315-ad51-4483-9b17-f4ad9a085604';

  UPDATE public.sale_returns SET
    credit_note_id = (SELECT id FROM public.credit_notes
                      WHERE organization_id = v_org AND credit_note_number = 'CN/26-27/38'),
    credit_status = 'adjusted', credit_available_balance = 0
  WHERE id = '5007a78b-6292-496f-a66c-ec42173df0c2';

  UPDATE public.sale_returns SET
    credit_note_id = (SELECT id FROM public.credit_notes
                      WHERE organization_id = v_org AND credit_note_number = 'CN/26-27/39'),
    credit_status = 'partially_adjusted', credit_available_balance = 4550
  WHERE id = '12329454-abf9-462e-8974-cbba236c0ad4';

  -- 3b. FAIZA SALMAN MERCHANT — top up existing CN/26-27/6 by ₹6,000
  UPDATE public.credit_notes SET
    used_amount = 6000, status = 'active',
    notes = COALESCE(notes,'') ||
      E'\n[repair 20260606] used_amount bumped to 6000 to back voucher 9e40042a'
  WHERE id = 'c343416b-ac28-45b1-9934-a272954f32f4';

  UPDATE public.sale_returns SET
    credit_status = 'partially_adjusted',
    credit_available_balance = 200
  WHERE id = 'd96db19d-03ef-4866-a721-1c99c239a3a0';

  -- 3c. Parina Bhujwala — 1 CN from SR/26-27/64 = ₹3,350
  INSERT INTO public.credit_notes
    (organization_id, credit_note_number, customer_id, customer_name,
     credit_amount, used_amount, status, notes)
  VALUES
    (v_org, 'CN/26-27/40', '10e459c8-fadd-4142-b3bd-98747d245c92', 'Parina Bhujwala',
     3350, 3350, 'used',
     'Backfilled from SR/26-27/64 (repair 20260606)');

  UPDATE public.sale_returns SET
    credit_note_id = (SELECT id FROM public.credit_notes
                      WHERE organization_id = v_org AND credit_note_number = 'CN/26-27/40'),
    credit_status = 'adjusted', credit_available_balance = 0
  WHERE id = '80dae4ba-44c6-4530-8f94-868fbae5687f';

  -- 4. Explicit safety recompute (no-op if trigger already did it) -------
  PERFORM compute_sale_settlement(s.id, v_org)
  FROM public.sales s
  WHERE s.organization_id = v_org
    AND s.id IN (SELECT ve.reference_id FROM public.voucher_entries ve WHERE ve.id = ANY(v_voucher_ids));
END $$;
