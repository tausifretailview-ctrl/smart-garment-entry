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
