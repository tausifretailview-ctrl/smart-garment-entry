
-- Add total_qty column to purchase_bills
ALTER TABLE public.purchase_bills
ADD COLUMN IF NOT EXISTS total_qty INTEGER DEFAULT 0;

-- Backfill existing rows
UPDATE purchase_bills
SET total_qty = (SELECT COALESCE(SUM(qty), 0) FROM purchase_items WHERE bill_id = purchase_bills.id);

-- Create trigger function for auto-updating total_qty
CREATE OR REPLACE FUNCTION public.update_purchase_bill_total_qty()
RETURNS TRIGGER AS $$
DECLARE
  target_bill_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_bill_id := OLD.bill_id;
  ELSE
    target_bill_id := NEW.bill_id;
  END IF;

  UPDATE purchase_bills
  SET total_qty = (SELECT COALESCE(SUM(qty), 0) FROM purchase_items WHERE bill_id = target_bill_id)
  WHERE id = target_bill_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_purchase_bill_total_qty ON public.purchase_items;
CREATE TRIGGER trg_update_purchase_bill_total_qty
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_items
FOR EACH ROW
EXECUTE FUNCTION public.update_purchase_bill_total_qty();
