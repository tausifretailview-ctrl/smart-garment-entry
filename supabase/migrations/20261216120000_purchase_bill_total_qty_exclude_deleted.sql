-- purchase_bills.total_qty was SUM(qty) over ALL purchase_items, including
-- soft-deleted rows. fetchPurchaseItemsByBillId and total_items already
-- ignore deleted_at IS NOT NULL, so editing a bill after a line delete
-- showed: "Loaded 378 qty from 80 lines but the bill header shows 382 qty."
-- Match total_items: count / sum active lines only.

CREATE OR REPLACE FUNCTION public.update_purchase_bill_total_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  target_bill_id uuid;
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_bill_id := OLD.bill_id;
  ELSE
    target_bill_id := NEW.bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET total_qty = (
    SELECT COALESCE(SUM(pi.qty), 0)
    FROM public.purchase_items pi
    WHERE pi.bill_id = target_bill_id
      AND pi.deleted_at IS NULL
  )
  WHERE id = target_bill_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_purchase_bill_total_qty() IS
  'Denormalized purchase_bills.total_qty from active purchase_items (deleted_at IS NULL). Skipped during app.bulk_purchase_insert.';

UPDATE public.purchase_bills pb
SET total_qty = COALESCE(
  (
    SELECT SUM(pi.qty)
    FROM public.purchase_items pi
    WHERE pi.bill_id = pb.id
      AND pi.deleted_at IS NULL
  ),
  0
)
WHERE pb.total_qty IS DISTINCT FROM COALESCE(
  (
    SELECT SUM(pi.qty)
    FROM public.purchase_items pi
    WHERE pi.bill_id = pb.id
      AND pi.deleted_at IS NULL
  ),
  0
);
