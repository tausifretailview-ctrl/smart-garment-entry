-- Settings > Sale "Allow Sale Without Stock" (sale_settings.allow_negative_stock_sale).
-- Off by default: every shop keeps today's block. When a shop turns it on, sales
-- may take stock below zero (delivery challans still block). Later purchases / returns raise it back.
--
-- 1. org_allows_negative_stock(org) reads the switch.
-- 2. The CHECK (stock_qty >= 0) constraint becomes a trigger that only lets stock go
--    (further) below zero for shops with the switch on. Moves that raise stock are always
--    allowed, so a shop that turns the switch off again can still purchase/return.
-- 3. update_stock_on_sale skips "Insufficient stock" for those shops.

CREATE OR REPLACE FUNCTION public.org_allows_negative_stock(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT s.sale_settings->>'allow_negative_stock_sale' = 'true'
       FROM public.settings s
      WHERE s.organization_id = p_org_id
      LIMIT 1),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.guard_variant_stock_not_negative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stock_qty < 0
     AND (TG_OP = 'INSERT' OR NEW.stock_qty < COALESCE(OLD.stock_qty, 0))
     AND NOT public.org_allows_negative_stock(NEW.organization_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'stock_not_negative',
      MESSAGE = 'new row for relation "product_variants" violates check constraint "stock_not_negative"';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_variant_stock_not_negative ON public.product_variants;
CREATE TRIGGER trg_guard_variant_stock_not_negative
BEFORE INSERT OR UPDATE OF stock_qty ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.guard_variant_stock_not_negative();

ALTER TABLE public.product_variants DROP CONSTRAINT IF EXISTS stock_not_negative;

CREATE OR REPLACE FUNCTION public.update_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_bills_used TEXT := '';
  v_current_stock INTEGER;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org_id FROM sales WHERE id = NEW.sale_id;

  SELECT stock_qty INTO v_current_stock FROM product_variants WHERE id = NEW.variant_id;
  IF v_current_stock < NEW.quantity AND NOT public.org_allows_negative_stock(v_org_id) THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available %', NEW.quantity, v_current_stock;
  END IF;

  FOR v_batch IN
    SELECT bill_number, quantity, id FROM batch_stock
    WHERE variant_id = NEW.variant_id AND quantity > 0 ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    v_bills_used := v_bills_used || v_batch.bill_number || '(' || v_deduct_qty || '), ';

    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale', -v_deduct_qty, NEW.sale_id, v_batch.bill_number, 'FIFO deduction: ' || v_deduct_qty || ' units from bill ' || v_batch.bill_number, v_org_id, auth.uid());

    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale', -v_remaining_qty, NEW.sale_id, NULL, 'Sale from opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;

  UPDATE product_variants SET stock_qty = stock_qty - NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  RETURN NEW;
END;
$function$;
