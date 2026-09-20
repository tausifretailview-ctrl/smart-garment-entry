-- SECTION B — run after Section A. Brief lock on customer_advances for CREATE TRIGGER.

CREATE OR REPLACE FUNCTION public.guard_customer_advances_used_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.used_amount, 0) > COALESCE(NEW.amount, 0) + 0.5 THEN
    RAISE EXCEPTION
      'Advance booking %: applied amount (%) exceeds booked amount (%). Refresh and try again.',
      COALESCE(NEW.advance_number, NEW.id::text),
      NEW.used_amount,
      NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_customer_advances_used_amount ON public.customer_advances;

CREATE TRIGGER trg_guard_customer_advances_used_amount
  BEFORE INSERT OR UPDATE OF used_amount, amount, customer_id, organization_id
  ON public.customer_advances
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_customer_advances_used_amount();
