-- Extra barcodes per item (supermarket go-live, Nov 2026).
--
-- One product often carries more than one company barcode: a new pack design, an old
-- carton, a supplier's own label, the weighing scale's item code. product_variants.barcode
-- holds one; this table holds the others. A scan that does not find a main barcode looks
-- here and bills the item the extra barcode belongs to.
--
-- Rules (checked in the database, not only on screen):
--   * one extra barcode belongs to one item in the shop (unique per organisation);
--   * it cannot be another live item's main barcode;
--   * it must belong to an item of the same shop.
--
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.variant_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  barcode text NOT NULL CHECK (length(btrim(barcode)) BETWEEN 1 AND 64 AND barcode = btrim(barcode)),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE UNIQUE INDEX IF NOT EXISTS variant_barcodes_org_barcode_uq
  ON public.variant_barcodes (organization_id, barcode);
CREATE INDEX IF NOT EXISTS variant_barcodes_variant_idx
  ON public.variant_barcodes (variant_id);

ALTER TABLE public.variant_barcodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage extra barcodes" ON public.variant_barcodes;
CREATE POLICY "Members manage extra barcodes" ON public.variant_barcodes FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.variant_barcodes TO authenticated;

CREATE OR REPLACE FUNCTION public.variant_barcodes_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM product_variants v
    WHERE v.id = NEW.variant_id AND v.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Extra barcode: the item is not in this shop' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product_variants v
    WHERE v.organization_id = NEW.organization_id
      AND v.barcode = NEW.barcode
      AND v.deleted_at IS NULL
      AND v.id <> NEW.variant_id
  ) THEN
    RAISE EXCEPTION 'Barcode % is already the main barcode of another item', NEW.barcode USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variant_barcodes_check ON public.variant_barcodes;
CREATE TRIGGER variant_barcodes_check
  BEFORE INSERT OR UPDATE ON public.variant_barcodes
  FOR EACH ROW EXECUTE FUNCTION public.variant_barcodes_check();

-- Checks (read-only) after running:
--   SELECT count(*) FROM public.variant_barcodes;                    -- 0 on a fresh install
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.variant_barcodes'::regclass;
