-- One customer, one mobile number, across the ERP, CRM points, the website and the
-- Bill & Offers app.
--
-- 1. push_campaigns gets an optional website discount, so an offer code sent from
--    Customer notifications can be applied at website checkout (percent or flat,
--    with an optional minimum order). Offers without these columns set still
--    validate on the website; the shop applies the discount at billing.
-- 2. get_public_storefront_customer_perks(slug, phone): the website checkout shows
--    the shopper's reward points (and the shop's redemption rules) once they type
--    their mobile number. It returns no name or other customer data.
-- 3. check_public_storefront_offer_code(slug, code): the website checks a code
--    against the shop's live offers.
--
-- Both RPCs are anon-callable, need a published store, and are throttled per
-- client in website_enquiry_rate_limits (separate keys from enquiries).
-- trg_revoke_public_execute_on_new_functions strips anon on CREATE; the GRANTs at
-- the end of this file put it back, as the enquiry RPC's migration does.

ALTER TABLE public.push_campaigns
  ADD COLUMN IF NOT EXISTS website_discount_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS website_discount_flat numeric(12,2),
  ADD COLUMN IF NOT EXISTS website_min_order numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_campaigns_website_discount_check'
  ) THEN
    ALTER TABLE public.push_campaigns
      ADD CONSTRAINT push_campaigns_website_discount_check CHECK (
        (website_discount_percent IS NULL OR (website_discount_percent > 0 AND website_discount_percent <= 90))
        AND (website_discount_flat IS NULL OR website_discount_flat > 0)
        AND (website_min_order IS NULL OR website_min_order >= 0)
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.push_campaigns.website_discount_percent IS
  'Percent off the website order when the shopper enters this offer code. Null = no automatic website discount.';
COMMENT ON COLUMN public.push_campaigns.website_discount_flat IS
  'Rupees off the website order when the shopper enters this offer code. Used when percent is null.';
COMMENT ON COLUMN public.push_campaigns.website_min_order IS
  'Minimum website order total for the code discount to apply.';

-- Shared throttle for the two lookups below. Returns false when over the limit.
CREATE OR REPLACE FUNCTION public.storefront_public_lookup_rate_ok(
  p_org uuid,
  p_kind text,
  p_fallback text,
  p_max int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fwd text;
  v_key text;
  v_now timestamptz := clock_timestamp();
  v_started timestamptz;
  v_hits int;
BEGIN
  BEGIN
    v_fwd := nullif(trim(split_part(
      coalesce((current_setting('request.headers', true)::json ->> 'x-forwarded-for'), ''),
      ',',
      1
    )), '');
  EXCEPTION WHEN OTHERS THEN
    v_fwd := NULL;
  END;
  v_key := left(p_kind || ':' || coalesce(v_fwd, p_fallback, ''), 64);

  SELECT r.window_started_at, r.hit_count
    INTO v_started, v_hits
  FROM public.website_enquiry_rate_limits r
  WHERE r.organization_id = p_org AND r.client_ip = v_key;

  IF v_started IS NOT NULL AND v_now - v_started < interval '1 hour' THEN
    IF coalesce(v_hits, 0) >= p_max THEN
      RETURN false;
    END IF;
    v_hits := coalesce(v_hits, 0) + 1;
  ELSE
    v_started := v_now;
    v_hits := 1;
  END IF;

  INSERT INTO public.website_enquiry_rate_limits (organization_id, client_ip, window_started_at, hit_count)
  VALUES (p_org, v_key, v_started, v_hits)
  ON CONFLICT (organization_id, client_ip) DO UPDATE
  SET window_started_at = EXCLUDED.window_started_at,
      hit_count = EXCLUDED.hit_count;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.storefront_public_lookup_rate_ok(uuid, text, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_public_lookup_rate_ok(uuid, text, text, int) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_storefront_customer_perks(
  p_slug text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_last10 text;
  v_org uuid;
  v_sub text;
  v_page_on boolean;
  v_ss jsonb;
  v_points_on boolean;
  v_points numeric;
  v_known boolean := false;
BEGIN
  IF length(v_digits) < 10 OR length(v_digits) > 15 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_mobile');
  END IF;
  v_last10 := right(v_digits, 10);

  SELECT r.id INTO v_org FROM public.resolve_organization_by_public_slug(v_slug) r;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.website_settings ws
    WHERE ws.organization_id = v_org AND ws.is_published IS TRUE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_published');
  END IF;

  IF NOT public.storefront_public_lookup_rate_ok(v_org, 'perks', v_last10, 30) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'status', 429);
  END IF;

  SELECT s.sale_settings::jsonb INTO v_ss FROM public.settings s WHERE s.organization_id = v_org;
  v_ss := coalesce(v_ss, '{}'::jsonb);
  v_points_on := coalesce((v_ss ->> 'enable_points_system')::boolean, false);

  -- Same mobile can sit on more than one customer row; show the larger balance.
  SELECT c.points_balance INTO v_points
  FROM public.customers c
  WHERE c.organization_id = v_org
    AND c.deleted_at IS NULL
    AND c.phone LIKE '%' || v_last10
    AND right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_last10
  ORDER BY coalesce(c.points_balance, 0) DESC
  LIMIT 1;
  v_known := FOUND;

  SELECT o.public_subdomain INTO v_sub FROM public.organizations o WHERE o.id = v_org;
  SELECT cps.enabled INTO v_page_on FROM public.customer_page_settings cps WHERE cps.organization_id = v_org;

  RETURN jsonb_build_object(
    'ok', true,
    'known', v_known,
    'points_enabled', v_points_on,
    'points', CASE WHEN v_points_on THEN greatest(0, floor(coalesce(v_points, 0))) ELSE 0 END,
    'redemption_enabled', v_points_on AND coalesce((v_ss ->> 'enable_points_redemption')::boolean, false),
    'point_value', coalesce(nullif(v_ss ->> 'points_redemption_value', '')::numeric, 1),
    'min_points', coalesce(nullif(v_ss ->> 'min_points_for_redemption', '')::numeric, 1),
    'max_redeem_percent', coalesce(nullif(v_ss ->> 'max_redemption_percent', '')::numeric, 50),
    'min_purchase_for_redemption', coalesce(nullif(v_ss ->> 'min_purchase_for_redemption', '')::numeric, 0),
    'app_subdomain', CASE WHEN v_page_on IS TRUE THEN nullif(btrim(coalesce(v_sub, '')), '') ELSE NULL END
  );
EXCEPTION WHEN invalid_text_representation THEN
  -- A malformed sale_settings value must not break checkout.
  RETURN jsonb_build_object('ok', false, 'error', 'settings_unreadable');
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_storefront_customer_perks(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_customer_perks(text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_public_storefront_offer_code(
  p_slug text,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_org uuid;
  v_offer record;
BEGIN
  IF v_code = '' OR length(v_code) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT r.id INTO v_org FROM public.resolve_organization_by_public_slug(v_slug) r;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.website_settings ws
    WHERE ws.organization_id = v_org AND ws.is_published IS TRUE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_published');
  END IF;

  IF NOT public.storefront_public_lookup_rate_ok(v_org, 'code', v_code, 20) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'status', 429);
  END IF;

  SELECT pc.offer_code, pc.title, pc.valid_till,
         pc.website_discount_percent, pc.website_discount_flat, pc.website_min_order
    INTO v_offer
  FROM public.push_campaigns pc
  WHERE pc.organization_id = v_org
    AND pc.status IN ('sending', 'done')
    AND upper(btrim(coalesce(pc.offer_code, ''))) = v_code
    AND (pc.valid_till IS NULL OR pc.valid_till >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
  ORDER BY pc.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'valid', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'valid', true,
    'code', upper(btrim(v_offer.offer_code)),
    'title', v_offer.title,
    'valid_till', v_offer.valid_till,
    'discount_percent', v_offer.website_discount_percent,
    'discount_flat', v_offer.website_discount_flat,
    'min_order', v_offer.website_min_order
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_public_storefront_offer_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_public_storefront_offer_code(text, text) TO anon, authenticated, service_role;
