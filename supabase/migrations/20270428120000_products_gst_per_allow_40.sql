-- Allow the 40% GST slab on products (luxury / imported goods).
--
-- The first products migration created `gst_per INTEGER CHECK (gst_per IN (0, 5, 12, 18, 28))`.
-- If that check is still on the table, saving a product at 40% fails. This replaces it with the
-- same list plus 40. When the check is not there (already dropped), nothing changes.
-- Safe to run more than once.
-- UNDO: ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_gst_per_check;
--       ALTER TABLE public.products ADD CONSTRAINT products_gst_per_check
--         CHECK (gst_per IN (0, 5, 12, 18, 28)) NOT VALID;

DO $$
DECLARE
  v_name text;
  v_def text;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid) INTO v_name, v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.products'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%gst_per%'
  LIMIT 1;

  IF v_name IS NULL THEN
    RAISE NOTICE 'products has no gst_per check: 40%% is already allowed, nothing to change.';
    RETURN;
  END IF;
  IF v_def ~ '\m40\M' THEN
    RAISE NOTICE '% already allows 40%%, nothing to change.', v_name;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', v_name);
  ALTER TABLE public.products
    ADD CONSTRAINT products_gst_per_check CHECK (gst_per IN (0, 5, 12, 18, 28, 40));
  RAISE NOTICE 'Replaced % with products_gst_per_check (adds 40%%).', v_name;
END $$;
