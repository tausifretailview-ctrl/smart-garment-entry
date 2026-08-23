-- Public Storefront Phase 1 (browse + enquiry).
-- Public visitors read ONLY through get_public_storefront (strips cost / supplier / raw stock).
-- Enquiries are written by the submit-storefront-enquiry edge function (service_role), not by anon PostgREST.

-- Allow the public catalogue RPC to stay anon-callable (event trigger otherwise revokes anon).
CREATE OR REPLACE FUNCTION public.revoke_public_execute_on_new_functions()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE command_tag IN ('CREATE FUNCTION','ALTER FUNCTION')
               AND schema_name = 'public'
  LOOP
    IF obj.objid::regprocedure::text NOT IN (
      'public.get_org_public_info(text)',
      'public.login_attempts_rate_ok(text)',
      'public.get_public_storefront(text)'
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', obj.objid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', obj.objid::regprocedure);
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.website_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  whatsapp_number text,
  instagram_url text,
  facebook_url text,
  theme_accent_color text,
  is_published boolean NOT NULL DEFAULT false,
  custom_domain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  display_price numeric,
  photo_urls text[] NOT NULL DEFAULT '{}',
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE (org, product, variant) cannot use a plain UNIQUE constraint: NULL variant_id
-- is distinct per row in Postgres. Two partial indexes cover both cases.
CREATE UNIQUE INDEX IF NOT EXISTS website_products_org_product_null_variant_uidx
  ON public.website_products (organization_id, product_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS website_products_org_product_variant_uidx
  ON public.website_products (organization_id, product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS website_products_org_active_order_idx
  ON public.website_products (organization_id, is_active, display_order);

CREATE TABLE IF NOT EXISTS public.website_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_enquiries_status_chk
    CHECK (status IN ('new', 'contacted', 'converted', 'closed'))
);

CREATE INDEX IF NOT EXISTS website_enquiries_org_created_idx
  ON public.website_enquiries (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS website_enquiries_org_status_idx
  ON public.website_enquiries (organization_id, status);

-- Service-role only. Used by the enquiry edge function for IP + org throttling.
CREATE TABLE IF NOT EXISTS public.website_enquiry_rate_limits (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_ip text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  hit_count int NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, client_ip)
);

COMMENT ON TABLE public.website_settings IS
  'Per-org public storefront profile. is_published gates the public page.';
COMMENT ON TABLE public.website_products IS
  'Explicitly published catalogue rows. Anon never reads products/product_variants directly.';
COMMENT ON TABLE public.website_enquiries IS
  'Leads from the public storefront Enquire form. Anon has no table access.';
COMMENT ON TABLE public.website_enquiry_rate_limits IS
  'Edge-function rate-limit counters (max 5 enquiries/hour per IP + org).';

CREATE TRIGGER trg_website_settings_updated_at
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_website_products_updated_at
  BEFORE UPDATE ON public.website_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_enquiry_rate_limits ENABLE ROW LEVEL SECURITY;

-- ---------- website_settings ----------
DROP POLICY IF EXISTS "Anon can view published website settings" ON public.website_settings;
CREATE POLICY "Anon can view published website settings"
  ON public.website_settings FOR SELECT TO anon
  USING (is_published = true);

DROP POLICY IF EXISTS "Org members can view website settings" ON public.website_settings;
CREATE POLICY "Org members can view website settings"
  ON public.website_settings FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can insert website settings" ON public.website_settings;
CREATE POLICY "Admins and managers can insert website settings"
  ON public.website_settings FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can update website settings" ON public.website_settings;
CREATE POLICY "Admins and managers can update website settings"
  ON public.website_settings FOR UPDATE TO authenticated
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

-- ---------- website_products ----------
DROP POLICY IF EXISTS "Anon can view active products of published stores" ON public.website_products;
CREATE POLICY "Anon can view active products of published stores"
  ON public.website_products FOR SELECT TO anon
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.website_settings ws
      WHERE ws.organization_id = website_products.organization_id
        AND ws.is_published = true
    )
  );

DROP POLICY IF EXISTS "Org members can view website products" ON public.website_products;
CREATE POLICY "Org members can view website products"
  ON public.website_products FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can insert website products" ON public.website_products;
CREATE POLICY "Admins and managers can insert website products"
  ON public.website_products FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can update website products" ON public.website_products;
CREATE POLICY "Admins and managers can update website products"
  ON public.website_products FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "Admins and managers can delete website products" ON public.website_products;
CREATE POLICY "Admins and managers can delete website products"
  ON public.website_products FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

-- ---------- website_enquiries (no anon table access) ----------
DROP POLICY IF EXISTS "Org members can view website enquiries" ON public.website_enquiries;
CREATE POLICY "Org members can view website enquiries"
  ON public.website_enquiries FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can update website enquiries" ON public.website_enquiries;
CREATE POLICY "Admins and managers can update website enquiries"
  ON public.website_enquiries FOR UPDATE TO authenticated
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

-- Rate-limit table: no policies → authenticated/anon get zero rows. service_role bypasses RLS.

REVOKE ALL ON TABLE public.website_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.website_products FROM PUBLIC;
REVOKE ALL ON TABLE public.website_enquiries FROM PUBLIC;
REVOKE ALL ON TABLE public.website_enquiry_rate_limits FROM PUBLIC;

GRANT SELECT ON TABLE public.website_settings TO anon;
GRANT SELECT ON TABLE public.website_products TO anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.website_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.website_products TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.website_enquiries TO authenticated;

GRANT ALL ON TABLE public.website_settings TO service_role;
GRANT ALL ON TABLE public.website_products TO service_role;
GRANT ALL ON TABLE public.website_enquiries TO service_role;
GRANT ALL ON TABLE public.website_enquiry_rate_limits TO service_role;

-- Public photos for the storefront (compressed on upload by the ERP admin page).
INSERT INTO storage.buckets (id, name, public)
VALUES ('website-photos', 'website-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view website photos" ON storage.objects;
CREATE POLICY "Public can view website photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'website-photos');

DROP POLICY IF EXISTS "Authenticated users can upload website photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload website photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'website-photos');

DROP POLICY IF EXISTS "Authenticated users can update website photos" ON storage.objects;
CREATE POLICY "Authenticated users can update website photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'website-photos');

DROP POLICY IF EXISTS "Authenticated users can delete website photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete website photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'website-photos');

-- Public read RPC: joins published rows and strips internal columns (cost, supplier, raw qty).
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
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN
    RETURN json_build_object('published', false);
  END IF;

  SELECT o.id, o.name, o.slug
    INTO v_org_id, v_org_name, v_org_slug
  FROM public.organizations o
  WHERE lower(o.slug) = lower(btrim(p_slug))
  LIMIT 1;

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
    'products', COALESCE(v_products, '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_storefront(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO service_role;
