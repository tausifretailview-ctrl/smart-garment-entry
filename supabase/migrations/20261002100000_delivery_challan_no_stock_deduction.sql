-- Delivery challan: document-only until stock policy is finalized.
-- No stock_movements rows (movement_type 'challan' is not in the check constraint anyway).

CREATE OR REPLACE FUNCTION public.update_stock_on_challan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_challan_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_delivery_challan(p_challan_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE delivery_challan_items
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE challan_id = p_challan_id;

  UPDATE delivery_challans
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE id = p_challan_id;
END;
$function$;
