CREATE OR REPLACE FUNCTION public.update_purchase_bill_total_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$