
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_gst_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sale_gst_percent NUMERIC(5,2);

-- Populate from existing gst_per
UPDATE public.products
SET purchase_gst_percent = COALESCE(gst_per, 0),
    sale_gst_percent = COALESCE(gst_per, 0)
WHERE purchase_gst_percent IS NULL OR sale_gst_percent IS NULL;

-- Set defaults for future inserts
ALTER TABLE public.products
  ALTER COLUMN purchase_gst_percent SET DEFAULT 0,
  ALTER COLUMN sale_gst_percent SET DEFAULT 0;
