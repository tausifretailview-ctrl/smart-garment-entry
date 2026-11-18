-- Website product reviews with photos (store feature 11).
--
-- A customer opens the review link for their bill (/review/<bill id>, the same unguessable id the
-- online invoice link uses), gives each product on the bill 1-5 stars, a short comment and an
-- optional photo. Reviews wait as 'pending' until the shop approves them in Customer Reviews;
-- only 'approved' ones are sent to the public store, marked as a verified buyer because the bill
-- exists. The 1-5 star ratings customers already give a whole bill (customer_feedback) also count
-- for each product on that bill.
--
-- Adds:
--   table   public.product_reviews            (no anon access; shop members read, admin/manager approve)
--   bucket  review-photos                     (public read; upload only into a real bill's folder)
--   rpc     get_public_review_form(sale)      anon: the bill's products + any review already given
--   rpc     submit_public_product_review(...) anon: save / change one product's review (back to pending)
--   rpc     get_public_product_reviews(slug)  anon: stars + approved reviews for a published store
-- Safe to run more than once.
-- UNDO: DROP FUNCTION public.get_public_product_reviews(text);
--       DROP FUNCTION public.submit_public_product_review(uuid, uuid, int, text, text);
--       DROP FUNCTION public.get_public_review_form(uuid);
--       DROP POLICY "Bill holders can upload review photos" ON storage.objects;
--       DROP FUNCTION public.review_photo_upload_allowed(text);
--       DROP TABLE public.product_reviews;   -- (bucket review-photos: empty it in Storage first)

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 600),
  photo_url text CHECK (photo_url IS NULL OR char_length(photo_url) <= 600),
  reviewer_name text CHECK (reviewer_name IS NULL OR char_length(reviewer_name) <= 60),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  UNIQUE (sale_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_org_status
  ON public.product_reviews (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_org_product_approved
  ON public.product_reviews (organization_id, product_id)
  WHERE status = 'approved';

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view product reviews" ON public.product_reviews;
CREATE POLICY "Org members can view product reviews"
  ON public.product_reviews FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can moderate product reviews" ON public.product_reviews;
CREATE POLICY "Admins and managers can moderate product reviews"
  ON public.product_reviews FOR UPDATE TO authenticated
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

REVOKE ALL ON TABLE public.product_reviews FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.product_reviews TO authenticated;
GRANT ALL ON TABLE public.product_reviews TO service_role;

-- ---------- review photos ----------
-- Public bucket, images only, 3 MB each (the page compresses before upload).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-photos', 'review-photos', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Upload path must be <bill id>/<file>: the bill must exist, and a bill holds at most 30 photos.
CREATE OR REPLACE FUNCTION public.review_photo_upload_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
  v_sale uuid;
  v_count int;
BEGIN
  IF v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF coalesce(p_name, '') !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' THEN
    RETURN false;
  END IF;
  SELECT s.id INTO v_sale
  FROM public.sales s
  WHERE s.id = v_folder::uuid
    AND s.deleted_at IS NULL
    AND coalesce(s.is_cancelled, false) = false;
  IF v_sale IS NULL THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO v_count
  FROM storage.objects o
  WHERE o.bucket_id = 'review-photos'
    AND o.name LIKE v_folder || '/%';
  RETURN v_count < 30;
END;
$$;

REVOKE ALL ON FUNCTION public.review_photo_upload_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_photo_upload_allowed(text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Public can view review photos" ON storage.objects;
CREATE POLICY "Public can view review photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-photos');

DROP POLICY IF EXISTS "Bill holders can upload review photos" ON storage.objects;
CREATE POLICY "Bill holders can upload review photos"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'review-photos' AND public.review_photo_upload_allowed(name));

-- ---------- the review form for one bill ----------
CREATE OR REPLACE FUNCTION public.get_public_review_form(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_sale_number text;
  v_sale_date timestamptz;
  v_shop text;
  v_items jsonb;
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;

  SELECT s.organization_id, s.sale_number, s.sale_date
    INTO v_org, v_sale_number, v_sale_date
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.deleted_at IS NULL
    AND coalesce(s.is_cancelled, false) = false
    AND lower(coalesce(s.payment_status, '')) <> 'hold';

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;

  IF NOT public.storefront_public_lookup_rate_ok(v_org, 'review_form', p_sale_id::text, 120) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Please try again later.');
  END IF;

  SELECT coalesce(nullif(trim(st.business_name), ''), o.name)
    INTO v_shop
  FROM public.organizations o
  LEFT JOIN public.settings st ON st.organization_id = o.id
  WHERE o.id = v_org;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT
      li.product_id,
      li.name,
      coalesce(wp.photo, p.image_url) AS photo,
      r.rating,
      r.comment,
      r.photo_url,
      r.status
    FROM (
      SELECT si.product_id, min(si.product_name) AS name
      FROM public.sale_items si
      WHERE si.sale_id = p_sale_id
        AND si.deleted_at IS NULL
        AND si.product_id IS NOT NULL
      GROUP BY si.product_id
      LIMIT 60
    ) li
    JOIN public.products p ON p.id = li.product_id AND coalesce(p.product_type, '') <> 'service'
    LEFT JOIN LATERAL (
      SELECT w.photo_urls[1] AS photo
      FROM public.website_products w
      WHERE w.organization_id = v_org AND w.product_id = li.product_id AND w.is_active
      ORDER BY w.display_order
      LIMIT 1
    ) wp ON true
    LEFT JOIN public.product_reviews r ON r.sale_id = p_sale_id AND r.product_id = li.product_id
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'shop_name', v_shop,
    'sale_number', v_sale_number,
    'sale_date', v_sale_date,
    'items', v_items
  );
END;
$$;

-- ---------- save one product's review ----------
CREATE OR REPLACE FUNCTION public.submit_public_product_review(
  p_sale_id uuid,
  p_product_id uuid,
  p_rating int,
  p_comment text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_customer text;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_photo text := nullif(trim(coalesce(p_photo_url, '')), '');
  v_name text;
BEGIN
  IF p_sale_id IS NULL OR p_product_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Please choose 1 to 5 stars');
  END IF;
  IF v_comment IS NOT NULL AND char_length(v_comment) > 600 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Comment is too long');
  END IF;
  -- Only a photo uploaded to this bill's own folder is accepted.
  IF v_photo IS NOT NULL AND v_photo !~ (
    '^https://[A-Za-z0-9.-]+/storage/v1/object/public/review-photos/' || p_sale_id::text || '/[A-Za-z0-9._-]{1,80}$'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Photo could not be attached');
  END IF;

  SELECT s.organization_id, s.customer_name
    INTO v_org, v_customer
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.deleted_at IS NULL
    AND coalesce(s.is_cancelled, false) = false
    AND lower(coalesce(s.payment_status, '')) <> 'hold';

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sale_items si
    WHERE si.sale_id = p_sale_id AND si.product_id = p_product_id AND si.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This product is not on the bill');
  END IF;

  IF NOT public.storefront_public_lookup_rate_ok(v_org, 'review_submit', p_sale_id::text, 60) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Please try again later.');
  END IF;

  -- First name only on the public store; walk-in bills show "Customer".
  v_name := initcap(split_part(trim(coalesce(v_customer, '')), ' ', 1));
  IF v_name = '' OR lower(v_name) IN ('walk', 'walk-in', 'walkin', 'cash', 'customer') THEN
    v_name := 'Customer';
  END IF;

  INSERT INTO public.product_reviews
    (organization_id, sale_id, product_id, rating, comment, photo_url, reviewer_name, status)
  VALUES
    (v_org, p_sale_id, p_product_id, p_rating, v_comment, v_photo, left(v_name, 60), 'pending')
  ON CONFLICT (sale_id, product_id) DO UPDATE
  SET rating = EXCLUDED.rating,
      comment = EXCLUDED.comment,
      photo_url = coalesce(EXCLUDED.photo_url, public.product_reviews.photo_url),
      reviewer_name = EXCLUDED.reviewer_name,
      -- A changed review is looked at again before it shows on the store.
      status = 'pending',
      reviewed_at = NULL,
      reviewed_by = NULL,
      updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------- stars + approved reviews for a published store ----------
CREATE OR REPLACE FUNCTION public.get_public_product_reviews(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_published boolean;
  v_out jsonb;
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT r.id INTO v_org FROM public.resolve_organization_by_public_slug(p_slug) r;
  IF v_org IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT ws.is_published INTO v_published
  FROM public.website_settings ws
  WHERE ws.organization_id = v_org;
  IF v_published IS NOT TRUE THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH listed AS (
    SELECT DISTINCT w.product_id
    FROM public.website_products w
    WHERE w.organization_id = v_org AND w.is_active
  ),
  own AS (
    SELECT pr.product_id, pr.sale_id, pr.rating, pr.comment, pr.photo_url, pr.reviewer_name, pr.created_at
    FROM public.product_reviews pr
    JOIN listed l ON l.product_id = pr.product_id
    WHERE pr.organization_id = v_org AND pr.status = 'approved'
  ),
  -- A bill's star rating counts for each product on it, unless that product has its own review
  -- for the same bill (any status: the product review is the customer's word on that product).
  bill AS (
    SELECT DISTINCT si.product_id, cf.sale_id, cf.rating
    FROM public.customer_feedback cf
    JOIN public.sale_items si ON si.sale_id = cf.sale_id AND si.deleted_at IS NULL
    JOIN listed l ON l.product_id = si.product_id
    WHERE cf.organization_id = v_org
      AND cf.created_at > now() - interval '3 years'
      AND NOT EXISTS (
        SELECT 1 FROM public.product_reviews pr
        WHERE pr.sale_id = cf.sale_id AND pr.product_id = si.product_id
      )
  ),
  stars AS (
    SELECT product_id, rating FROM own
    UNION ALL
    SELECT product_id, rating FROM bill
  ),
  summary AS (
    SELECT product_id, round(avg(rating)::numeric, 1) AS rating_avg, count(*)::int AS rating_count
    FROM stars
    GROUP BY product_id
  ),
  shown AS (
    SELECT o.*, row_number() OVER (PARTITION BY o.product_id ORDER BY (o.photo_url IS NOT NULL) DESC, o.created_at DESC) AS rn
    FROM own o
    WHERE o.comment IS NOT NULL OR o.photo_url IS NOT NULL
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'product_id', s.product_id,
    'rating_avg', s.rating_avg,
    'rating_count', s.rating_count,
    'reviews', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'rating', sh.rating,
        'comment', sh.comment,
        'photo_url', sh.photo_url,
        'name', sh.reviewer_name,
        'date', sh.created_at
      ) ORDER BY sh.rn)
      FROM shown sh
      WHERE sh.product_id = s.product_id AND sh.rn <= 8
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  INTO v_out
  FROM summary s;

  RETURN v_out;
END;
$$;

-- trg_revoke_public_execute_on_new_functions strips anon on CREATE; put it back.
REVOKE ALL ON FUNCTION public.get_public_review_form(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_review_form(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_public_product_review(uuid, uuid, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_product_review(uuid, uuid, int, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_product_reviews(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product_reviews(text) TO anon, authenticated, service_role;
