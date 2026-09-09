-- Targeted one-pair product merge: move non-conflicting variants from source
-- onto target, soft-delete source only when fully empty. Dry-run by default.
-- Used by Bulk Product Update → Merge duplicate products (FROM / INTO picker).

CREATE OR REPLACE FUNCTION public.normalize_product_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    lower(regexp_replace(COALESCE(p_name, ''), '[\s\-_./]+', '', 'g')),
    ''
  );
$$;

COMMENT ON FUNCTION public.normalize_product_name_key(text) IS
  'Compact product-name key: lower + strip spaces/hyphens/underscores/dots/slashes.';

REVOKE ALL ON FUNCTION public.normalize_product_name_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_product_name_key(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_product_name_key(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.merge_two_products(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS public.merge_two_products(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.merge_two_products(
  p_org_id uuid,
  p_source_product_id uuid,
  p_target_product_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_name text;
  v_target_name text;
  v_variants_moved integer := 0;
  v_source_retired boolean := false;
  v_conflicts jsonb := '[]'::jsonb;
  v_variant record;
  v_size_key text;
  v_color_key text;
  v_has_conflict boolean;
  v_remaining integer;
BEGIN
  IF p_org_id IS NULL OR p_source_product_id IS NULL OR p_target_product_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id, p_source_product_id, and p_target_product_id are required';
  END IF;

  IF p_source_product_id = p_target_product_id THEN
    RAISE EXCEPTION 'Source and target products must be different';
  END IF;

  IF auth.role() = 'anon'
     OR (
       auth.role() = 'authenticated'
       AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))
     ) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT p.product_name INTO v_source_name
  FROM public.products p
  WHERE p.id = p_source_product_id
    AND p.organization_id = p_org_id
    AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source product not found in this organization';
  END IF;

  SELECT p.product_name INTO v_target_name
  FROM public.products p
  WHERE p.id = p_target_product_id
    AND p.organization_id = p_org_id
    AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target product not found in this organization';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _merge_two_claimed_size_color (
    size_key text NOT NULL,
    color_key text NOT NULL,
    PRIMARY KEY (size_key, color_key)
  ) ON COMMIT DROP;

  DELETE FROM _merge_two_claimed_size_color;
  INSERT INTO _merge_two_claimed_size_color (size_key, color_key)
  SELECT
    lower(trim(COALESCE(c.size, ''))),
    lower(trim(COALESCE(c.color, '')))
  FROM public.product_variants c
  WHERE c.organization_id = p_org_id
    AND c.product_id = p_target_product_id
    AND c.deleted_at IS NULL
    AND c.active IS DISTINCT FROM false
  ON CONFLICT DO NOTHING;

  FOR v_variant IN
    SELECT
      pv.id,
      pv.barcode,
      pv.size,
      pv.color,
      COALESCE(pv.stock_qty, 0) AS stock_qty
    FROM public.product_variants pv
    WHERE pv.organization_id = p_org_id
      AND pv.product_id = p_source_product_id
      AND pv.deleted_at IS NULL
      AND pv.active IS DISTINCT FROM false
    ORDER BY pv.created_at ASC NULLS LAST, pv.id ASC
  LOOP
    v_size_key := lower(trim(COALESCE(v_variant.size, '')));
    v_color_key := lower(trim(COALESCE(v_variant.color, '')));

    SELECT EXISTS (
      SELECT 1
      FROM _merge_two_claimed_size_color cl
      WHERE cl.size_key = v_size_key
        AND cl.color_key = v_color_key
    ) INTO v_has_conflict;

    IF v_has_conflict THEN
      v_conflicts := v_conflicts || jsonb_build_array(
        jsonb_build_object(
          'variant_id', v_variant.id,
          'barcode', v_variant.barcode,
          'size', v_variant.size,
          'color', v_variant.color,
          'stock_qty', v_variant.stock_qty
        )
      );
    ELSE
      IF NOT p_dry_run THEN
        UPDATE public.product_variants
        SET product_id = p_target_product_id
        WHERE id = v_variant.id
          AND organization_id = p_org_id
          AND product_id = p_source_product_id
          AND deleted_at IS NULL;
      END IF;

      INSERT INTO _merge_two_claimed_size_color (size_key, color_key)
      VALUES (v_size_key, v_color_key)
      ON CONFLICT DO NOTHING;

      v_variants_moved := v_variants_moved + 1;
    END IF;
  END LOOP;

  IF p_dry_run THEN
    v_remaining := jsonb_array_length(v_conflicts);
  ELSE
    SELECT count(*)::integer INTO v_remaining
    FROM public.product_variants pv
    WHERE pv.organization_id = p_org_id
      AND pv.product_id = p_source_product_id
      AND pv.deleted_at IS NULL
      AND pv.active IS DISTINCT FROM false;
  END IF;

  IF v_remaining = 0 THEN
    IF NOT p_dry_run THEN
      UPDATE public.products
      SET deleted_at = now()
      WHERE id = p_source_product_id
        AND organization_id = p_org_id
        AND deleted_at IS NULL;
    END IF;
    v_source_retired := true;
  END IF;

  RETURN json_build_object(
    'source_product_id', p_source_product_id,
    'target_product_id', p_target_product_id,
    'source_product_name', v_source_name,
    'target_product_name', v_target_name,
    'variants_moved', v_variants_moved,
    'source_retired', v_source_retired,
    'conflicting_variants', v_conflicts,
    'dry_run', p_dry_run
  );
END;
$$;

COMMENT ON FUNCTION public.merge_two_products(uuid, uuid, uuid, boolean) IS
  'Move non-conflicting variants from source product onto target within one org. Soft-deletes source only when empty. Dry-run by default.';

REVOKE ALL ON FUNCTION public.merge_two_products(uuid, uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merge_two_products(uuid, uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_two_products(uuid, uuid, uuid, boolean) TO authenticated, service_role;
