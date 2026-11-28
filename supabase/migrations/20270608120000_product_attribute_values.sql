-- Product Master field lists (Nov 2026): product names, brands, categories, styles, colours
-- and HSN codes as lists of their own, so a shop can set them up first (Master → Product
-- Master) and Add Product / Purchase pick from them.
--
-- * product_attribute_values: one row per value per shop and kind; the same value with other
--   capitals or spaces is the same row (value_key).
-- * Values typed anywhere else are added automatically: a trigger on products (name, brand,
--   category, style, colour, HSN) and on product_variants (colour) — Add Product, Purchase,
--   Excel import and every other path. Existing values are copied in once below.
-- * rename_product_attribute_value: rename in the list, and if asked on the items too
--   (not for product names).
-- RLS: members of the shop. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.product_attribute_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('product_name', 'brand', 'category', 'style', 'color', 'hsn')),
  value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 200),
  value_key text GENERATED ALWAYS AS (lower(btrim(value))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_attribute_values_uq
  ON public.product_attribute_values (organization_id, kind, value_key);

ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage product field lists" ON public.product_attribute_values;
CREATE POLICY "Members manage product field lists" ON public.product_attribute_values FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_attribute_values TO authenticated;

-- ── Values typed on items join the lists ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_product_attribute_value(p_org uuid, p_kind text, p_value text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  INSERT INTO product_attribute_values (organization_id, kind, value)
  SELECT p_org, p_kind, btrim(p_value)
  WHERE p_org IS NOT NULL AND length(btrim(coalesce(p_value, ''))) BETWEEN 1 AND 200
  ON CONFLICT (organization_id, kind, value_key) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.products_attribute_values_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.product_name IS DISTINCT FROM OLD.product_name THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'product_name', NEW.product_name);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.brand IS DISTINCT FROM OLD.brand THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'brand', NEW.brand);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.category IS DISTINCT FROM OLD.category THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'category', NEW.category);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.style IS DISTINCT FROM OLD.style THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'style', NEW.style);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.color IS DISTINCT FROM OLD.color THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'color', NEW.color);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.hsn_code IS DISTINCT FROM OLD.hsn_code THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'hsn', NEW.hsn_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_attribute_values_sync ON public.products;
CREATE TRIGGER products_attribute_values_sync
  AFTER INSERT OR UPDATE OF product_name, brand, category, style, color, hsn_code ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_attribute_values_sync();

CREATE OR REPLACE FUNCTION public.variants_attribute_values_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL AND (TG_OP = 'INSERT' OR NEW.color IS DISTINCT FROM OLD.color) THEN
    PERFORM add_product_attribute_value(NEW.organization_id, 'color', NEW.color);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variants_attribute_values_sync ON public.product_variants;
CREATE TRIGGER variants_attribute_values_sync
  AFTER INSERT OR UPDATE OF color ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.variants_attribute_values_sync();

