-- Org-wide: pending sale_returns with NULL credit_available_balance → net_amount.
-- Keeps Settle / adjust paths aligned with _customer_cn_pool_row_available fallback.

UPDATE public.sale_returns sr
SET credit_available_balance = COALESCE(sr.net_amount, 0)
WHERE sr.deleted_at IS NULL
  AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending'
  AND (sr.credit_available_balance IS NULL OR sr.credit_available_balance < 0);

CREATE OR REPLACE FUNCTION public.trg_sale_returns_pending_cab_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(trim(COALESCE(NEW.credit_status, ''))) = 'pending'
     AND (NEW.credit_available_balance IS NULL OR NEW.credit_available_balance < 0)
     AND COALESCE(NEW.net_amount, 0) > 0
  THEN
    NEW.credit_available_balance := COALESCE(NEW.net_amount, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_returns_pending_cab_default ON public.sale_returns;

CREATE TRIGGER sale_returns_pending_cab_default
  BEFORE INSERT OR UPDATE OF credit_status, credit_available_balance, net_amount
  ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sale_returns_pending_cab_default();

COMMENT ON FUNCTION public.trg_sale_returns_pending_cab_default() IS
  'Sets credit_available_balance = net_amount for pending sale returns when CAB is missing.';
