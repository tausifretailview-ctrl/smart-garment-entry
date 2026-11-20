-- Markdown % for wholesale distributors: the sale price stays the list price (e.g. 1800) and a
-- markdown % comes off it on the Sale Bill (brand A 25%, brand B 30%), before any extra discount.
--
--   table  brand_markdowns            one markdown % per brand of a shop
--   column products.markdown_percent  this product's own markdown (NULL = use its brand's)
--   column sale_items.markdown_percent the markdown on a bill line (discount_percent keeps the
--                                      whole line discount, markdown included, as before)
--
-- Shop members can view, add, edit and remove brand markdowns.
-- Safe to run more than once.
-- UNDO: ALTER TABLE public.sale_items DROP COLUMN markdown_percent;
--       ALTER TABLE public.products DROP COLUMN markdown_percent;
--       DROP TABLE public.brand_markdowns;

CREATE TABLE IF NOT EXISTS public.brand_markdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  brand text NOT NULL,
  markdown_percent numeric(5, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_markdowns_brand_check CHECK (length(btrim(brand)) BETWEEN 1 AND 120),
  CONSTRAINT brand_markdowns_percent_check CHECK (markdown_percent >= 0 AND markdown_percent < 100)
);

-- One markdown per brand in a shop (brand names compared without case / outer spaces).
CREATE UNIQUE INDEX IF NOT EXISTS brand_markdowns_org_brand_key
  ON public.brand_markdowns (organization_id, upper(btrim(brand)));

ALTER TABLE public.brand_markdowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view brand markdowns" ON public.brand_markdowns;
CREATE POLICY "Org members can view brand markdowns"
  ON public.brand_markdowns FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can add brand markdowns" ON public.brand_markdowns;
CREATE POLICY "Org members can add brand markdowns"
  ON public.brand_markdowns FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can edit brand markdowns" ON public.brand_markdowns;
CREATE POLICY "Org members can edit brand markdowns"
  ON public.brand_markdowns FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can remove brand markdowns" ON public.brand_markdowns;
CREATE POLICY "Org members can remove brand markdowns"
  ON public.brand_markdowns FOR DELETE TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

REVOKE ALL ON TABLE public.brand_markdowns FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brand_markdowns TO authenticated;
GRANT ALL ON TABLE public.brand_markdowns TO service_role;

CREATE OR REPLACE FUNCTION public.brand_markdowns_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brand_markdowns_updated_at ON public.brand_markdowns;
CREATE TRIGGER trg_brand_markdowns_updated_at
  BEFORE UPDATE ON public.brand_markdowns
  FOR EACH ROW EXECUTE FUNCTION public.brand_markdowns_touch_updated_at();

COMMENT ON TABLE public.brand_markdowns IS
  'Markdown % per brand (wholesale): taken off the sale price on the Sale Bill before any extra discount.';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS markdown_percent numeric(5, 2);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_markdown_percent_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_markdown_percent_check
      CHECK (markdown_percent IS NULL OR (markdown_percent >= 0 AND markdown_percent < 100));
  END IF;
END $$;
COMMENT ON COLUMN public.products.markdown_percent IS
  'This product''s markdown % on the Sale Bill; NULL = use the brand''s (brand_markdowns).';

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS markdown_percent numeric(5, 2);
COMMENT ON COLUMN public.sale_items.markdown_percent IS
  'Markdown % on this line (part of discount_percent, which holds the whole line discount).';

NOTIFY pgrst, 'reload schema';
