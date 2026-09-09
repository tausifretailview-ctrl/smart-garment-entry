-- Merge products whose names match after stripping spaces/punctuation
-- (same compact key as compactProductToken in the app: FLEXI NL ≡ FLEXI /NL).
-- Canonical = most active variants, tiebreak oldest created_at.
-- Conflicting variants (same size+color already on canonical) are left alone;
-- duplicate products are soft-deleted only when fully empty of active variants.
-- p_dry_run=true (default) reports counts/conflicts with zero writes.

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

-- CREATE OR REPLACE cannot change return type (42P13). Drop any prior signature first.
DROP FUNCTION IF EXISTS public.consolidate_duplicate_products(uuid, boolean);
DROP FUNCTION IF EXISTS public.consolidate_duplicate_products(uuid);

CREATE OR REPLACE FUNCTION public.consolidate_duplicate_products(
  p_org_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_groups_merged integer := 0;
  v_variants_moved integer := 0;
  v_products_retired integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_group record;
  v_dup record;
  v_variant record;
  v_canonical_id uuid;
  v_canonical_name text;
  v_conflict_variants jsonb;
  v_size_key text;
  v_color_key text;
  v_has_conflict boolean;
  v_remaining integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon'
     OR (
       auth.role() = 'authenticated'
       AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))
     ) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _consolidate_claimed_size_color (
    size_key text NOT NULL,
    color_key text NOT NULL,
    PRIMARY KEY (size_key, color_key)
  ) ON COMMIT DROP;

  FOR v_group IN
    SELECT
      public.normalize_product_name_key(p.product_name) AS name_key,
      array_agg(p.id ORDER BY
        (
          SELECT count(*)::integer
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
            AND pv.organization_id = p_org_id
            AND pv.deleted_at IS NULL
            AND pv.active IS DISTINCT FROM false
        ) DESC,
        p.created_at ASC NULLS LAST,
        p.id ASC
      ) AS product_ids
    FROM public.products p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND COALESCE(trim(p.product_name), '') <> ''
      AND public.normalize_product_name_key(p.product_name) IS NOT NULL
    GROUP BY public.normalize_product_name_key(p.product_name)
    HAVING count(*) > 1
  LOOP
    v_groups_merged := v_groups_merged + 1;
    v_canonical_id := v_group.product_ids[1];

    SELECT p.product_name INTO v_canonical_name
    FROM public.products p
    WHERE p.id = v_canonical_id;

    -- Seed claimed size+color from canonical (and clear prior group).
    DELETE FROM _consolidate_claimed_size_color;
    INSERT INTO _consolidate_claimed_size_color (size_key, color_key)
    SELECT
      lower(trim(COALESCE(c.size, ''))),
      lower(trim(COALESCE(c.color, '')))
    FROM public.product_variants c
    WHERE c.organization_id = p_org_id
      AND c.product_id = v_canonical_id
      AND c.deleted_at IS NULL
      AND c.active IS DISTINCT FROM false
    ON CONFLICT DO NOTHING;

    FOR v_dup IN
      SELECT unnest(v_group.product_ids[2:array_length(v_group.product_ids, 1)]) AS product_id
    LOOP
      v_conflict_variants := '[]'::jsonb;

      FOR v_variant IN
        SELECT
          pv.id,
          pv.barcode,
          pv.size,
          pv.color,
          COALESCE(pv.stock_qty, 0) AS stock_qty
        FROM public.product_variants pv
        WHERE pv.organization_id = p_org_id
          AND pv.product_id = v_dup.product_id
          AND pv.deleted_at IS NULL
          AND pv.active IS DISTINCT FROM false
        ORDER BY pv.created_at ASC NULLS LAST, pv.id ASC
      LOOP
        v_size_key := lower(trim(COALESCE(v_variant.size, '')));
        v_color_key := lower(trim(COALESCE(v_variant.color, '')));

        SELECT EXISTS (
          SELECT 1
          FROM _consolidate_claimed_size_color cl
          WHERE cl.size_key = v_size_key
            AND cl.color_key = v_color_key
        ) INTO v_has_conflict;

        IF v_has_conflict THEN
          v_conflict_variants := v_conflict_variants || jsonb_build_array(
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
            SET product_id = v_canonical_id
            WHERE id = v_variant.id
              AND organization_id = p_org_id
              AND product_id = v_dup.product_id
              AND deleted_at IS NULL;
          END IF;

          INSERT INTO _consolidate_claimed_size_color (size_key, color_key)
          VALUES (v_size_key, v_color_key)
          ON CONFLICT DO NOTHING;

          v_variants_moved := v_variants_moved + 1;
        END IF;
      END LOOP;

      IF jsonb_array_length(v_conflict_variants) > 0 THEN
        v_conflicts := v_conflicts || jsonb_build_array(
          jsonb_build_object(
            'duplicate_product_id', v_dup.product_id,
            'canonical_product_id', v_canonical_id,
            'canonical_name', v_canonical_name,
            'conflicting_variants', v_conflict_variants
          )
        );
      END IF;

      IF p_dry_run THEN
        -- Hypothetical remaining = conflicts only (moved ones leave the dup).
        v_remaining := jsonb_array_length(v_conflict_variants);
      ELSE
        SELECT count(*)::integer INTO v_remaining
        FROM public.product_variants pv
        WHERE pv.organization_id = p_org_id
          AND pv.product_id = v_dup.product_id
          AND pv.deleted_at IS NULL
          AND pv.active IS DISTINCT FROM false;
      END IF;

      IF v_remaining = 0 THEN
        IF NOT p_dry_run THEN
          UPDATE public.products
          SET deleted_at = now()
          WHERE id = v_dup.product_id
            AND organization_id = p_org_id
            AND deleted_at IS NULL;
        END IF;
        v_products_retired := v_products_retired + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'groups_merged', v_groups_merged,
    'variants_moved', v_variants_moved,
    'products_retired', v_products_retired,
    'conflicts', v_conflicts,
    'dry_run', p_dry_run
  );
END;
$$;

COMMENT ON FUNCTION public.consolidate_duplicate_products(uuid, boolean) IS
  'Merge org products with equal normalize_product_name_key. Moves non-conflicting variants onto the canonical product; soft-deletes empty duplicates. Dry-run by default.';

REVOKE ALL ON FUNCTION public.consolidate_duplicate_products(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consolidate_duplicate_products(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.consolidate_duplicate_products(uuid, boolean) TO authenticated, service_role;
