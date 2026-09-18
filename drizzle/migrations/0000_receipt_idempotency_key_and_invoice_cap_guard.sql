-- Step 2 duplicate-receipt hardening.
-- (1) Idempotency key: dedupes retries/double-submits of the SAME submission only.
-- (2) Server-side atomic cap: receipts on one invoice may never exceed its payable.

ALTER TABLE public.voucher_entries
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_entries_client_request_active
  ON public.voucher_entries (organization_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_receipt_within_invoice_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_net numeric;
  v_existing numeric;
  v_incoming numeric;
  v_tol numeric := 1.0;
  v_sale_number text;
BEGIN
  -- Escape hatch for supervised repair/migration scripts:
  --   SELECT set_config('ezzy.skip_receipt_cap','on', true);
  IF COALESCE(current_setting('ezzy.skip_receipt_cap', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.voucher_type <> 'receipt' THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.reference_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.reference_type, '') NOT IN ('sale', 'CustomerReceipt') THEN RETURN NEW; END IF;
  -- CN application is netted against sale_return_adjust elsewhere (compute_sale_settlement).
  IF LOWER(COALESCE(NEW.payment_method, '')) = 'credit_note_adjustment' THEN RETURN NEW; END IF;

  SELECT s.net_amount, s.sale_number
    INTO v_net, v_sale_number
  FROM public.sales s
  WHERE s.id = NEW.reference_id
    AND s.organization_id = NEW.organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
  FOR UPDATE;   -- serialises two concurrent receipts on the same bill

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 0)
    INTO v_existing
  FROM public.voucher_entries ve
  WHERE ve.reference_id = NEW.reference_id
    AND ve.organization_id = NEW.organization_id
    AND ve.voucher_type = 'receipt'
    AND ve.deleted_at IS NULL
    AND ve.reference_type IN ('sale', 'customer', 'CustomerReceipt')
    AND LOWER(COALESCE(ve.payment_method, '')) <> 'credit_note_adjustment';

  v_incoming := COALESCE(NEW.total_amount, 0) + COALESCE(NEW.discount_amount, 0);

  IF v_existing + v_incoming > GREATEST(0, COALESCE(v_net, 0)) + v_tol THEN
    RAISE EXCEPTION
      'RECEIPT_OVER_CREDIT: invoice % is already settled to %; adding % would exceed its value of %',
      COALESCE(v_sale_number, NEW.reference_id::text), v_existing, v_incoming, v_net
      USING ERRCODE = 'P0431';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_receipt_within_invoice_cap ON public.voucher_entries;
CREATE TRIGGER trg_enforce_receipt_within_invoice_cap
  BEFORE INSERT ON public.voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_receipt_within_invoice_cap();