-- Storefront collections (New Arrival, Eid Collection, …).
-- Admin assigns a section when publishing a website product.
-- Public catalogue returns sections + section fields on each product.

CREATE TABLE IF NOT EXISTS public.website_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_sections_label_len CHECK (char_length(btrim(label)) >= 1 AND char_length(label) <= 80),
  CONSTRAINT website_sections_slug_fmt CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT website_sections_org_slug_key UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS website_sections_org_order_idx
  ON public.website_sections (organization_id, display_order);

COMMENT ON TABLE public.website_sections IS
  'Admin-defined storefront collections. website_products.section_id assigns a listing to one section.';

CREATE TRIGGER trg_website_sections_updated_at
  BEFORE UPDATE ON public.website_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.website_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can view active sections of published stores" ON public.website_sections;
CREATE POLICY "Anon can view active sections of published stores"
  ON public.website_sections FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.website_settings ws
      WHERE ws.organization_id = website_sections.organization_id
        AND ws.is_published = true
    )
  );

DROP POLICY IF EXISTS "Org members can view website sections" ON public.website_sections;
CREATE POLICY "Org members can view website sections"
  ON public.website_sections FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can insert website sections" ON public.website_sections;
CREATE POLICY "Admins and managers can insert website sections"
  ON public.website_sections FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can update website sections" ON public.website_sections;
CREATE POLICY "Admins and managers can update website sections"
  ON public.website_sections FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can delete website sections" ON public.website_sections;
CREATE POLICY "Admins and managers can delete website sections"
  ON public.website_sections FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

REVOKE ALL ON TABLE public.website_sections FROM PUBLIC;
GRANT SELECT ON TABLE public.website_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.website_sections TO authenticated;
GRANT ALL ON TABLE public.website_sections TO service_role;

ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.website_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS website_products_org_section_idx
  ON public.website_products (organization_id, section_id);

INSERT INTO public.website_sections (organization_id, slug, label, display_order, is_active)
SELECT ws.organization_id, 'new-arrival', 'New Arrival', 0, true
FROM public.website_settings ws
ON CONFLICT (organization_id, slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_public_storefront(p_slug text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_org_name text;
  v_org_slug text;
  v_settings public.website_settings%ROWTYPE;
  v_products json;
  v_sections json;
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN
    RETURN json_build_object('published', false);
  END IF;

  SELECT r.id, r.name, r.slug
    INTO v_org_id, v_org_name, v_org_slug
  FROM public.resolve_organization_by_public_slug(p_slug) r;

  IF v_org_id IS NULL THEN
    RETURN json_build_object('published', false);
  END IF;

  SELECT * INTO v_settings
  FROM public.website_settings ws
  WHERE ws.organization_id = v_org_id;

  IF v_settings.organization_id IS NULL OR v_settings.is_published IS NOT TRUE THEN
    RETURN json_build_object(
      'published', false,
      'shop', json_build_object('name', v_org_name, 'slug', v_org_slug)
    );
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'id', sec.id,
    'slug', sec.slug,
    'label', sec.label,
    'display_order', sec.display_order
  ) ORDER BY
    CASE WHEN sec.slug = 'new-arrival' THEN 0 ELSE 1 END,
    sec.display_order,
    sec.label
  ), '[]'::json)
    INTO v_sections
  FROM public.website_sections sec
  WHERE sec.organization_id = v_org_id
    AND sec.is_active = true;

  SELECT COALESCE(json_agg(row_to_json(listed) ORDER BY listed.display_order, listed.name), '[]'::json)
    INTO v_products
  FROM (
    SELECT
      wp.id,
      wp.product_id,
      p.product_name AS name,
      p.brand,
      p.category,
      wp.display_order,
      wp.section_id,
      wsec.slug AS section_slug,
      wsec.label AS section_label,
      COALESCE(
        wp.display_price,
        CASE
          WHEN wp.variant_id IS NOT NULL THEN (
            SELECT pv.sale_price
            FROM public.product_variants pv
            WHERE pv.id = wp.variant_id
              AND pv.deleted_at IS NULL
          )
          ELSE (
            SELECT MIN(pv.sale_price)
            FROM public.product_variants pv
            WHERE pv.product_id = wp.product_id
              AND pv.organization_id = wp.organization_id
              AND pv.deleted_at IS NULL
              AND pv.sale_price IS NOT NULL
          )
        END,
        p.default_sale_price
      ) AS display_price,
      CASE
        WHEN COALESCE(cardinality(wp.photo_urls), 0) > 0 THEN wp.photo_urls
        WHEN p.image_url IS NOT NULL AND p.image_url <> '' THEN ARRAY[p.image_url]
        ELSE COALESCE((
          SELECT array_agg(pi.image_url ORDER BY pi.display_order)
          FROM (
            SELECT pim.image_url, pim.display_order
            FROM public.product_images pim
            WHERE pim.product_id = p.id
              AND pim.organization_id = wp.organization_id
            ORDER BY pim.display_order
            LIMIT 5
          ) pi
        ), ARRAY[]::text[])
      END AS photo_urls,
      CASE
        WHEN COALESCE(stock.qty, 0) <= 0 THEN 'out_of_stock'
        WHEN stock.qty <= 5 THEN 'low_stock'
        ELSE 'in_stock'
      END AS stock_status,
      CASE
        WHEN COALESCE(stock.qty, 0) > 0 AND stock.qty <= 5 THEN stock.qty
        ELSE NULL
      END AS stock_left,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', pv.id,
          'size', pv.size,
          'color', pv.color,
          'display_price', COALESCE(wp.display_price, pv.sale_price, p.default_sale_price),
          'stock_status', CASE
            WHEN COALESCE(pv.stock_qty, 0) <= 0 THEN 'out_of_stock'
            WHEN pv.stock_qty <= 5 THEN 'low_stock'
            ELSE 'in_stock'
          END,
          'stock_left', CASE
            WHEN COALESCE(pv.stock_qty, 0) > 0 AND pv.stock_qty <= 5 THEN pv.stock_qty
            ELSE NULL
          END
        ) ORDER BY pv.size, pv.color)
        FROM public.product_variants pv
        WHERE pv.product_id = wp.product_id
          AND pv.organization_id = wp.organization_id
          AND pv.deleted_at IS NULL
          AND (wp.variant_id IS NULL OR pv.id = wp.variant_id)
      ), '[]'::json) AS variants
    FROM public.website_products wp
    JOIN public.products p
      ON p.id = wp.product_id
     AND p.organization_id = wp.organization_id
     AND p.deleted_at IS NULL
    LEFT JOIN public.website_sections wsec
      ON wsec.id = wp.section_id
     AND wsec.organization_id = wp.organization_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pv.stock_qty), 0)::int AS qty
      FROM public.product_variants pv
      WHERE pv.product_id = wp.product_id
        AND pv.organization_id = wp.organization_id
        AND pv.deleted_at IS NULL
        AND (wp.variant_id IS NULL OR pv.id = wp.variant_id)
    ) stock ON true
    WHERE wp.organization_id = v_org_id
      AND wp.is_active = true
  ) listed;

  RETURN json_build_object(
    'published', true,
    'shop', json_build_object(
      'name', v_org_name,
      'slug', v_org_slug,
      'whatsapp_number', v_settings.whatsapp_number,
      'instagram_url', v_settings.instagram_url,
      'facebook_url', v_settings.facebook_url,
      'theme_accent_color', v_settings.theme_accent_color
    ),
    'products', COALESCE(v_products, '[]'::json),
    'sections', COALESCE(v_sections, '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_storefront(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO service_role;
