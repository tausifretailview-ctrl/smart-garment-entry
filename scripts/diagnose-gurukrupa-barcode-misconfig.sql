-- Gurukrupa Silk Sarees — barcode_digits vs sequence (read-only diagnostic)
-- Org: e8fbf0d8-182c-4364-8570-96c756b72db8  slug: gurukrupasarees

-- 1) Settings + org number
SELECT
  o.id,
  o.name,
  o.organization_number,
  (o.organization_number::bigint * 10000000) + 1001 AS expected_range_start,
  (o.organization_number::bigint * 10000000) + 9999999 AS expected_range_end_8digit,
  COALESCE((s.bill_barcode_settings::jsonb ->> 'barcode_digits')::integer, 8) AS barcode_digits,
  s.bill_barcode_settings::jsonb ->> 'barcode_digits' AS barcode_digits_raw
FROM organizations o
LEFT JOIN settings s ON s.organization_id = o.id
WHERE o.id = 'e8fbf0d8-182c-4364-8570-96c756b72db8';

-- 2) Sequence counter (compare to 8-digit org range vs 10-digit natural floor)
SELECT
  bs.next_barcode,
  length(bs.next_barcode::text) AS next_barcode_digit_count,
  bs.next_barcode < 1000000001 AS still_in_leading_zero_risk_zone,
  bs.updated_at
FROM barcode_sequence bs
WHERE bs.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8';

-- 3) Count variants with KS-style "00" + 8-digit body (10 chars total)
SELECT
  COUNT(*) AS total_matching,
  COUNT(*) FILTER (WHERE pv.deleted_at IS NULL AND pv.active IS TRUE) AS active_matching,
  COUNT(*) FILTER (WHERE pv.deleted_at IS NULL AND pv.active IS TRUE AND pv.stock_qty > 0) AS active_in_stock
FROM product_variants pv
WHERE pv.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND pv.barcode ~ '^00[0-9]{8}$';

-- 4) Sample of affected barcodes (first 20)
SELECT
  pv.barcode,
  pv.stock_qty,
  pv.active,
  pv.deleted_at IS NOT NULL AS is_deleted,
  p.product_name
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND pv.barcode ~ '^00[0-9]{8}$'
ORDER BY pv.barcode
LIMIT 20;

-- 5) Spot-check TURKEY SILK / 10001753
SELECT
  pv.barcode,
  length(pv.barcode) AS barcode_len,
  pv.stock_qty,
  pv.active,
  pv.deleted_at,
  p.product_name,
  p.status
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.organization_id = 'e8fbf0d8-182c-4364-8570-96c756b72db8'
  AND (pv.barcode = '0010001753' OR pv.barcode LIKE '%10001753%');
