-- STEP 3 — Review before backfill (run in Supabase SQL editor)
-- Replace :org_id with your organization UUID.
-- Confirm which pure-numeric values are OUR serial vs supplier-typed externals (e.g. 84948).

-- A) All pure-numeric supplier_invoice_no (active bills), highest first
SELECT
  id,
  software_bill_no,
  supplier_invoice_no,
  length(trim(supplier_invoice_no)) AS digits,
  supplier_invoice_no::bigint AS numeric_value,
  supplier_inv_auto_generated,
  bill_date,
  created_at
FROM public.purchase_bills
WHERE organization_id = :'org_id'::uuid
  AND deleted_at IS NULL
  AND (is_cancelled IS NULL OR is_cancelled = false)
  AND supplier_invoice_no IS NOT NULL
  AND trim(supplier_invoice_no) <> ''
  AND supplier_invoice_no ~ '^\d+$'
ORDER BY supplier_invoice_no::bigint DESC, created_at DESC;

-- B) What the counter would suggest TODAY (auto-generated rows only)
SELECT public.peek_next_supplier_invoice_number(:'org_id'::uuid) AS next_auto_serial;

-- C) Max among rows already marked auto-generated (after backfill)
SELECT COALESCE(MAX(supplier_invoice_no::bigint), 0) AS max_auto_serial
FROM public.purchase_bills
WHERE organization_id = :'org_id'::uuid
  AND deleted_at IS NULL
  AND supplier_inv_auto_generated = true
  AND supplier_invoice_no ~ '^\d+$';

-- D) BACKFILL (run ONLY after you confirm max OUR serial, e.g. 3 → next should be 4)
--    Set p_max_our_serial to the highest number that is definitely yours.
/*
UPDATE public.purchase_bills
SET supplier_inv_auto_generated = true
WHERE organization_id = :'org_id'::uuid
  AND deleted_at IS NULL
  AND supplier_invoice_no ~ '^\d+$'
  AND length(trim(supplier_invoice_no)) <= 6
  AND supplier_invoice_no::bigint <= :p_max_our_serial::bigint;

-- Then verify:
SELECT public.peek_next_supplier_invoice_number(:'org_id'::uuid) AS next_after_backfill;
*/
