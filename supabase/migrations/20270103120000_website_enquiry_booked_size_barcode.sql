-- Record the variant a customer booked on the public store so the
-- website Enquiries tab can show that piece's size and barcode.
-- The storefront keeps calling submit_public_storefront_enquiry with the
-- same arguments and puts [v:<variant uuid>] in the message. This function
-- copies size and barcode from product_variants in the same organization.

ALTER TABLE public.website_enquiries
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS booked_pieces jsonb;

COMMENT ON COLUMN public.website_enquiries.variant_id IS
  'First variant the customer booked. Null on older enquiries and on visits that did not pick a piece.';
COMMENT ON COLUMN public.website_enquiries.size IS
  'Size of the first booked variant, copied from product_variants.';
COMMENT ON COLUMN public.website_enquiries.barcode IS
  'Barcode of the first booked variant, copied from product_variants.';
COMMENT ON COLUMN public.website_enquiries.booked_pieces IS
  'Every booked piece: [{variant_id, product_id, size, barcode}]. Null on rows written before this column existed.';

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
  v_pieces jsonb := '[]'::jsonb;
  v_first_variant uuid;
  v_first_size text;
  v_first_barcode text;
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

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'variant_id', picked.id,
               'product_id', picked.product_id,
               'size', NULLIF(btrim(coalesce(picked.size, '')), ''),
               'barcode', NULLIF(btrim(coalesce(picked.barcode, '')), '')
             )
             ORDER BY picked.ord
           ),
           '[]'::jsonb
         ),
         (array_agg(picked.id ORDER BY picked.ord))[1],
         (array_agg(NULLIF(btrim(coalesce(picked.size, '')), '') ORDER BY picked.ord))[1],
         (array_agg(NULLIF(btrim(coalesce(picked.barcode, '')), '') ORDER BY picked.ord))[1]
    INTO v_pieces, v_first_variant, v_first_size, v_first_barcode
  FROM (
    SELECT DISTINCT ON (pv.id)
      pv.id,
      pv.product_id,
      pv.size,
      pv.barcode,
      src.ord
    FROM (
      SELECT (m)[1]::uuid AS vid, ord
      FROM regexp_matches(
        v_message,
        '\[v:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]',
        'gi'
      ) WITH ORDINALITY AS t(m, ord)
    ) src
    JOIN public.product_variants pv
      ON pv.id = src.vid
     AND pv.organization_id = v_org
     AND pv.deleted_at IS NULL
     AND (p_product_id IS NULL OR pv.product_id = p_product_id)
    ORDER BY pv.id, src.ord
  ) picked;

  IF v_pieces IS NULL THEN
    v_pieces := '[]'::jsonb;
  END IF;

  INSERT INTO public.website_enquiries (
    organization_id,
    product_id,
    customer_name,
    customer_phone,
    message,
    status,
    variant_id,
    size,
    barcode,
    booked_pieces
  )
  VALUES (
    v_org,
    p_product_id,
    v_name,
    v_phone,
    NULLIF(v_message, ''),
    'new',
    v_first_variant,
    v_first_size,
    v_first_barcode,
    v_pieces
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_storefront_enquiry(text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_storefront_enquiry(text, text, text, text, uuid)
  TO anon, authenticated, service_role;
