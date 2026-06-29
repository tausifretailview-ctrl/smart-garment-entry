UPDATE public.product_variants pv
SET
  stock_qty = 0,
  current_stock = 0,
  updated_at = NOW()
FROM public.products p
WHERE p.id = pv.product_id
  AND pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
  AND p.product_type = 'service'
  AND pv.deleted_at IS NULL
  AND (pv.stock_qty IS DISTINCT FROM 0 OR pv.current_stock IS DISTINCT FROM 0);
