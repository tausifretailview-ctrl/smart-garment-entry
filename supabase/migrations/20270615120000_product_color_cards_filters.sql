-- Product Master → Photos filters (Nov 2026).
--
-- * get_product_color_cards gets filters: brand, category, colour (exact, case ignored) and
--   photo ('all' | 'missing' | 'with'). The old parameters stay, so screens that call it the old
--   way keep working (p_only_missing = photo 'missing').
-- * get_product_color_filter_options(org): the brands, categories and colours of the shop's
--   product cards, with how many cards each has, for the filter lists.
-- Both SECURITY DEFINER with the membership check; read-only. Needs SQL 77.
-- Safe to run more than once.

DROP FUNCTION IF EXISTS public.get_product_color_cards(uuid, text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.get_product_color_cards(uuid, text, boolean, integer, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_product_color_cards(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_only_missing boolean DEFAULT false,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0,
  p_brand text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_photo text DEFAULT 'all'
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  brand text,
  category text,
  style text,
  color text,
  image_url text,
  product_image_url text,
  sizes text,
  stock_qty numeric,
  total_count bigint,
  all_count bigint,
  with_photo_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_brand text := lower(nullif(btrim(coalesce(p_brand, '')), ''));
  v_category text := lower(nullif(btrim(coalesce(p_category, '')), ''));
  v_color text := lower(nullif(btrim(coalesce(p_color, '')), ''));
  v_photo text := CASE WHEN coalesce(p_only_missing, false) THEN 'missing' ELSE lower(coalesce(p_photo, 'all')) END;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH prod AS (
    SELECT p.id, p.product_name, p.brand, p.category, p.style, p.color, p.image_url, p.created_at
    FROM products p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND (v_brand IS NULL OR lower(btrim(coalesce(p.brand, ''))) = v_brand)
      AND (v_category IS NULL OR lower(btrim(coalesce(p.category, ''))) = v_category)
      AND (
        v_q IS NULL
        OR p.product_name ILIKE '%' || v_q || '%'
        OR coalesce(p.brand, '') ILIKE '%' || v_q || '%'
        OR coalesce(p.style, '') ILIKE '%' || v_q || '%'
        OR coalesce(p.category, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM product_variants v
          WHERE v.product_id = p.id AND v.deleted_at IS NULL
            AND (coalesce(v.color, '') ILIKE '%' || v_q || '%' OR coalesce(v.barcode, '') = v_q)
        )
      )
  ),
  -- Colour of each size: the size's own colour, else the product's.
  vcol AS (
    SELECT prod.id AS pid, btrim(coalesce(nullif(btrim(v.color), ''), prod.color, '')) AS col,
           v.size, coalesce(v.stock_qty, 0) AS stock
    FROM prod
    JOIN product_variants v ON v.product_id = prod.id AND v.deleted_at IS NULL AND v.active IS DISTINCT FROM false
  ),
  cards AS (
    -- One card per colour whatever its case ("BK" / "bk"); shown as typed, capitals preferred.
    SELECT vcol.pid, (array_agg(vcol.col ORDER BY (vcol.col = upper(vcol.col)) DESC, vcol.col))[1] AS col,
           string_agg(DISTINCT nullif(vcol.size, 'None'), ', ') AS sizes,
           sum(vcol.stock) AS stock
    FROM vcol
    GROUP BY vcol.pid, lower(vcol.col)
    UNION ALL
    -- A product with no sizes yet still gets one card.
    SELECT prod.id, btrim(coalesce(prod.color, '')), NULL, 0
    FROM prod
    WHERE NOT EXISTS (SELECT 1 FROM vcol WHERE vcol.pid = prod.id)
  ),
  full_cards AS (
    SELECT cards.*, prod.product_name, prod.brand, prod.category, prod.style, prod.image_url AS p_img, prod.created_at,
           ci.image_url AS c_img
    FROM cards
    JOIN prod ON prod.id = cards.pid
    LEFT JOIN product_color_images ci
      ON ci.product_id = cards.pid AND lower(btrim(ci.color)) = lower(cards.col)
    WHERE v_color IS NULL OR lower(cards.col) = v_color
  ),
  filtered AS (
    SELECT * FROM full_cards
    WHERE v_photo = 'all'
       OR (v_photo = 'missing' AND full_cards.c_img IS NULL)
       OR (v_photo = 'with' AND full_cards.c_img IS NOT NULL)
  )
  SELECT f.pid, f.product_name, f.brand, f.category, f.style, f.col, f.c_img, f.p_img, f.sizes, f.stock,
         count(*) OVER (),
         (SELECT count(*) FROM full_cards),
         (SELECT count(*) FROM full_cards WHERE full_cards.c_img IS NOT NULL)
  FROM filtered f
  ORDER BY f.created_at DESC, f.product_name, f.col
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 60), 200))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_color_filter_options(p_org_id uuid)
RETURNS TABLE (kind text, value text, cards bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH prod AS (
    SELECT p.id, btrim(coalesce(p.brand, '')) AS brand, btrim(coalesce(p.category, '')) AS category, p.color
    FROM products p
    WHERE p.organization_id = p_org_id AND p.deleted_at IS NULL AND p.product_type IS DISTINCT FROM 'service'
  ),
  cols AS (
    SELECT DISTINCT prod.id, lower(btrim(coalesce(nullif(btrim(v.color), ''), prod.color, ''))) AS lc,
           btrim(coalesce(nullif(btrim(v.color), ''), prod.color, '')) AS col
    FROM prod
    JOIN product_variants v ON v.product_id = prod.id AND v.deleted_at IS NULL AND v.active IS DISTINCT FROM false
  )
  SELECT 'brand', (array_agg(prod.brand))[1], count(*) FROM prod WHERE prod.brand <> '' GROUP BY lower(prod.brand)
  UNION ALL
  SELECT 'category', (array_agg(prod.category))[1], count(*) FROM prod WHERE prod.category <> '' GROUP BY lower(prod.category)
  UNION ALL
  SELECT 'color', (array_agg(cols.col ORDER BY (cols.col = upper(cols.col)) DESC, cols.col))[1], count(DISTINCT cols.id)
  FROM cols WHERE cols.lc <> '' GROUP BY cols.lc
  ORDER BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_color_cards(uuid, text, boolean, integer, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_color_cards(uuid, text, boolean, integer, integer, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_product_color_filter_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_color_filter_options(uuid) TO authenticated, service_role;

-- Checks (read-only) after running:
--   SELECT kind, count(*) FROM public.get_product_color_filter_options('<your organization id>') GROUP BY 1;
