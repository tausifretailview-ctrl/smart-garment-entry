ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS item_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN sale_items.item_notes IS 'Optional line-level description (design number, brand, barcode etc). Appears on invoice print.';
