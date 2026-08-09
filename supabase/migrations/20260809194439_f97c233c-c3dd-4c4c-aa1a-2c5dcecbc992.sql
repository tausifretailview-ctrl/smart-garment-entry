CREATE OR REPLACE FUNCTION public.enforce_advance_refund_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC;
  v_used NUMERIC;
  v_refunded NUMERIC;
  v_dupes INTEGER;
BEGIN
  SELECT COALESCE(a.amount, 0), COALESCE(a.used_amount, 0)
    INTO v_amount, v_used
  FROM public.customer_advances a
  WHERE a.id = NEW.advance_id;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Advance booking not found for refund';
  END IF;

  SELECT COALESCE(SUM(r.refund_amount), 0)
    INTO v_refunded
  FROM public.advance_refunds r
  WHERE r.advance_id = NEW.advance_id
    AND (TG_OP = 'INSERT' OR r.id <> NEW.id);

  IF v_refunded + COALESCE(NEW.refund_amount, 0) > v_amount + 0.01 THEN
    RAISE EXCEPTION 'Refund total (%) would exceed the advance booking amount (%)',
      v_refunded + COALESCE(NEW.refund_amount, 0), v_amount;
  END IF;

  SELECT COUNT(*) INTO v_dupes
  FROM public.advance_refunds r
  WHERE r.advance_id = NEW.advance_id
    AND r.refund_amount = NEW.refund_amount
    AND r.refund_date = NEW.refund_date
    AND (TG_OP = 'INSERT' OR r.id <> NEW.id);

  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'A refund of % for this advance already exists on %', NEW.refund_amount, NEW.refund_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_advance_refund_limits ON public.advance_refunds;
CREATE TRIGGER trg_enforce_advance_refund_limits
BEFORE INSERT OR UPDATE ON public.advance_refunds
FOR EACH ROW EXECUTE FUNCTION public.enforce_advance_refund_limits();