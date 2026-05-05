-- Add POS barcode scan price mode setting.
-- Preferred path: dedicated sale_settings table (if present).
-- Fallback path in this codebase: JSON key inside public.settings.sale_settings.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'sale_settings'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.sale_settings
      ADD COLUMN IF NOT EXISTS pos_barcode_price_mode TEXT
        NOT NULL DEFAULT 'sale_price'
        CHECK (pos_barcode_price_mode IN ('mrp', 'sale_price'))
    $sql$;
  END IF;
END $$;

-- JSON fallback used by current app structure (public.settings.sale_settings jsonb)
UPDATE public.settings
SET sale_settings = COALESCE(sale_settings, '{}'::jsonb)
  || jsonb_build_object(
    'pos_barcode_price_mode',
    COALESCE(sale_settings->>'pos_barcode_price_mode', 'sale_price')
  )
WHERE sale_settings IS NULL
   OR sale_settings->>'pos_barcode_price_mode' IS NULL;
