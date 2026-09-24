-- Backfill parents for the 34 orphaned credit notes reviewed 24 Sep 2026.
-- Dry-run export: query-results-export-2026-09-24_13-17-28 (34 notes, ₹39,639.00).
--
-- This file INSERTs new sale_returns rows only.
-- It does not UPDATE or DELETE sale_returns, sales, or credit_notes.
-- linked_sale_id is null, so an existing adjusted return on the issuing bill
-- is not reopened and that bill's sale_return_adjust is not changed.
--
-- How to run (SQL editor). Do not click Format SQL. Run one section at a time.
--   1. Section A only (the SELECT). Stop unless note_count = 34,
--      remaining_inr = 39639.00, and mismatch_count = 0.
--   2. Section B only (the DO block). It numbers returns itself. Do not call
--      generate_sale_return_number: the SQL editor has no auth.uid() and that
--      function raises 42501.
--   3. Section C. paid_diverges_from_receipts must not rise vs Section A.

-- =============================================================================
-- Section A — pre-check. Read only.
-- =============================================================================

WITH expected(credit_note_id, amount) AS (
  VALUES
    ('ad1968d8-9cac-42e0-8855-dbec88efdc47'::uuid, 110.00),
    ('951fdf8c-47b7-4c6b-ae37-ec2ee93c729e'::uuid, 848.00),
    ('694cd620-2982-4fe4-b194-232bd62cd38a'::uuid, 700.00),
    ('75516e19-42cf-4954-8677-f9601e590797'::uuid, 650.00),
    ('4f97091f-6e04-4f8a-a84f-e5fe4f4020cf'::uuid, 650.00),
    ('86699d0c-a566-4b66-9dc0-895bc134d4e1'::uuid, 160.00),
    ('a614498a-fb9a-4174-8840-0a4d5ccf8867'::uuid, 3950.00),
    ('ead237f6-1679-4abd-8649-ce4c03a13681'::uuid, 80.00),
    ('fd9b51d7-fda8-4a80-8927-6d22505b8707'::uuid, 130.00),
    ('6c158b8c-0bca-45b9-9bda-d9d9fb438b8a'::uuid, 260.00),
    ('6dc512a6-fafb-46c0-b09f-7427dc1aa4da'::uuid, 1950.00),
    ('e7b535a6-de03-4756-a6ff-5f58e048f7cf'::uuid, 586.00),
    ('742803ba-3302-4470-a122-dfaa6ce1916c'::uuid, 580.00),
    ('42ed091e-adab-41df-bf53-d80866645fee'::uuid, 576.00),
    ('99fec1a2-cd5a-420e-b58e-ea2348fff37a'::uuid, 1399.00),
    ('6659d414-6594-4a52-a6c9-1f40b87eba1e'::uuid, 254.00),
    ('5777ecf8-1b73-47a4-9bec-89e76d7a0779'::uuid, 568.00),
    ('5b6ec495-2368-486b-88c2-691100c1fb4d'::uuid, 2075.00),
    ('579ffeee-ff8d-4315-8f3d-0c48e3094905'::uuid, 300.00),
    ('58fd6441-631d-4d5e-9ec3-798d8d2d5407'::uuid, 1075.00),
    ('3d3cfefb-a6f9-4b66-8716-f123862347f7'::uuid, 800.00),
    ('89441f7b-d0df-489b-bc1b-bd79050e0ad9'::uuid, 383.00),
    ('275acc48-7813-4fea-a92b-937d6aa6f32e'::uuid, 700.00),
    ('ea056d4f-eb01-458f-beb6-e3fe0123e331'::uuid, 650.00),
    ('0a3e5a35-984e-47b8-9e8b-6f914d9df75b'::uuid, 350.00),
    ('3afd2297-c51f-4cca-8afc-bebc9baf35f0'::uuid, 295.00),
    ('d52e4ebf-ef08-45aa-9839-b63eb00f283c'::uuid, 140.00),
    ('4cb7c9db-85b1-4782-b739-9d25e767e8aa'::uuid, 1300.00),
    ('22a18dd7-cc16-495b-8fa9-56dcba72577c'::uuid, 780.00),
    ('d5f26e88-fae2-4c08-a31b-5fcdd0c50d9e'::uuid, 7560.00),
    ('f8d26fe2-a90d-4d9c-905b-bac67b03c6d9'::uuid, 325.00),
    ('01caa3cc-1aa2-45c8-9a80-d873ad94fe87'::uuid, 7560.00),
    ('6b23cbdc-5b92-4335-9479-b15a048b2a44'::uuid, 1595.00),
    ('e651caa8-9b70-4357-9628-44fdd7a27226'::uuid, 300.00)
),
live AS (
  SELECT
    e.credit_note_id,
    e.amount AS expected_amount,
    round((cn.credit_amount - cn.used_amount)::numeric, 2) AS live_remaining,
    cn.status,
    cn.deleted_at,
    cn.sale_id
  FROM expected e
  LEFT JOIN public.credit_notes cn ON cn.id = e.credit_note_id
)
SELECT
  (SELECT count(*) FROM expected) AS note_count,
  (SELECT round(sum(amount)::numeric, 2) FROM expected) AS remaining_inr,
  (SELECT count(*) FROM live
    WHERE status IS DISTINCT FROM 'active'
       OR deleted_at IS NOT NULL
       OR sale_id IS NULL
       OR live_remaining IS DISTINCT FROM expected_amount
       OR EXISTS (
         SELECT 1 FROM public.sale_returns sr
         WHERE sr.credit_note_id = live.credit_note_id
           AND sr.deleted_at IS NULL
       )
  ) AS mismatch_count,
  (SELECT count(*) FROM public.v_accounting_invariants
    WHERE check_name = 'paid_diverges_from_receipts') AS paid_diverges_before;

