-- KS Footwear — barcode on Purchase Bills but missing from Stock Report
-- Org: 4bc73037-e877-4123-9261-eb6e3876698c
-- Barcode: 0040017398 (PUG42 qty 3 on bill)
-- Note: purchase_items has NO organization_id — scope via purchase_bills only.

-- 1) Purchase snapshot vs live variant/product
SELECT
  pi.id AS purchase_item_id,
  pi.barcode AS purchase_barcode,
  pi.product_name,
  pi.qty,
  pi.sku_id,
  pi.deleted_at AS pi_deleted,
  pv.barcode AS live_barcode,
  pv.stock_qty,
  pv.active AS pv_active,
  pv.deleted_at AS pv_deleted,
  p.product_name AS live_product_name,
  p.deleted_at AS product_deleted,
  CASE
    WHEN pi.sku_id IS NULL THEN 'no sku_id on purchase line'
    WHEN pv.id IS NULL THEN 'sku_id points to missing variant'
    WHEN pv.deleted_at IS NOT NULL THEN 'variant soft-deleted (Stock Report hides)'
    WHEN pv.active IS NOT TRUE THEN 'variant inactive (Stock Report hides)'
    WHEN p.deleted_at IS NOT NULL THEN 'product soft-deleted (Stock Report hides)'
    WHEN COALESCE(pv.barcode, '') IS DISTINCT FROM COALESCE(pi.barcode, '')
      THEN 'live barcode ≠ purchase barcode (search miss)'
    ELSE 'should appear in Stock Report — check filters'
  END AS diagnosis
FROM public.purchase_items pi
JOIN public.purchase_bills pb ON pb.id = pi.bill_id
LEFT JOIN public.product_variants pv ON pv.id = pi.sku_id
LEFT JOIN public.products p ON p.id = pv.product_id
WHERE pb.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND pb.deleted_at IS NULL
  AND pi.deleted_at IS NULL
  AND pi.barcode ILIKE '%0040017398%';

-- 2) Any variant still carrying this barcode (or PUG42 by name)
SELECT
  pv.id,
  pv.barcode,
  pv.stock_qty,
  pv.active,
  pv.deleted_at,
  p.product_name,
  p.deleted_at AS product_deleted
FROM public.product_variants pv
JOIN public.products p ON p.id = pv.product_id
WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND (
    pv.barcode ILIKE '%0040017398%'
    OR p.product_name ILIKE '%PUG42%'
  )
ORDER BY p.deleted_at NULLS FIRST, pv.deleted_at NULLS FIRST, pv.barcode;