-- ── Rename (list, and items when asked) ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_product_attribute_value(
  p_organization_id uuid,
  p_kind text,
  p_old text,
  p_new text,
  p_apply_to_items boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new text := btrim(coalesce(p_new, ''));
  v_old_key text := lower(btrim(coalesce(p_old, '')));
  v_items int := 0;
  v_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('product_name', 'brand', 'category', 'style', 'color', 'hsn') THEN
    RAISE EXCEPTION 'Unknown list %', p_kind USING ERRCODE = '22023';
  END IF;
  IF v_new = '' OR length(v_new) > 200 OR v_old_key = '' THEN
    RAISE EXCEPTION 'Type the new name' USING ERRCODE = '22023';
  END IF;
  IF p_apply_to_items AND p_kind = 'product_name' THEN
    RAISE EXCEPTION 'Product names are renamed on each item, not here' USING ERRCODE = '22023';
  END IF;

  -- The list: drop the old row, keep (or add) the new one.
  DELETE FROM product_attribute_values
  WHERE organization_id = p_organization_id AND kind = p_kind AND value_key = v_old_key
    AND value_key <> lower(v_new);
  INSERT INTO product_attribute_values (organization_id, kind, value)
  VALUES (p_organization_id, p_kind, v_new)
  ON CONFLICT (organization_id, kind, value_key) DO UPDATE SET value = EXCLUDED.value;

  IF p_apply_to_items THEN
    IF p_kind = 'brand' THEN
      UPDATE products SET brand = v_new, updated_at = now()
      WHERE organization_id = p_organization_id AND lower(btrim(brand)) = v_old_key AND brand IS DISTINCT FROM v_new;
      GET DIAGNOSTICS v_items = ROW_COUNT;
    ELSIF p_kind = 'category' THEN
      UPDATE products SET category = v_new, updated_at = now()
      WHERE organization_id = p_organization_id AND lower(btrim(category)) = v_old_key AND category IS DISTINCT FROM v_new;
      GET DIAGNOSTICS v_items = ROW_COUNT;
    ELSIF p_kind = 'style' THEN
      UPDATE products SET style = v_new, updated_at = now()
      WHERE organization_id = p_organization_id AND lower(btrim(style)) = v_old_key AND style IS DISTINCT FROM v_new;
      GET DIAGNOSTICS v_items = ROW_COUNT;
    ELSIF p_kind = 'hsn' THEN
      UPDATE products SET hsn_code = v_new, updated_at = now()
      WHERE organization_id = p_organization_id AND lower(btrim(hsn_code)) = v_old_key AND hsn_code IS DISTINCT FROM v_new;
      GET DIAGNOSTICS v_items = ROW_COUNT;
    ELSIF p_kind = 'color' THEN
      UPDATE products SET color = v_new, updated_at = now()
      WHERE organization_id = p_organization_id AND lower(btrim(color)) = v_old_key AND color IS DISTINCT FROM v_new;
      GET DIAGNOSTICS v_items = ROW_COUNT;
      UPDATE product_variants SET color = v_new, updated_at = now()
      WHERE organization_id = p_organization_id AND lower(btrim(color)) = v_old_key AND color IS DISTINCT FROM v_new;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_items := v_items + v_n;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'items_changed', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_product_attribute_value(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_product_attribute_value(uuid, text, text, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.add_product_attribute_value(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_product_attribute_value(uuid, text, text) TO authenticated;

-- ── Copy the values already on items into the lists (once; re-running adds nothing new) ────

INSERT INTO public.product_attribute_values (organization_id, kind, value)
SELECT DISTINCT ON (organization_id, kind, lower(btrim(value))) organization_id, kind, btrim(value)
FROM (
  SELECT organization_id, 'product_name' AS kind, product_name AS value FROM public.products WHERE deleted_at IS NULL
  UNION ALL SELECT organization_id, 'brand', brand FROM public.products WHERE deleted_at IS NULL
  UNION ALL SELECT organization_id, 'category', category FROM public.products WHERE deleted_at IS NULL
  UNION ALL SELECT organization_id, 'style', style FROM public.products WHERE deleted_at IS NULL
  UNION ALL SELECT organization_id, 'color', color FROM public.products WHERE deleted_at IS NULL
  UNION ALL SELECT organization_id, 'hsn', hsn_code FROM public.products WHERE deleted_at IS NULL
  UNION ALL SELECT organization_id, 'color', color FROM public.product_variants WHERE deleted_at IS NULL
) v
WHERE organization_id IS NOT NULL AND length(btrim(coalesce(value, ''))) BETWEEN 1 AND 200
ORDER BY organization_id, kind, lower(btrim(value)), value
ON CONFLICT (organization_id, kind, value_key) DO NOTHING;

-- Checks (read-only) after running:
--   SELECT kind, count(*) FROM public.product_attribute_values GROUP BY kind ORDER BY kind;
