-- Run AFTER the mutate COMMIT. Read-only proof + invariant digest.
-- Org: 4bc73037-e877-4123-9261-eb6e3876698c
-- Tag: [kc71_barcode_repair_20260910]

-- A) Bill line now points at the live 0040011724 variant
SELECT
  pi.id,
  pi.line_number,
  pi.barcode,
  pi.qty,
  pi.sku_id,
  pv.barcode AS live_barcode,
  pv.stock_qty,
  pv.current_stock AS legacy_current_stock,
  p.id AS product_id,
  p.deleted_at AS product_deleted
FROM public.purchase_items pi
JOIN public.product_variants pv ON pv.id = pi.sku_id
JOIN public.products p ON p.id = pi.product_id
JOIN public.purchase_bills pb ON pb.id = pi.bill_id
WHERE pb.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND pb.software_bill_no = 'PUR/26-27/207'
  AND pi.deleted_at IS NULL
  AND pi.barcode = '0040011724';

-- B) Stock Report / Quick Stock / Item-Wise view of 0040011724
-- (get_stock_report qty column is stock_qty)
SELECT
  pv.id,
  pv.barcode,
  p.product_name,
  pv.stock_qty AS stock_report_qty,
  pv.current_stock AS legacy_column,
  pv.active,
  pv.deleted_at,
  p.deleted_at AS product_deleted_at,
  CASE
    WHEN pv.deleted_at IS NULL AND COALESCE(pv.active, true)
         AND p.deleted_at IS NULL AND p.product_type IS DISTINCT FROM 'service'
      THEN 'visible'
    ELSE 'hidden'
  END AS report_visibility
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND pv.barcode = '0040011724';

-- C) Tagged rows
SELECT id, movement_type, quantity, variant_id, notes, created_at
FROM public.stock_movements
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND notes LIKE '%[kc71_barcode_repair_20260910]%'
ORDER BY created_at;

SELECT id, software_bill_no, notes
FROM public.purchase_bills
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND software_bill_no = 'PUR/26-27/207';

SELECT id, product_name, deleted_at
FROM public.products
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND id IN (
    '19e6e93a-fee6-4b1a-b8f3-01375307eb7e',
    '44a594b1-48d4-4c81-923a-f52ce0949700',
    '54626ebf-bb30-4261-a48f-2ea4ce785aed',
    '703c4b14-8094-40fa-ab06-d1e7b3780d9a',
    '3b69da02-87dd-4492-8410-a3abd5f65e31'
  )
ORDER BY created_at;

-- D) Out of scope still live (13:13 siblings + org-wide 1xxxxxxxxx with stock)
SELECT barcode, stock_qty, deleted_at
FROM public.product_variants
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND barcode IN ('1000000675','1000000676','1000000677','1000000678','1000000679')
ORDER BY barcode;

SELECT COUNT(*) AS generated_barcode_variants_with_stock
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND pv.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND pv.barcode ~ '^1[0-9]{9}$'
  AND COALESCE(pv.stock_qty, 0) <> 0;

-- E) Invariant digest (SQL editor / postgres). Snapshot is global; check this org's paid drift did not rise.
SELECT public.snapshot_accounting_invariants(CURRENT_DATE);

SELECT check_name, organization_id, organization_name,
       violation_count, prev_count, delta, total_detail
FROM public.get_invariant_digest(CURRENT_DATE)
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
   OR check_name = 'paid_diverges_from_receipts'
ORDER BY check_name, organization_name;
