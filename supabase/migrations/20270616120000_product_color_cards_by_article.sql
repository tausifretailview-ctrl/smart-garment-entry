-- Product Master → Photos: one card per article and colour (Nov 2026).
--
-- Some shops save every size as its own product ("1490 (3095) 6 BLACK", "1490 (3095) 7 BLACK",
-- ...). The Photos page showed one card per size; it now shows one card per article + colour,
-- and a photo is saved for every size of that colour at once (Field Sales shows it on each).
--
-- * get_product_color_cards: same parameters as SQL 78. Cards are grouped by brand + article +
--   colour. The article is the product name without its colour and size words (the shop's
--   sizes, 1–2 digit numbers such as 6 / 10 / 42, and XS–5XL). Shops that keep sizes inside one
--   product see the same cards as before. New columns: product_ids (every product of the
--   card), product_count, photo_count (how many of them have the photo).
-- * set_product_color_photo(org, product_ids, colour, image_url): saves one photo for all the
--   card's products (image_url NULL removes it), gives products with no main photo this one, and
--   returns the old photo files nothing uses any more (the page deletes them from storage).
-- SECURITY DEFINER with the membership check. Needs SQL 77 and 78.
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
  with_photo_count bigint,
  product_ids uuid[],
  product_count integer,
  photo_count integer
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
           nullif(nullif(btrim(coalesce(v.size, '')), ''), 'None') AS size, coalesce(v.stock_qty, 0) AS stock
    FROM prod
    JOIN product_variants v ON v.product_id = prod.id AND v.deleted_at IS NULL AND v.active IS DISTINCT FROM false
  ),
  -- The shop's size words, so a size typed in a product name can be taken out of it.
  size_words AS (
    SELECT DISTINCT lower(vcol.size) AS w FROM vcol WHERE vcol.size IS NOT NULL
  ),
  pcards AS (
    -- One card per product colour whatever its case ("BK" / "bk"); shown as typed, capitals preferred.
    SELECT vcol.pid, (array_agg(vcol.col ORDER BY (vcol.col = upper(vcol.col)) DESC, vcol.col))[1] AS col,
           array_remove(array_agg(DISTINCT vcol.size), NULL) AS size_arr,
           sum(vcol.stock) AS stock
    FROM vcol
    GROUP BY vcol.pid, lower(vcol.col)
    UNION ALL
    -- A product with no sizes yet still gets one card.
    SELECT prod.id, btrim(coalesce(prod.color, '')), ARRAY[]::text[], 0
    FROM prod
    WHERE NOT EXISTS (SELECT 1 FROM vcol WHERE vcol.pid = prod.id)
  ),
  -- The product name without the card's colour ("1490 (3095) 10 BLACK" → "1490 (3095) 10").
  named AS (
    SELECT pc.pid, pc.col, pc.size_arr, pc.stock, prod.product_name, prod.brand, prod.category, prod.style,
           prod.image_url AS p_img, prod.created_at,
           CASE WHEN pc.col = '' THEN prod.product_name
                ELSE regexp_replace(prod.product_name,
                       '\m' || regexp_replace(pc.col, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M', ' ', 'gi')
           END AS name_nc
    FROM pcards pc
    JOIN prod ON prod.id = pc.pid
  ),
  words AS (
    SELECT n.pid, lower(n.col) AS lc, t.w, t.ord,
           (lower(t.w) IN (SELECT size_words.w FROM size_words)
            OR t.w ~ '^[0-9]{1,2}([.][05])?$'
            OR upper(t.w) IN ('XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL')) AS is_size
    FROM named n
    CROSS JOIN LATERAL regexp_split_to_table(btrim(n.name_nc), '\s+') WITH ORDINALITY AS t(w, ord)
    WHERE t.w <> ''
  ),
  article AS (
    SELECT words.pid, words.lc,
           string_agg(words.w, ' ' ORDER BY words.ord) FILTER (WHERE NOT words.is_size) AS art,
           array_remove(array_agg(words.w) FILTER (WHERE words.is_size), NULL) AS name_sizes
    FROM words
    GROUP BY words.pid, words.lc
  ),
  keyed AS (
    SELECT n.*, ci.image_url AS c_img, ci.updated_at AS c_at,
           coalesce(nullif(btrim(a.art), ''), nullif(btrim(n.name_nc), ''), n.product_name) AS art,
           n.size_arr || coalesce(a.name_sizes, ARRAY[]::text[]) AS all_sizes,
           lower(btrim(coalesce(n.brand, ''))) || '|' ||
             lower(coalesce(nullif(btrim(a.art), ''), nullif(btrim(n.name_nc), ''), n.product_name)) || '|' ||
             lower(n.col) AS gkey
    FROM named n
    LEFT JOIN article a ON a.pid = n.pid AND a.lc = lower(n.col)
    LEFT JOIN product_color_images ci
      ON ci.product_id = n.pid AND lower(btrim(ci.color)) = lower(n.col)
    WHERE v_color IS NULL OR lower(n.col) = v_color
  ),
  gsizes AS (
    SELECT d.gkey,
           string_agg(d.s, ', ' ORDER BY (d.s ~ '^[0-9]+([.][0-9]+)?$') DESC,
                      CASE WHEN d.s ~ '^[0-9]+([.][0-9]+)?$' THEN d.s::numeric END, d.s) AS sizes
    FROM (SELECT DISTINCT keyed.gkey, upper(s) AS s FROM keyed CROSS JOIN LATERAL unnest(keyed.all_sizes) AS s) d
    GROUP BY d.gkey
  ),
  grp AS (
    SELECT k.gkey,
           (array_agg(k.pid ORDER BY k.c_img IS NULL, k.created_at DESC, k.product_name))[1] AS pid,
           array_agg(k.pid ORDER BY k.created_at DESC, k.product_name) AS pids,
           (array_agg(k.art ORDER BY k.created_at DESC, k.product_name))[1] AS art,
           (array_agg(k.brand ORDER BY k.created_at DESC))[1] AS brand,
           (array_agg(k.category ORDER BY k.created_at DESC))[1] AS category,
           (array_agg(k.style ORDER BY k.created_at DESC))[1] AS style,
           (array_agg(k.col ORDER BY (k.col = upper(k.col)) DESC, k.col))[1] AS col,
           (array_agg(k.c_img ORDER BY k.c_at DESC NULLS LAST) FILTER (WHERE k.c_img IS NOT NULL))[1] AS c_img,
           (array_agg(k.p_img ORDER BY k.created_at DESC) FILTER (WHERE nullif(btrim(k.p_img), '') IS NOT NULL))[1] AS p_img,
           sum(k.stock) AS stock,
           max(k.created_at) AS created_at,
           count(*)::integer AS n,
           (count(*) FILTER (WHERE k.c_img IS NOT NULL))::integer AS n_photo
    FROM keyed k
    GROUP BY k.gkey
  ),
  filtered AS (
    SELECT * FROM grp
    WHERE v_photo = 'all'
       OR (v_photo = 'missing' AND grp.c_img IS NULL)
       OR (v_photo = 'with' AND grp.c_img IS NOT NULL)
  )
  SELECT f.pid, f.art, f.brand, f.category, f.style, f.col, f.c_img, f.p_img, gs.sizes, f.stock,
         count(*) OVER (),
         (SELECT count(*) FROM grp),
         (SELECT count(*) FROM grp WHERE grp.c_img IS NOT NULL),
         f.pids, f.n, f.n_photo
  FROM filtered f
  LEFT JOIN gsizes gs ON gs.gkey = f.gkey
  ORDER BY f.created_at DESC, f.art, f.col
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 60), 200))
  OFFSET GREATEST(0, coalesce(p_offset, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_color_cards(uuid, text, boolean, integer, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_color_cards(uuid, text, boolean, integer, integer, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_product_color_photo(
  p_org_id uuid,
  p_product_ids uuid[],
  p_color text,
  p_image_url text
)
RETURNS TABLE (unused_url text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_col text := btrim(coalesce(p_color, ''));
  v_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_ids uuid[];
  v_old text[];
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF coalesce(cardinality(p_product_ids), 0) = 0 OR cardinality(p_product_ids) > 500 THEN
    RAISE EXCEPTION 'Give 1 to 500 products';
  END IF;
  IF v_url IS NOT NULL AND v_url !~* '^https?://' THEN
    RAISE EXCEPTION 'Photo address must start with http(s)://';
  END IF;

  -- Only this shop's products.
  SELECT array_agg(DISTINCT p.id) INTO v_ids
  FROM products p
  WHERE p.id = ANY (p_product_ids) AND p.organization_id = p_org_id AND p.deleted_at IS NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Products not found';
  END IF;

  SELECT array_agg(DISTINCT ci.image_url) INTO v_old
  FROM product_color_images ci
  WHERE ci.organization_id = p_org_id AND ci.product_id = ANY (v_ids) AND lower(btrim(ci.color)) = lower(v_col);

  IF v_url IS NULL THEN
    DELETE FROM product_color_images ci
    WHERE ci.organization_id = p_org_id AND ci.product_id = ANY (v_ids) AND lower(btrim(ci.color)) = lower(v_col);
  ELSE
    INSERT INTO product_color_images AS ci (organization_id, product_id, color, image_url)
    SELECT p_org_id, x.id, v_col, v_url FROM unnest(v_ids) AS x(id)
    ON CONFLICT (product_id, lower(btrim(color)))
    DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = now();
    -- Screens that show one photo per product (catalogue, reports) get this one when they have none.
    UPDATE products p SET image_url = v_url
    WHERE p.id = ANY (v_ids) AND p.organization_id = p_org_id AND nullif(btrim(coalesce(p.image_url, '')), '') IS NULL;
  END IF;

  RETURN QUERY
  SELECT u FROM unnest(coalesce(v_old, ARRAY[]::text[])) AS u
  WHERE u IS DISTINCT FROM v_url
    AND NOT EXISTS (SELECT 1 FROM product_color_images ci WHERE ci.image_url = u)
    AND NOT EXISTS (SELECT 1 FROM products p WHERE p.image_url = u);
END;
$$;

REVOKE ALL ON FUNCTION public.set_product_color_photo(uuid, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_color_photo(uuid, uuid[], text, text) TO authenticated, service_role;

-- Checks (read-only) after running:
--   SELECT product_name, color, sizes, product_count
--   FROM public.get_product_color_cards('<your organization id>', '1490') LIMIT 20;
