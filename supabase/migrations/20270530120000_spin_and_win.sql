-- Spin & Win (step 1 of 5): a reward wheel the customer spins from the POS bill's WhatsApp link.
--
-- Sales -> Spin & Win: the shop sets one campaign (on/off, dates, which bills, how long the link
-- and the prize code last) and the prizes on the wheel (gift item, discount %, discount Rs,
-- better luck), each with a chance and an optional stock limit.
-- The customer opens /spin/<bill id> (the same unguessable id as the online invoice link) and
-- taps Spin: the SERVER picks the prize, saves it against the bill and returns it; the phone
-- only turns the wheel to that slice. One bill = one spin (unique sale_id + a lock).
-- At POS the cashier types the prize code: check_spin_code says what it gives, and the bill's
-- save marks it used (redeem_spin_code). A cancelled or deleted bill frees a code used on it and
-- cancels an unused prize it won.
--
-- Tables: RLS, members of the shop only. The public page reaches them only through
-- get_public_spin / spin_for_sale (SECURITY DEFINER, bill id as the key, rate limited per bill,
-- no amounts or phone numbers returned).
-- Safe to re-run. UNDO: DROP the trigger, the functions and the three tables (spin_results first).

-- ---------- tables ----------
CREATE TABLE IF NOT EXISTS public.spin_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT 'Spin & Win' CHECK (length(title) BETWEEN 1 AND 60),
  starts_on date,
  ends_on date,
  pos_only boolean NOT NULL DEFAULT true,
  min_bill_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_bill_amount >= 0),
  link_valid_days int NOT NULL DEFAULT 3 CHECK (link_valid_days BETWEEN 1 AND 60),
  code_valid_days int NOT NULL DEFAULT 30 CHECK (code_valid_days BETWEEN 1 AND 365),
  min_redeem_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_redeem_amount >= 0),
  terms text CHECK (terms IS NULL OR length(terms) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.spin_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.spin_campaigns(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 40),
  prize_type text NOT NULL CHECK (prize_type IN ('gift_item', 'discount_percent', 'discount_amount', 'better_luck')),
  value numeric(12,2) NOT NULL DEFAULT 0 CHECK (value >= 0),
  max_discount numeric(12,2) CHECK (max_discount IS NULL OR max_discount >= 0),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  weight int NOT NULL DEFAULT 10 CHECK (weight BETWEEN 0 AND 1000),
  stock_total int CHECK (stock_total IS NULL OR stock_total >= 0),
  stock_per_day int CHECK (stock_per_day IS NULL OR stock_per_day >= 0),
  won_count int NOT NULL DEFAULT 0,
  color text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spin_prizes_campaign ON public.spin_prizes (campaign_id, sort_order);

CREATE TABLE IF NOT EXISTS public.spin_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.spin_campaigns(id) ON DELETE SET NULL,
  sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE CASCADE,
  sale_number text,
  customer_id uuid,
  customer_name text,
  prize_id uuid REFERENCES public.spin_prizes(id) ON DELETE SET NULL,
  prize_label text NOT NULL,
  prize_type text NOT NULL,
  prize_value numeric(12,2) NOT NULL DEFAULT 0,
  max_discount numeric(12,2),
  product_id uuid,
  variant_id uuid,
  code text,
  min_redeem_amount numeric(12,2) NOT NULL DEFAULT 0,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'won' CHECK (status IN ('won', 'redeemed', 'cancelled', 'lost')),
  redeemed_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spin_results_org_code ON public.spin_results (organization_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spin_results_org_created ON public.spin_results (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spin_results_redeemed_sale ON public.spin_results (redeemed_sale_id) WHERE redeemed_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spin_results_prize_day ON public.spin_results (prize_id, created_at);

-- ---------- RLS: members of the shop ----------
ALTER TABLE public.spin_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spin_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members manage spin campaigns" ON public.spin_campaigns;
CREATE POLICY "Members manage spin campaigns" ON public.spin_campaigns FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Members manage spin prizes" ON public.spin_prizes;
CREATE POLICY "Members manage spin prizes" ON public.spin_prizes FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Results are written only by spin_for_sale / redeem_spin_code; members read them.
DROP POLICY IF EXISTS "Members read spin results" ON public.spin_results;
CREATE POLICY "Members read spin results" ON public.spin_results FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

REVOKE ALL ON public.spin_campaigns, public.spin_prizes, public.spin_results FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spin_campaigns, public.spin_prizes TO authenticated;
GRANT SELECT ON public.spin_results TO authenticated;

-- ---------- shared: is this bill allowed a spin now? ----------
-- Returns NULL when it is, else the reason shown to the customer.
CREATE OR REPLACE FUNCTION public._spin_bill_block_reason(
  c public.spin_campaigns,
  s_date timestamptz,
  s_type text,
  s_net numeric
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN c.id IS NULL OR NOT c.enabled THEN 'Spin & Win is not running right now.'
    WHEN c.starts_on IS NOT NULL AND current_date < c.starts_on THEN 'Spin & Win has not started yet.'
    WHEN c.ends_on IS NOT NULL AND current_date > c.ends_on THEN 'Spin & Win has ended.'
    WHEN c.pos_only AND lower(coalesce(s_type, '')) <> 'pos' THEN 'This bill is not part of Spin & Win.'
    WHEN coalesce(s_net, 0) < c.min_bill_amount THEN 'This bill is not part of Spin & Win.'
    WHEN s_date + make_interval(days => c.link_valid_days) < now() THEN 'This Spin & Win link has expired.'
    ELSE NULL
  END
$$;
REVOKE ALL ON FUNCTION public._spin_bill_block_reason(public.spin_campaigns, timestamptz, text, numeric) FROM PUBLIC, anon, authenticated;

-- ---------- public: what the spin page shows ----------
CREATE OR REPLACE FUNCTION public.get_public_spin(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_c public.spin_campaigns;
  v_shop text;
  v_logo text;
  v_prizes jsonb;
  v_result jsonb;
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  SELECT s.organization_id, s.sale_number, s.sale_date, s.sale_type, s.net_amount
    INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.deleted_at IS NULL
    AND coalesce(s.is_cancelled, false) = false
    AND lower(coalesce(s.payment_status, '')) <> 'hold';
  IF v_sale.organization_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  IF NOT public.storefront_public_lookup_rate_ok(v_sale.organization_id, 'spin_view', p_sale_id::text, 120) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Please try again later.');
  END IF;

  SELECT * INTO v_c FROM public.spin_campaigns WHERE organization_id = v_sale.organization_id;
  SELECT coalesce(nullif(trim(st.business_name), ''), o.name), st.bill_barcode_settings ->> 'logo_url'
    INTO v_shop, v_logo
  FROM public.organizations o
  LEFT JOIN public.settings st ON st.organization_id = o.id
  WHERE o.id = v_sale.organization_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'color', p.color) ORDER BY p.sort_order, p.created_at), '[]'::jsonb)
    INTO v_prizes
  FROM public.spin_prizes p
  WHERE p.campaign_id = v_c.id AND p.active;

  SELECT jsonb_build_object(
           'prize_id', r.prize_id, 'label', r.prize_label, 'type', r.prize_type, 'value', r.prize_value,
           'max_discount', r.max_discount, 'code', r.code, 'expires_at', r.expires_at, 'status', r.status)
    INTO v_result
  FROM public.spin_results r WHERE r.sale_id = p_sale_id;

  RETURN jsonb_build_object(
    'ok', true,
    'shop_name', v_shop,
    'logo_url', v_logo,
    'title', coalesce(v_c.title, 'Spin & Win'),
    'terms', v_c.terms,
    'sale_number', v_sale.sale_number,
    'prizes', v_prizes,
    'result', v_result,
    'blocked', CASE WHEN v_result IS NOT NULL THEN NULL
                    WHEN jsonb_array_length(v_prizes) < 2 THEN 'Spin & Win is not running right now.'
                    ELSE public._spin_bill_block_reason(v_c, v_sale.sale_date, v_sale.sale_type, v_sale.net_amount) END
  );
END;
$$;

-- ---------- public: the spin itself (one per bill) ----------
CREATE OR REPLACE FUNCTION public.spin_for_sale(p_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_c public.spin_campaigns;
  v_block text;
  v_total int;
  v_pick int;
  v_prize public.spin_prizes;
  v_code text;
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_try int := 0;
  v_existing jsonb;
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  SELECT s.organization_id, s.sale_number, s.sale_date, s.sale_type, s.net_amount, s.customer_id, s.customer_name
    INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.deleted_at IS NULL
    AND coalesce(s.is_cancelled, false) = false
    AND lower(coalesce(s.payment_status, '')) <> 'hold';
  IF v_sale.organization_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bill not found');
  END IF;
  IF NOT public.storefront_public_lookup_rate_ok(v_sale.organization_id, 'spin_go', p_sale_id::text, 30) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Too many requests. Please try again later.');
  END IF;

  -- One spin per bill: a second tap (or two at once) gets the first result.
  PERFORM pg_advisory_xact_lock(hashtext('spin:' || p_sale_id::text));
  SELECT jsonb_build_object(
           'ok', true, 'prize_id', r.prize_id, 'label', r.prize_label, 'type', r.prize_type, 'value', r.prize_value,
           'max_discount', r.max_discount, 'code', r.code, 'expires_at', r.expires_at, 'status', r.status, 'again', true)
    INTO v_existing
  FROM public.spin_results r WHERE r.sale_id = p_sale_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT * INTO v_c FROM public.spin_campaigns WHERE organization_id = v_sale.organization_id;
  v_block := public._spin_bill_block_reason(v_c, v_sale.sale_date, v_sale.sale_type, v_sale.net_amount);
  IF v_block IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_block);
  END IF;

  -- Prize stock is counted under a per-shop lock, so the last free gift is won once.
  PERFORM pg_advisory_xact_lock(hashtext('spin-stock:' || v_sale.organization_id::text));

  -- Prizes that can still be won (stock left, today's limit not reached), by chance.
  WITH pool AS (
    SELECT p.id, p.weight, row_number() OVER (ORDER BY p.sort_order, p.created_at) AS ord
    FROM public.spin_prizes p
    WHERE p.campaign_id = v_c.id AND p.active AND p.weight > 0
      AND (p.stock_total IS NULL OR p.won_count < p.stock_total)
      AND (p.stock_per_day IS NULL OR p.stock_per_day > (
            SELECT count(*) FROM public.spin_results r
            WHERE r.prize_id = p.id AND r.created_at >= date_trunc('day', now()) AND r.status <> 'cancelled'))
  )
  SELECT coalesce(sum(weight), 0)::int INTO v_total FROM pool;

  IF v_total = 0 THEN
    -- Everything given away: a "better luck" slice if the wheel has one.
    SELECT * INTO v_prize FROM public.spin_prizes
    WHERE campaign_id = v_c.id AND active AND prize_type = 'better_luck'
    ORDER BY sort_order LIMIT 1;
    IF v_prize.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'All prizes have been won. Thank you for shopping!');
    END IF;
  ELSE
    v_pick := floor(random() * v_total)::int;
    WITH pool AS (
      SELECT p.id, p.weight, row_number() OVER (ORDER BY p.sort_order, p.created_at) AS ord
      FROM public.spin_prizes p
      WHERE p.campaign_id = v_c.id AND p.active AND p.weight > 0
        AND (p.stock_total IS NULL OR p.won_count < p.stock_total)
        AND (p.stock_per_day IS NULL OR p.stock_per_day > (
              SELECT count(*) FROM public.spin_results r
              WHERE r.prize_id = p.id AND r.created_at >= date_trunc('day', now()) AND r.status <> 'cancelled'))
    ), cum AS (
      SELECT id, sum(weight) OVER (ORDER BY ord) AS upto FROM pool
    )
    SELECT p.* INTO v_prize
    FROM cum JOIN public.spin_prizes p ON p.id = cum.id
    WHERE cum.upto > v_pick
    ORDER BY cum.upto
    LIMIT 1;
  END IF;

  IF v_prize.prize_type <> 'better_luck' THEN
    LOOP
      v_try := v_try + 1;
      v_code := 'SW-';
      FOR i IN 1..5 LOOP
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.spin_results WHERE organization_id = v_sale.organization_id AND code = v_code);
      IF v_try > 10 THEN
        RAISE EXCEPTION 'Could not make a prize code';
      END IF;
    END LOOP;
    UPDATE public.spin_prizes SET won_count = won_count + 1 WHERE id = v_prize.id;
  END IF;

  INSERT INTO public.spin_results (
    organization_id, campaign_id, sale_id, sale_number, customer_id, customer_name,
    prize_id, prize_label, prize_type, prize_value, max_discount, product_id, variant_id,
    code, min_redeem_amount, expires_at, status)
  VALUES (
    v_sale.organization_id, v_c.id, p_sale_id, v_sale.sale_number, v_sale.customer_id, v_sale.customer_name,
    v_prize.id, v_prize.label, v_prize.prize_type, v_prize.value, v_prize.max_discount, v_prize.product_id, v_prize.variant_id,
    v_code, v_c.min_redeem_amount,
    CASE WHEN v_code IS NULL THEN NULL ELSE now() + make_interval(days => v_c.code_valid_days) END,
    CASE WHEN v_prize.prize_type = 'better_luck' THEN 'lost' ELSE 'won' END);

  RETURN jsonb_build_object(
    'ok', true, 'prize_id', v_prize.id, 'label', v_prize.label, 'type', v_prize.prize_type, 'value', v_prize.value,
    'max_discount', v_prize.max_discount, 'code', v_code,
    'expires_at', CASE WHEN v_code IS NULL THEN NULL ELSE now() + make_interval(days => v_c.code_valid_days) END,
    'status', CASE WHEN v_prize.prize_type = 'better_luck' THEN 'lost' ELSE 'won' END,
    'again', false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_spin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spin_for_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_spin(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.spin_for_sale(uuid) TO anon, authenticated, service_role;

-- ---------- POS: what a prize code gives ----------
CREATE OR REPLACE FUNCTION public.check_spin_code(p_org uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.spin_results;
  v_used_on text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
BEGIN
  IF auth.uid() IS NULL OR p_org IS NULL
     OR NOT (p_org IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF v_code <> '' AND v_code NOT LIKE 'SW-%' THEN
    v_code := 'SW-' || v_code;
  END IF;
  SELECT * INTO r FROM public.spin_results WHERE organization_id = p_org AND code = v_code;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No Spin & Win prize has this code.');
  END IF;
  IF r.status = 'redeemed' THEN
    SELECT sale_number INTO v_used_on FROM public.sales WHERE id = r.redeemed_sale_id;
    RETURN jsonb_build_object('ok', false, 'error',
      'Already used' || coalesce(' on ' || v_used_on, '') || coalesce(' (' || to_char(r.redeemed_at, 'DD Mon YYYY') || ')', '') || '.');
  END IF;
  IF r.status <> 'won' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This prize was cancelled.');
  END IF;
  IF r.expires_at IS NOT NULL AND r.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Expired on ' || to_char(r.expires_at, 'DD Mon YYYY') || '.');
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'id', r.id, 'code', r.code, 'label', r.prize_label, 'type', r.prize_type, 'value', r.prize_value,
    'max_discount', r.max_discount, 'product_id', r.product_id, 'variant_id', r.variant_id,
    'min_redeem_amount', r.min_redeem_amount, 'expires_at', r.expires_at,
    'won_on_sale', r.sale_number, 'customer_name', r.customer_name);
END;
$$;

-- ---------- POS: the bill was saved with this code ----------
CREATE OR REPLACE FUNCTION public.redeem_spin_code(p_org uuid, p_code text, p_sale_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  IF auth.uid() IS NULL OR p_org IS NULL
     OR NOT (p_org IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales WHERE id = p_sale_id AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Bill not found' USING ERRCODE = '22023';
  END IF;
  UPDATE public.spin_results
     SET status = 'redeemed', redeemed_sale_id = p_sale_id, redeemed_at = now()
   WHERE organization_id = p_org
     AND code = upper(trim(p_code))
     AND status = 'won'
     AND (expires_at IS NULL OR expires_at >= now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.check_spin_code(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_spin_code(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_spin_code(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_spin_code(uuid, text, uuid) TO authenticated, service_role;

-- ---------- a cancelled / deleted bill ----------
-- Frees a code that was used on it, and cancels an unused prize it won.
CREATE OR REPLACE FUNCTION public.spin_results_follow_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
     OR (coalesce(NEW.is_cancelled, false) AND NOT coalesce(OLD.is_cancelled, false)) THEN
    UPDATE public.spin_results
       SET status = 'won', redeemed_sale_id = NULL, redeemed_at = NULL
     WHERE redeemed_sale_id = NEW.id AND status = 'redeemed';
    -- The prize it won goes back into the prize's stock.
    WITH gone AS (
      UPDATE public.spin_results
         SET status = 'cancelled'
       WHERE sale_id = NEW.id AND status = 'won'
      RETURNING prize_id
    )
    UPDATE public.spin_prizes p
       SET won_count = greatest(0, p.won_count - 1)
      FROM gone
     WHERE p.id = gone.prize_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spin_results_follow_sale ON public.sales;
CREATE TRIGGER trg_spin_results_follow_sale
  AFTER UPDATE OF deleted_at, is_cancelled ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.spin_results_follow_sale();

COMMENT ON TABLE public.spin_results IS 'Spin & Win: one row per spun bill; code redeemed at POS (redeem_spin_code).';
