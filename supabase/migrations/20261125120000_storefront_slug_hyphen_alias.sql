-- Customers type the shop name without hyphens (Ellanoor → /ellanoor/store)
-- while organizations.slug is ella-noor. Exact slug miss returns published=false
-- ("Catalogue unavailable") and org login 404s.

CREATE OR REPLACE FUNCTION public.resolve_organization_by_public_slug(p_slug text)
RETURNS TABLE (id uuid, name text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug
  FROM public.organizations o
  WHERE p_slug IS NOT NULL
    AND length(btrim(p_slug)) > 0
    AND replace(lower(o.slug), '-', '') = replace(lower(btrim(p_slug)), '-', '')
  ORDER BY CASE WHEN lower(o.slug) = lower(btrim(p_slug)) THEN 0 ELSE 1 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_organization_by_public_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_organization_by_public_slug(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_org_public_info(p_slug text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'settings', o.settings,
    'business_name', s.business_name,
    'bill_barcode_settings', s.bill_barcode_settings
  )
  FROM public.resolve_organization_by_public_slug(p_slug) r
  JOIN public.organizations o ON o.id = r.id
  LEFT JOIN public.settings s ON s.organization_id = o.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_org_public_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO service_role;

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

CREATE OR REPLACE FUNCTION public.submit_public_storefront_enquiry(
  p_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_message text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_name text := trim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_message text := trim(coalesce(p_message, ''));
  v_org uuid;
  v_published boolean;
  v_listed uuid;
  v_ip text;
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_hits int;
  v_fwd text;
BEGIN
  IF v_slug = '' OR length(v_slug) > 80 OR v_slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid store slug is required');
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter your name');
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter a valid mobile number');
  END IF;
  IF length(v_message) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Message is too long');
  END IF;

  SELECT r.id INTO v_org
  FROM public.resolve_organization_by_public_slug(v_slug) r;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Store not found');
  END IF;

  SELECT ws.is_published INTO v_published
  FROM public.website_settings ws
  WHERE ws.organization_id = v_org;

  IF v_published IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Store is not published');
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT wp.id INTO v_listed
    FROM public.website_products wp
    WHERE wp.organization_id = v_org
      AND wp.product_id = p_product_id
      AND wp.is_active = true
    LIMIT 1;
    IF v_listed IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This product is not available');
    END IF;
  END IF;

  BEGIN
    v_fwd := nullif(trim(split_part(
      coalesce((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ''),
      ',',
      1
    )), '');
  EXCEPTION WHEN OTHERS THEN
    v_fwd := NULL;
  END;

  v_ip := left('rpc:' || coalesce(v_fwd, v_phone), 64);

  SELECT r.window_started_at, r.hit_count
  INTO v_started, v_hits
  FROM public.website_enquiry_rate_limits r
  WHERE r.organization_id = v_org
    AND r.client_ip = v_ip;

  IF v_started IS NOT NULL AND v_now - v_started < interval '1 hour' THEN
    IF coalesce(v_hits, 0) >= 5 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Too many enquiries. Please try again later.', 'status', 429);
    END IF;
    v_hits := coalesce(v_hits, 0) + 1;
  ELSE
    v_started := v_now;
    v_hits := 1;
  END IF;

  INSERT INTO public.website_enquiry_rate_limits (
    organization_id, client_ip, window_started_at, hit_count
  )
  VALUES (v_org, v_ip, v_started, v_hits)
  ON CONFLICT (organization_id, client_ip) DO UPDATE
  SET window_started_at = EXCLUDED.window_started_at,
      hit_count = EXCLUDED.hit_count;

  INSERT INTO public.website_enquiries (
    organization_id, product_id, customer_name, customer_phone, message, status
  )
  VALUES (
    v_org,
    p_product_id,
    v_name,
    v_phone,
    NULLIF(v_message, ''),
    'new'
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_storefront_enquiry(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_storefront_enquiry(text, text, text, text, uuid)
  TO anon, authenticated, service_role;

