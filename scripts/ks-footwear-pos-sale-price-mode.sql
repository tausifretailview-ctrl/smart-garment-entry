-- KS Footwear — switch POS barcode add from MRP to Sale Price
-- Org: 4bc73037-e877-4123-9261-eb6e3876698c
--
-- When pos_barcode_price_mode = 'mrp', POS unit price = variant.mrp (no line discount).
-- When 'sale_price' (default), unit price = variant.sale_price; MRP shown as reference/discount.
--
-- UI equivalent: Settings → Purchase → Enable MRP Field → turn OFF
--   "POS Barcode Scan - Use MRP as Price"

-- 0) Current value
SELECT organization_id,
       sale_settings->>'pos_barcode_price_mode' AS pos_barcode_price_mode,
       purchase_settings->>'show_mrp' AS show_mrp_enabled
FROM settings
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c';

-- 1) Switch POS to Sale Price (keeps MRP column visible for discount display)
UPDATE settings
SET sale_settings = jsonb_set(
      COALESCE(sale_settings, '{}'::jsonb),
      '{pos_barcode_price_mode}',
      '"sale_price"'::jsonb,
      true
    ),
    updated_at = now()
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND COALESCE(sale_settings->>'pos_barcode_price_mode', 'sale_price') = 'mrp';

-- 2) Verify (expect pos_barcode_price_mode = sale_price)
SELECT organization_id,
       sale_settings->>'pos_barcode_price_mode' AS pos_barcode_price_mode
FROM settings
WHERE organization_id = '4bc73037-e877-4123-9261-eb6e3876698c';

-- 3) Example: barcode 0040017429 after mode change (from purchase CSV)
--    MRP 204.50, sale_price 143.00 → POS unit price should be ₹143.00, not ₹204.50
SELECT pv.barcode, pv.mrp, pv.sale_price
FROM product_variants pv
WHERE pv.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND pv.barcode = '0040017429'
  AND pv.deleted_at IS NULL;
