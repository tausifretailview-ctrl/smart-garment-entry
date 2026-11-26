-- Spin & Win: dates by the Indian calendar day, not UTC (fixes SQL 57).
--
-- "Spin & Win has not started yet" showed on bills made just after midnight in India: the start /
-- end dates were compared with current_date, which is the UTC day on the server (until 05:30 IST
-- it is still yesterday). The "per day" prize limit reset at 05:30 IST for the same reason.
-- Both now use the Indian day (Asia/Kolkata). Same functions, same signatures; nothing else
-- changes. Safe to re-run.
-- UNDO: re-run the two function bodies from 20270530120000_spin_and_win.sql.

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
    WHEN c.starts_on IS NOT NULL AND (now() AT TIME ZONE 'Asia/Kolkata')::date < c.starts_on THEN 'Spin & Win has not started yet.'
    WHEN c.ends_on IS NOT NULL AND (now() AT TIME ZONE 'Asia/Kolkata')::date > c.ends_on THEN 'Spin & Win has ended.'
    WHEN c.pos_only AND lower(coalesce(s_type, '')) <> 'pos' THEN 'This bill is not part of Spin & Win.'
    WHEN coalesce(s_net, 0) < c.min_bill_amount THEN 'This bill is not part of Spin & Win.'
    WHEN s_date + make_interval(days => c.link_valid_days) < now() THEN 'This Spin & Win link has expired.'
    ELSE NULL
  END
$$;

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
            WHERE r.prize_id = p.id AND r.created_at >= ((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AND r.status <> 'cancelled'))
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
              WHERE r.prize_id = p.id AND r.created_at >= ((now() AT TIME ZONE 'Asia/Kolkata')::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AND r.status <> 'cancelled'))
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

REVOKE ALL ON FUNCTION public._spin_bill_block_reason(public.spin_campaigns, timestamptz, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spin_for_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spin_for_sale(uuid) TO anon, authenticated, service_role;

-- Check (read-only): both should be true.
-- SELECT position('Asia/Kolkata' in pg_get_functiondef('public._spin_bill_block_reason(public.spin_campaigns, timestamptz, text, numeric)'::regprocedure)) > 0 AS start_end_by_ist,
--        position('Asia/Kolkata' in pg_get_functiondef('public.spin_for_sale(uuid)'::regprocedure)) > 0 AS per_day_by_ist;
