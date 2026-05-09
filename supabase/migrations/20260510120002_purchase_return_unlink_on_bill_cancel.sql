-- When a purchase bill is cancelled, restore purchase returns that had credit applied to that bill
-- so supplier balance / CN logic does not reference a cancelled bill.

CREATE OR REPLACE FUNCTION public.trg_purchase_return_unlink_on_bill_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(NEW.is_cancelled, false) = true
     AND COALESCE(OLD.is_cancelled, false) = false
  THEN
    UPDATE public.purchase_returns pr
    SET
      linked_bill_id = NULL,
      credit_available_balance = COALESCE(pr.net_amount, 0),
      credit_status = CASE
        WHEN pr.credit_note_id IS NOT NULL THEN 'adjusted_outstanding'
        ELSE 'pending'
      END
    WHERE pr.linked_bill_id = NEW.id
      AND pr.deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_return_unlink_on_bill_cancel ON public.purchase_bills;
CREATE TRIGGER trg_purchase_return_unlink_on_bill_cancel
AFTER UPDATE OF is_cancelled ON public.purchase_bills
FOR EACH ROW
EXECUTE FUNCTION public.trg_purchase_return_unlink_on_bill_cancel();

COMMENT ON FUNCTION public.trg_purchase_return_unlink_on_bill_cancel() IS
  'Clears linked_bill_id on purchase_returns when the linked purchase bill is cancelled; restores credit_available_balance to net_amount.';
