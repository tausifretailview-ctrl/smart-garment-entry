-- VELVET (POS) one-time cleanup: reset fake stock on service products.
-- Org: dafc3d0c-874e-4784-bac3-5eab5f3c85b5
-- Requires Step 1 service stock guards deployed first.

-- 2C prerequisite: stock_movements has no deleted_at today; add for audit-safe voiding.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2B: Reset service variant stock to 0 (VELVET only)
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

-- 2C: Soft-delete stock_movements for VELVET service variants
UPDATE public.stock_movements sm
SET deleted_at = NOW()
WHERE sm.deleted_at IS NULL
  AND sm.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
  AND sm.variant_id IN (
    SELECT pv.id
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
      AND p.product_type = 'service'
      AND pv.deleted_at IS NULL
  );

-- 2D: Remove batch_stock rows for VELVET service variants
DELETE FROM public.batch_stock bs
WHERE bs.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
  AND bs.variant_id IN (
    SELECT pv.id
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid
      AND p.product_type = 'service'
      AND pv.deleted_at IS NULL
  );
