-- Website → Edit details: a website-only name and a product-page description
-- per listing. Kept on website_products so the ERP product master (bills,
-- barcodes, stock) is never touched. Additive and nullable: existing rows and
-- the get_public_storefront RPC are unchanged. The store reads these columns
-- through the existing "Anon can view active products of published stores"
-- policy.

ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_products_display_name_len'
  ) THEN
    ALTER TABLE public.website_products
      ADD CONSTRAINT website_products_display_name_len
      CHECK (display_name IS NULL OR char_length(display_name) <= 120);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_products_description_len'
  ) THEN
    ALTER TABLE public.website_products
      ADD CONSTRAINT website_products_description_len
      CHECK (description IS NULL OR char_length(description) <= 2000);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
