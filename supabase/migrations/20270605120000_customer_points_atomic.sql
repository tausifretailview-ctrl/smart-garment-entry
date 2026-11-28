-- Loyalty points: one database step per change (supermarket go-live, Nov 2026).
--
-- Points were earned / redeemed from the browser in separate steps: write the history row,
-- read the customer's balance, write balance + change. Two counters billing the same
-- customer at once both read the same balance and the second write lost the first's points.
--
-- apply_customer_points does it in one transaction: the customer row is locked, the balance
-- changes in the database (not from a figure the browser read), and the history row is
-- written with it. The same bill never earns (or redeems) twice: a retry or a double click
-- finds the history row and changes nothing.
--
-- SECURITY INVOKER: it runs as the signed-in user, so the existing row rules (RLS) on
-- customers and customer_points_history decide what may be changed, as before.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.apply_customer_points(
  p_organization_id uuid,
  p_customer_id uuid,
  p_kind text,                     -- 'earned' | 'redeemed'
  p_points numeric,                -- always positive; the kind gives the sign
  p_sale_id uuid DEFAULT NULL,
  p_invoice_amount numeric DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_points numeric := abs(coalesce(p_points, 0));
  v_balance numeric;
BEGIN
  IF p_kind NOT IN ('earned', 'redeemed') THEN
    RAISE EXCEPTION 'apply_customer_points: unknown kind %', p_kind USING ERRCODE = '22023';
  END IF;
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('applied', 0, 'duplicate', false);
  END IF;

  -- Lock the customer: a second counter changing the same customer waits here.
  SELECT coalesce(points_balance, 0) INTO v_balance
  FROM customers
  WHERE id = p_customer_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_customer_points: customer not found' USING ERRCODE = 'P0002';
  END IF;

  -- Same bill, same kind, already done (checked under the lock, so two calls cannot both pass).
  IF p_sale_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM customer_points_history h
    WHERE h.customer_id = p_customer_id
      AND h.sale_id = p_sale_id
      AND h.transaction_type = p_kind
  ) THEN
    RETURN jsonb_build_object('applied', 0, 'duplicate', true, 'balance', v_balance);
  END IF;

  IF p_kind = 'earned' THEN
    UPDATE customers
    SET points_balance = coalesce(points_balance, 0) + v_points,
        total_points_earned = coalesce(total_points_earned, 0) + v_points
    WHERE id = p_customer_id AND organization_id = p_organization_id
    RETURNING points_balance INTO v_balance;
  ELSE
    -- As before: the discount is already on the bill, so the full points count as redeemed;
    -- the balance never goes below 0.
    UPDATE customers
    SET points_balance = greatest(0, coalesce(points_balance, 0) - v_points),
        points_redeemed = coalesce(points_redeemed, 0) + v_points
    WHERE id = p_customer_id AND organization_id = p_organization_id
    RETURNING points_balance INTO v_balance;
  END IF;

  INSERT INTO customer_points_history (
    organization_id, customer_id, sale_id, transaction_type, points, invoice_amount, description, created_by
  ) VALUES (
    p_organization_id,
    p_customer_id,
    p_sale_id,
    p_kind,
    CASE WHEN p_kind = 'earned' THEN v_points ELSE -v_points END,
    p_invoice_amount,
    p_description,
    auth.uid()
  );

  RETURN jsonb_build_object('applied', v_points, 'duplicate', false, 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_customer_points(uuid, uuid, text, numeric, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_customer_points(uuid, uuid, text, numeric, uuid, numeric, text) TO authenticated;

-- Checks (read-only) after running:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'apply_customer_points';
--   -- expect one row, prosecdef = false (SECURITY INVOKER)
