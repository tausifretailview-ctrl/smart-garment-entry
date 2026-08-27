-- Gurukrupa Silk Sarees: stop LPAD leading-zero barcodes on future issues.
-- Same counter repair as KS Footwear (barcode_digits wider than org-number range).
-- Does NOT change existing variant barcodes or generate_next_barcode formula.

UPDATE public.barcode_sequence
SET
  next_barcode = GREATEST(next_barcode, 1000000001::bigint),
  updated_at = now()
WHERE organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND next_barcode < 1000000001;
