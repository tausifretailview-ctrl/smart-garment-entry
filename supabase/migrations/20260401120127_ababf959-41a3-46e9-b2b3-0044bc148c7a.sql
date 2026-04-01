-- Soft-delete all NA color variants for PUL46
UPDATE product_variants 
SET deleted_at = now()
WHERE id IN (
  '215d912e-e41c-4819-9816-c388e26fdc2d',
  '631ad941-d2d7-4e5f-a685-145a4418223c',
  'dad609c2-0f92-4cd8-b87a-13ed722421c5',
  'd496cf7c-d101-4984-894e-f7d476747ef3',
  'ceb1657b-e3ae-4c25-bd0f-89e8be559e4a',
  '24909d87-d781-4587-a16f-4aa593341d3c',
  '76f175d5-76ad-4aa1-bd14-54ca26da97d3'
) AND deleted_at IS NULL;

-- RED size 4: merge stock 2 into primary, soft-delete duplicate
UPDATE product_variants SET stock_qty = stock_qty + 2 WHERE id = '89073e88-f2a4-4d2b-867b-4969f16e8d14';
UPDATE product_variants SET deleted_at = now(), stock_qty = 0 WHERE id = '78960165-086f-4028-b9ec-545360759f18';

-- RED size 5: merge stock 2
UPDATE product_variants SET stock_qty = stock_qty + 2 WHERE id = '34e5393b-5bb8-4e3d-a5f3-5be2f4760fe1';
UPDATE product_variants SET deleted_at = now(), stock_qty = 0 WHERE id = 'c7c5c435-9ab7-4bee-8cc8-0746324fa61b';

-- RED size 6: merge stock 3
UPDATE product_variants SET stock_qty = stock_qty + 3 WHERE id = 'fd533df3-a80c-48b2-9654-160e8cb5ef51';
UPDATE product_variants SET deleted_at = now(), stock_qty = 0 WHERE id = '26b4bcbd-1ce4-4f5f-8508-523f8b4bb532';

-- RED size 7: merge stock 8
UPDATE product_variants SET stock_qty = stock_qty + 8 WHERE id = 'c1b3c995-cad4-4c14-9ace-7e751eddfd99';
UPDATE product_variants SET deleted_at = now(), stock_qty = 0 WHERE id = '6ea5ab15-fa22-47c7-94ba-50b1061468f9';