-- Colour-wise product photos (Nov 2026): Product Master → Photos.
--
-- One photo per product and colour (not per size or MRP). Field Sales shows it while booking
-- an order. The photo files stay in the existing "product-images" storage bucket
-- (<organization_id>/<product_id>/...).
-- * product_color_images: organization_id, product_id, color ('' = no colour), image_url.
--   One row per product + colour (case and spaces ignored). Row rules: organization members.
-- * get_product_color_cards(org, search, only_missing, limit, offset): the product × colour
--   cards for the page, newest products first, with the colour photo, sizes and stock;
--   total_count = cards matching the filter (paging), all_count / with_photo_count = all cards
--   matching the search and how many have a photo (progress).
--   SECURITY DEFINER with the membership check; read-only.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.product_color_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_color_images_product_color_uidx
  ON public.product_color_images (product_id, lower(btrim(color)));
CREATE INDEX IF NOT EXISTS product_color_images_org_idx
  ON public.product_color_images (organization_id);

ALTER TABLE public.product_color_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_color_images_select ON public.product_color_images;
CREATE POLICY product_color_images_select ON public.product_color_images
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS product_color_images_write ON public.product_color_images;
CREATE POLICY product_color_images_write ON public.product_color_images
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.organization_id = product_color_images.organization_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_color_images TO authenticated;

CREATE OR REPLACE FUNCTION public.get_product_color_cards(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_only_missing boolean DEFAULT false,
  p_limit integer DEFAULT 60,
  p_offset integer DEFAULT 0
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
  ),
  filtered AS (
    SELECT * FROM full_cards WHERE NOT coalesce(p_only_missing, false) OR full_cards.c_img IS NULL
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

REVOKE ALL ON FUNCTION public.get_product_color_cards(uuid, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_color_cards(uuid, text, boolean, integer, integer) TO authenticated, service_role;

-- Checks (read-only) after running:
--   SELECT count(*) FROM public.product_color_images;
