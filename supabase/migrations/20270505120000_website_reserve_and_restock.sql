-- Street store: "Reserve & try in store" and "Tell me when it's back".
--
-- Both are a customer leaving name + mobile for one size of a product. They are saved in
-- website_enquiries (Website -> Enquiries), so the public website never writes into bills:
--   kind = 'reserve'  the size is in stock; the shop keeps a piece aside until hold_until (24 hours)
--   kind = 'restock'  the size is sold out; the shop sees who is waiting and messages them when
--                     it is back in stock
--   kind = 'enquiry'  everything that existed before (default)
--
--   rpc submit_public_storefront_request(slug, kind, name, phone, product, variant)   anon
--   get_org_public_info: adds store_features (so the website only shows these buttons once this
--     file has run) and settings.storefront_requests (the shop's on/off switches).
--
-- get_org_public_info here includes everything from 20270502120000 (size helper). If you run
-- that older file after this one, run this one again.
-- Safe to run more than once.
-- UNDO: DROP FUNCTION public.submit_public_storefront_request(text, text, text, text, uuid, uuid);
--       ALTER TABLE public.website_enquiries DROP COLUMN kind, DROP COLUMN hold_until;
--       then re-run 20270502120000_org_public_info_size_helper.sql

ALTER TABLE public.website_enquiries
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'enquiry',
  ADD COLUMN IF NOT EXISTS hold_until timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'website_enquiries_kind_chk') THEN
    ALTER TABLE public.website_enquiries
      ADD CONSTRAINT website_enquiries_kind_chk CHECK (kind IN ('enquiry', 'reserve', 'restock'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS website_enquiries_org_kind_variant_idx
  ON public.website_enquiries (organization_id, kind, variant_id)
  WHERE kind <> 'enquiry';

COMMENT ON COLUMN public.website_enquiries.kind IS
  'enquiry (default), reserve (keep a piece aside until hold_until) or restock (tell me when this size is back).';
COMMENT ON COLUMN public.website_enquiries.hold_until IS
  'Reserve & try: the shop keeps the piece aside until this time. Null for other kinds.';

CREATE OR REPLACE FUNCTION public.submit_public_storefront_request(
  p_slug text,
  p_kind text,
  p_customer_name text,
  p_customer_phone text,
  p_product_id uuid,
  p_variant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_name text := trim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_org uuid;
  v_published boolean;
  v_switch text;
  v_size text;
  v_barcode text;
  v_stock numeric;
  v_existing_until timestamptz;
  v_existing uuid;
  v_open int;
  v_held int;
  v_until timestamptz;
BEGIN
  IF v_kind NOT IN ('reserve', 'restock') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request is not available');
  END IF;
  IF v_slug = '' OR length(v_slug) > 80 OR v_slug !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid store slug is required');
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter your name');
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please enter a valid mobile number');
  END IF;
  IF p_product_id IS NULL OR p_variant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please choose a size');
  END IF;

  SELECT r.id INTO v_org FROM public.resolve_organization_by_public_slug(v_slug) r;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Store not found');
  END IF;

  SELECT ws.is_published INTO v_published
  FROM public.website_settings ws
  WHERE ws.organization_id = v_org;
  IF v_published IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Store is not published');
  END IF;

  -- The shop's switch for this kind (Website -> Theme); on unless switched off.
  SELECT o.settings #>> ARRAY['storefront_requests', v_kind] INTO v_switch
  FROM public.organizations o
  WHERE o.id = v_org;
  IF lower(coalesce(v_switch, 'true')) = 'false' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This request is not available');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.website_products wp
    WHERE wp.organization_id = v_org AND wp.product_id = p_product_id AND wp.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This product is not available');
  END IF;

  SELECT NULLIF(btrim(coalesce(pv.size, '')), ''), NULLIF(btrim(coalesce(pv.barcode, '')), ''), coalesce(pv.stock_qty, 0)
    INTO v_size, v_barcode, v_stock
  FROM public.product_variants pv
  WHERE pv.id = p_variant_id
    AND pv.product_id = p_product_id
    AND pv.organization_id = v_org
    AND pv.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This size is not available');
  END IF;

  IF NOT public.storefront_public_lookup_rate_ok(v_org, 'request', v_phone, 8) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Please try again later.', 'status', 429);
  END IF;

  -- The same person asking again for the same size gets the same answer, not a second row.
  SELECT e.id, e.hold_until INTO v_existing, v_existing_until
  FROM public.website_enquiries e
  WHERE e.organization_id = v_org
    AND e.kind = v_kind
    AND e.variant_id = p_variant_id
    AND e.customer_phone = v_phone
    AND e.status = 'new'
    AND (v_kind = 'restock' OR e.hold_until > now())
  ORDER BY e.created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'size', v_size, 'hold_until', v_existing_until);
  END IF;

  IF v_kind = 'reserve' THEN
    IF v_stock <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This size is sold out right now');
    END IF;
    -- One mobile number can hold three pieces at a time.
    SELECT count(*) INTO v_open
    FROM public.website_enquiries e
    WHERE e.organization_id = v_org AND e.kind = 'reserve' AND e.customer_phone = v_phone
      AND e.status = 'new' AND e.hold_until > now();
    IF v_open >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You already have 3 pieces reserved. Please visit the shop first.');
    END IF;
    -- Never more reservations for a size than pieces the shop has.
    SELECT count(*) INTO v_held
    FROM public.website_enquiries e
    WHERE e.organization_id = v_org AND e.kind = 'reserve' AND e.variant_id = p_variant_id
      AND e.status = 'new' AND e.hold_until > now();
    IF v_held >= v_stock THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Every piece of this size is reserved right now. Please try again later.');
    END IF;
    v_until := now() + interval '24 hours';
  ELSE
    IF v_stock > 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Good news: this size is in stock now. Reload the page to buy it.');
    END IF;
    SELECT count(*) INTO v_open
    FROM public.website_enquiries e
    WHERE e.organization_id = v_org AND e.kind = 'restock' AND e.customer_phone = v_phone AND e.status = 'new';
    IF v_open >= 10 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'You are already waiting for 10 sizes. We will message you when they are back.');
    END IF;
    v_until := NULL;
  END IF;

  INSERT INTO public.website_enquiries (
    organization_id, product_id, customer_name, customer_phone, message, status,
    kind, hold_until, variant_id, size, barcode, booked_pieces
  )
  VALUES (
    v_org, p_product_id, v_name, v_phone,
    CASE WHEN v_kind = 'reserve'
      THEN 'Reserve & try in store' || coalesce(' · size ' || v_size, '')
      ELSE 'Tell me when it is back' || coalesce(' · size ' || v_size, '')
    END,
    'new', v_kind, v_until, p_variant_id, v_size, v_barcode,
    jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant_id, 'product_id', p_product_id, 'size', v_size, 'barcode', v_barcode
    ))
  );

  RETURN jsonb_build_object('ok', true, 'size', v_size, 'hold_until', v_until);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_storefront_request(text, text, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_storefront_request(text, text, text, text, uuid, uuid)
  TO anon, authenticated, service_role;

-- ---------- get_org_public_info: store_features + the shop's request switches ----------
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
    -- What this database can do for the store, so the website only shows buttons that work.
    'store_features', json_build_array('reserve_try', 'restock_alert'),
    'settings', jsonb_strip_nulls(jsonb_build_object(
      'address', o.settings -> 'address',
      'mobile_number', o.settings -> 'mobile_number',
      'storefront_theme', o.settings -> 'storefront_theme',
      'storefront_banners', o.settings -> 'storefront_banners',
      'storefront_sections', o.settings -> 'storefront_sections',
      'storefront_product_sections', o.settings -> 'storefront_product_sections',
      'storefront_videos', o.settings -> 'storefront_videos',
      'storefront_showcase', o.settings -> 'storefront_showcase',
      'storefront_size_helper', o.settings -> 'storefront_size_helper',
      'storefront_requests', o.settings -> 'storefront_requests'
    )),
    'business_name', s.business_name,
    'bill_barcode_settings', jsonb_strip_nulls(jsonb_build_object(
      'logo_url', s.bill_barcode_settings -> 'logo_url',
      'login_display_name', s.bill_barcode_settings -> 'login_display_name',
      'brand_color', s.bill_barcode_settings -> 'brand_color',
      'upi_id', s.bill_barcode_settings -> 'upi_id',
      'upi_id_2', s.bill_barcode_settings -> 'upi_id_2',
      'active_upi_id', s.bill_barcode_settings -> 'active_upi_id',
      'upi_business_name', s.bill_barcode_settings -> 'upi_business_name',
      'instagram_link', s.bill_barcode_settings -> 'instagram_link'
    ))
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

NOTIFY pgrst, 'reload schema';
