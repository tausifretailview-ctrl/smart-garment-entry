-- Website -> Products -> Photos: 360° spin photos for a listing.
--
-- spin_urls holds the photos taken around a product, in shooting order. The Street store shows
-- them on the product page as one picture the shopper drags to rotate (6 or more photos).
-- Additive: existing rows get an empty list, and get_public_storefront is unchanged. The store
-- reads the column through the existing "Anon can view active products of published stores"
-- policy, the same way it reads display_name / description.
-- Until this runs, the Photos dialog says the 360° view is not set up and the store shows none.
-- Safe to run more than once.
-- UNDO: ALTER TABLE public.website_products DROP COLUMN spin_urls;

ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS spin_urls text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_products_spin_urls_max'
  ) THEN
    ALTER TABLE public.website_products
      ADD CONSTRAINT website_products_spin_urls_max
      CHECK (cardinality(spin_urls) <= 36);
  END IF;
END $$;

COMMENT ON COLUMN public.website_products.spin_urls IS
  '360° spin photos in shooting order (public URLs in the website-photos bucket). Empty = no spin.';

NOTIFY pgrst, 'reload schema';
