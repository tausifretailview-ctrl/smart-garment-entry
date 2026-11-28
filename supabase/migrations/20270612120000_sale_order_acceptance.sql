-- Sale order acceptance: Accepted / Hold / Rejected (Nov 2026).
--
-- sale_orders.customer_accepted was yes / no only. The Sale Order dashboard now picks
-- Accepted, Hold or Rejected from a drop-down: sale_orders.acceptance_status.
-- * NULL = not decided yet.
-- * customer_accepted stays in step (true only when Accepted), both ways, by a trigger, so
--   the salesman phone app (which sets customer_accepted) and old screens keep working.
-- * Orders already accepted are marked Accepted.
-- Safe to run more than once.

ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS acceptance_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_orders_acceptance_status_check' AND conrelid = 'public.sale_orders'::regclass
  ) THEN
    ALTER TABLE public.sale_orders
      ADD CONSTRAINT sale_orders_acceptance_status_check
      CHECK (acceptance_status IS NULL OR acceptance_status IN ('accepted', 'hold', 'rejected'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sale_orders_sync_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.acceptance_status IS NOT NULL THEN
      NEW.customer_accepted := (NEW.acceptance_status = 'accepted');
    ELSIF NEW.customer_accepted IS TRUE THEN
      NEW.acceptance_status := 'accepted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.acceptance_status IS DISTINCT FROM OLD.acceptance_status THEN
    NEW.customer_accepted := (NEW.acceptance_status = 'accepted');
  ELSIF NEW.customer_accepted IS DISTINCT FROM OLD.customer_accepted THEN
    NEW.acceptance_status := CASE WHEN NEW.customer_accepted IS TRUE THEN 'accepted' ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_orders_sync_acceptance ON public.sale_orders;
CREATE TRIGGER sale_orders_sync_acceptance
  BEFORE INSERT OR UPDATE OF acceptance_status, customer_accepted ON public.sale_orders
  FOR EACH ROW EXECUTE FUNCTION public.sale_orders_sync_acceptance();

-- Orders accepted before this change. Only rows not marked yet; the trigger leaves
-- customer_accepted as it is (true).
UPDATE public.sale_orders
SET acceptance_status = 'accepted'
WHERE customer_accepted IS TRUE AND acceptance_status IS NULL;

-- Checks (read-only) after running:
--   SELECT acceptance_status, customer_accepted, count(*) FROM public.sale_orders GROUP BY 1, 2;