-- =============================================================================
-- Section B — insert. Run only when Section A is 34 / 39639.00 / mismatch 0.
-- One row at a time so generate_sale_return_number does not reuse SR numbers.
-- =============================================================================

DO $$
DECLARE
  r record;
  v_return_number text;
  v_sale_number text;
  v_cancelled boolean;
  v_inserted int := 0;
  v_fy text;
  v_seq integer;
  ist_date date;
  fy_start_year integer;
  fy_end_year integer;
BEGIN
  -- Do not call generate_sale_return_number here. The SQL editor has no
  -- auth.uid(), and that function raises 42501 via assert_org_member.
  FOR r IN
    SELECT
      cn.id,
      cn.organization_id,
      cn.customer_id,
      cn.customer_name,
      cn.credit_note_number,
      cn.issue_date,
      round((cn.credit_amount - cn.used_amount)::numeric, 2) AS amount
    FROM public.credit_notes cn
    WHERE cn.id IN (
      'ad1968d8-9cac-42e0-8855-dbec88efdc47',
      '951fdf8c-47b7-4c6b-ae37-ec2ee93c729e',
      '694cd620-2982-4fe4-b194-232bd62cd38a',
      '75516e19-42cf-4954-8677-f9601e590797',
      '4f97091f-6e04-4f8a-a84f-e5fe4f4020cf',
      '86699d0c-a566-4b66-9dc0-895bc134d4e1',
      'a614498a-fb9a-4174-8840-0a4d5ccf8867',
      'ead237f6-1679-4abd-8649-ce4c03a13681',
      'fd9b51d7-fda8-4a80-8927-6d22505b8707',
      '6c158b8c-0bca-45b9-9bda-d9d9fb438b8a',
      '6dc512a6-fafb-46c0-b09f-7427dc1aa4da',
      'e7b535a6-de03-4756-a6ff-5f58e048f7cf',
      '742803ba-3302-4470-a122-dfaa6ce1916c',
      '42ed091e-adab-41df-bf53-d80866645fee',
      '99fec1a2-cd5a-420e-b58e-ea2348fff37a',
      '6659d414-6594-4a52-a6c9-1f40b87eba1e',
      '5777ecf8-1b73-47a4-9bec-89e76d7a0779',
      '5b6ec495-2368-486b-88c2-691100c1fb4d',
      '579ffeee-ff8d-4315-8f3d-0c48e3094905',
      '58fd6441-631d-4d5e-9ec3-798d8d2d5407',
      '3d3cfefb-a6f9-4b66-8716-f123862347f7',
      '89441f7b-d0df-489b-bc1b-bd79050e0ad9',
      '275acc48-7813-4fea-a92b-937d6aa6f32e',
      'ea056d4f-eb01-458f-beb6-e3fe0123e331',
      '0a3e5a35-984e-47b8-9e8b-6f914d9df75b',
      '3afd2297-c51f-4cca-8afc-bebc9baf35f0',
      'd52e4ebf-ef08-45aa-9839-b63eb00f283c',
      '4cb7c9db-85b1-4782-b739-9d25e767e8aa',
      '22a18dd7-cc16-495b-8fa9-56dcba72577c',
      'd5f26e88-fae2-4c08-a31b-5fcdd0c50d9e',
      'f8d26fe2-a90d-4d9c-905b-bac67b03c6d9',
      '01caa3cc-1aa2-45c8-9a80-d873ad94fe87',
      '6b23cbdc-5b92-4335-9479-b15a048b2a44',
      'e651caa8-9b70-4357-9628-44fdd7a27226'
    )
      AND cn.deleted_at IS NULL
      AND cn.status = 'active'
      AND cn.sale_id IS NOT NULL
      AND cn.used_amount < cn.credit_amount
      AND NOT EXISTS (
        SELECT 1 FROM public.sale_returns sr
        WHERE sr.credit_note_id = cn.id
          AND sr.deleted_at IS NULL
      )
    ORDER BY cn.organization_id, cn.credit_note_number
  LOOP
    IF r.amount <= 0.005 THEN
      RAISE EXCEPTION 'Refusing zero remaining for %', r.credit_note_number;
    END IF;

    SELECT s.sale_number,
           COALESCE(s.is_cancelled, false)
             OR lower(COALESCE(s.payment_status, '')) = 'cancelled'
    INTO v_sale_number, v_cancelled
    FROM public.credit_notes cn
    LEFT JOIN public.sales s
      ON s.id = cn.sale_id
     AND s.organization_id = cn.organization_id
    WHERE cn.id = r.id;

    ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
      fy_start_year := EXTRACT(YEAR FROM ist_date);
      fy_end_year := fy_start_year + 1;
    ELSE
      fy_end_year := EXTRACT(YEAR FROM ist_date);
      fy_start_year := fy_end_year - 1;
    END IF;
    v_fy := substring(fy_start_year::text FROM 3 FOR 2) || '-' || substring(fy_end_year::text FROM 3 FOR 2);

    SELECT COALESCE(MAX(CAST(substring(return_number FROM 'SR/\d+-\d+/(\d+)$') AS integer)), 0) + 1
    INTO v_seq
    FROM public.sale_returns
    WHERE organization_id = r.organization_id
      AND return_number LIKE 'SR/' || v_fy || '/%'
      AND deleted_at IS NULL;

    v_return_number := 'SR/' || v_fy || '/' || v_seq::text;

    INSERT INTO public.sale_returns (
      organization_id,
      customer_id,
      customer_name,
      return_date,
      return_number,
      gross_amount,
      gst_amount,
      net_amount,
      credit_available_balance,
      credit_status,
      credit_note_id,
      refund_type,
      linked_sale_id,
      original_sale_number,
      notes
    ) VALUES (
      r.organization_id,
      r.customer_id,
      COALESCE(NULLIF(btrim(r.customer_name), ''), 'Walk-in Customer'),
      COALESCE(r.issue_date::date, CURRENT_DATE),
      v_return_number,
      r.amount,
      0,
      r.amount,
      r.amount,
      'pending',
      r.id,
      'credit_note',
      NULL,
      CASE
        WHEN v_cancelled THEN NULL
        ELSE NULLIF(btrim(COALESCE(v_sale_number, '')), '')
      END,
      'Backfilled 24 Sep 2026 — repair for orphaned exchange-excess credit note'
        || CASE
             WHEN v_cancelled AND NULLIF(btrim(COALESCE(v_sale_number, '')), '') IS NOT NULL
               THEN ' | issuing invoice ' || btrim(v_sale_number) || ' is cancelled'
             ELSE ''
           END
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  IF v_inserted <> 34 THEN
    RAISE EXCEPTION 'Expected to insert 34 sale returns, inserted %', v_inserted;
  END IF;
END $$;

-- =============================================================================
-- Section C — after Section B. paid_diverges_from_receipts must not exceed
-- the paid_diverges_before value from Section A.
-- =============================================================================

SELECT check_name, count(*) AS hit_count
FROM public.v_accounting_invariants
WHERE check_name IN (
  'paid_diverges_from_receipts',
  'duplicate_voucher_number',
  'rapid_duplicate_receipt',
  'receipts_exceed_invoice'
)
GROUP BY check_name
ORDER BY check_name;

SELECT count(*) AS backfilled_rows, round(sum(net_amount)::numeric, 2) AS backfilled_inr
FROM public.sale_returns
WHERE deleted_at IS NULL
  AND notes = 'Backfilled 24 Sep 2026 — repair for orphaned exchange-excess credit note';
