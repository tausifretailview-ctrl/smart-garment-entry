-- Street store: live shop signals from the shop's own bills and purchases.
--
--   get_public_storefront_signals(slug)  anon: for a published store, which listed products are
--     best_sellers     top 10 by quantity sold in the last 7 days (on 2 or more bills), best first
--     selling_fast     sold on 3 or more bills in the last 3 days
--     just_arrived     on a purchase bill entered in the last 7 days, newest first (24 at most)
--     bought_together  for each product, up to 4 others most often on the same bill (90 days,
--                      together on 2 or more bills): "Complete the look"
-- Only product ids and arrival dates are returned: no quantities, amounts or customer details.
-- The shop can switch it off in Website -> Theme (organizations.settings.storefront_signals
-- = {"enabled": false}); the function then returns empty lists.
--
-- The lists are worked out at most once every 30 minutes per shop and kept in
-- storefront_signals_cache, so store visits do not re-read the bills each time.
-- Safe to run more than once.
-- UNDO: DROP FUNCTION public.get_public_storefront_signals(text);
--       DROP TABLE public.storefront_signals_cache;

CREATE TABLE IF NOT EXISTS public.storefront_signals_cache (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

-- No policies on purpose: only the SECURITY DEFINER function below reads or writes it.
ALTER TABLE public.storefront_signals_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_signals_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.storefront_signals_cache TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_storefront_signals(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empty constant jsonb := '{"best_sellers":[],"selling_fast":[],"just_arrived":[],"bought_together":[]}'::jsonb;
  v_org uuid;
  v_published boolean;
  v_switch text;
  v_cached jsonb;
  v_cached_at timestamptz;
  v_out jsonb;
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN
    RETURN v_empty;
  END IF;

  SELECT r.id INTO v_org FROM public.resolve_organization_by_public_slug(p_slug) r;
  IF v_org IS NULL THEN
    RETURN v_empty;
  END IF;

  SELECT ws.is_published INTO v_published
  FROM public.website_settings ws
  WHERE ws.organization_id = v_org;
  IF v_published IS NOT TRUE THEN
    RETURN v_empty;
  END IF;

  -- On unless the shop switched it off.
  SELECT o.settings #>> '{storefront_signals,enabled}' INTO v_switch
  FROM public.organizations o
  WHERE o.id = v_org;
  IF lower(coalesce(v_switch, 'true')) = 'false' THEN
    RETURN v_empty;
  END IF;

  SELECT c.payload, c.computed_at INTO v_cached, v_cached_at
  FROM public.storefront_signals_cache c
  WHERE c.organization_id = v_org;
  IF v_cached IS NOT NULL AND v_cached_at > now() - interval '30 minutes' THEN
    RETURN v_cached;
  END IF;

  WITH listed AS (
    SELECT DISTINCT w.product_id
    FROM public.website_products w
    WHERE w.organization_id = v_org AND w.is_active
  ),
  -- Bill lines of listed products in the last 90 days (saved bills only: not held, not cancelled).
  recent AS (
    SELECT si.product_id, si.sale_id, si.quantity, s.sale_date
    FROM public.sales s
    JOIN public.sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
    JOIN listed l ON l.product_id = si.product_id
    WHERE s.organization_id = v_org
      AND s.deleted_at IS NULL
      AND coalesce(s.is_cancelled, false) = false
      AND lower(coalesce(s.payment_status, '')) <> 'hold'
      AND s.sale_date >= now() - interval '90 days'
  ),
  best AS (
    SELECT r.product_id, sum(r.quantity) AS qty, count(DISTINCT r.sale_id) AS bills
    FROM recent r
    WHERE r.sale_date >= now() - interval '7 days'
    GROUP BY r.product_id
    HAVING count(DISTINCT r.sale_id) >= 2
    ORDER BY sum(r.quantity) DESC, count(DISTINCT r.sale_id) DESC, r.product_id
    LIMIT 10
  ),
  fast AS (
    SELECT r.product_id, count(DISTINCT r.sale_id) AS bills
    FROM recent r
    WHERE r.sale_date >= now() - interval '3 days'
    GROUP BY r.product_id
    HAVING count(DISTINCT r.sale_id) >= 3
    ORDER BY count(DISTINCT r.sale_id) DESC, r.product_id
    LIMIT 40
  ),
  arrived AS (
    SELECT pi.product_id, max(coalesce(pb.bill_entry_at, pb.created_at)) AS arrived_at
    FROM public.purchase_bills pb
    JOIN public.purchase_items pi ON pi.bill_id = pb.id AND pi.deleted_at IS NULL
    JOIN listed l ON l.product_id = pi.product_id
    WHERE pb.organization_id = v_org
      AND pb.deleted_at IS NULL
      AND coalesce(pb.is_cancelled, false) = false
      AND coalesce(pb.bill_entry_at, pb.created_at) >= now() - interval '7 days'
    GROUP BY pi.product_id
    ORDER BY max(coalesce(pb.bill_entry_at, pb.created_at)) DESC, pi.product_id
    LIMIT 24
  ),
  on_bill AS (
    SELECT DISTINCT r.product_id, r.sale_id FROM recent r
  ),
  pairs AS (
    SELECT a.product_id, b.product_id AS other_id, count(*) AS together
    FROM on_bill a
    JOIN on_bill b ON b.sale_id = a.sale_id AND b.product_id <> a.product_id
    GROUP BY a.product_id, b.product_id
    HAVING count(*) >= 2
  ),
  ranked AS (
    SELECT p.product_id, p.other_id, p.together,
           row_number() OVER (PARTITION BY p.product_id ORDER BY p.together DESC, p.other_id) AS rn
    FROM pairs p
  ),
  looks AS (
    SELECT k.product_id, jsonb_agg(k.other_id ORDER BY k.together DESC, k.other_id) AS with_ids
    FROM ranked k
    WHERE k.rn <= 4
    GROUP BY k.product_id
  )
  SELECT jsonb_build_object(
    'best_sellers', coalesce((SELECT jsonb_agg(b.product_id ORDER BY b.qty DESC, b.bills DESC, b.product_id) FROM best b), '[]'::jsonb),
    'selling_fast', coalesce((SELECT jsonb_agg(f.product_id ORDER BY f.bills DESC, f.product_id) FROM fast f), '[]'::jsonb),
    'just_arrived', coalesce((
      SELECT jsonb_agg(jsonb_build_object('product_id', a.product_id, 'at', a.arrived_at) ORDER BY a.arrived_at DESC, a.product_id)
      FROM arrived a
    ), '[]'::jsonb),
    'bought_together', coalesce((
      SELECT jsonb_agg(jsonb_build_object('product_id', k.product_id, 'with', k.with_ids) ORDER BY k.product_id)
      FROM looks k
    ), '[]'::jsonb)
  ) INTO v_out;

  INSERT INTO public.storefront_signals_cache (organization_id, payload, computed_at)
  VALUES (v_org, v_out, now())
  ON CONFLICT (organization_id) DO UPDATE
  SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_storefront_signals(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_signals(text) TO anon, authenticated, service_role;
