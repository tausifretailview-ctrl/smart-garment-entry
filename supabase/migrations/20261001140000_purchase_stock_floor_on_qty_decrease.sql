-- Floor on purchase-line stock decreases: never drive product_variants.stock_qty below 0
-- when units are already sold. Fixes silent negative stock from bill qty edit / line delete.
--
-- Schema notes (confirmed from types + reconciliation CTEs):
--   - purchase_items links variants via sku_id (not variant_id)
--   - sale_return_items has variant_id + return_id; NO sale_item_id column
--   - net sold = SUM(sale_items.quantity) - SUM(sale_return_items.quantity)
--     with deleted_at IS NULL on items and parent sales/sale_returns
--
-- Scope:
--   - INSERT (update_stock_on_purchase): only increases stock — no floor needed
--   - UPDATE (handle_purchase_item_update): floor on qty decrease and on sku_id change-out
--   - DELETE (handle_purchase_item_delete): same floor (removing a line is Δ = -OLD.qty)

CREATE OR REPLACE FUNCTION public.net_sold_qty_for_variant(p_variant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0::numeric,
    COALESCE((
      SELECT SUM(si.quantity)::numeric
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.variant_id = p_variant_id
        AND si.deleted_at IS NULL
        AND s.deleted_at IS NULL
    ), 0::numeric)
    -
    COALESCE((
      SELECT SUM(sri.quantity)::numeric
      FROM public.sale_return_items sri
      INNER JOIN public.sale_returns sr ON sr.id = sri.return_id
      WHERE sri.variant_id = p_variant_id
        AND sri.deleted_at IS NULL
        AND sr.deleted_at IS NULL
    ), 0::numeric)
  );
$$;

COMMENT ON FUNCTION public.net_sold_qty_for_variant(uuid) IS
  'Net units sold for a variant: gross sale_items minus sale_return_items (non-deleted parents).';

REVOKE ALL ON FUNCTION public.net_sold_qty_for_variant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.net_sold_qty_for_variant(uuid) TO authenticated, service_role;

-- Raise if decreasing stock by p_decrease would make stock_qty < 0.
CREATE OR REPLACE FUNCTION public.assert_variant_stock_decrease_allowed(
  p_variant_id uuid,
  p_decrease numeric
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_projected numeric;
  v_net_sold numeric;
BEGIN
  IF p_variant_id IS NULL OR COALESCE(p_decrease, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(pv.stock_qty, 0)::numeric
  INTO v_stock
  FROM public.product_variants pv
  WHERE pv.id = p_variant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_STOCK_FLOOR: variant % not found', p_variant_id;
  END IF;

  v_projected := v_stock - p_decrease;
  IF v_projected < 0 THEN
    v_net_sold := public.net_sold_qty_for_variant(p_variant_id);
    RAISE EXCEPTION
      'PURCHASE_STOCK_FLOOR: % units already sold — only % remain in stock; cannot reduce purchase quantity by %',
      v_net_sold,
      v_stock,
      p_decrease;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_variant_stock_decrease_allowed(uuid, numeric) IS
  'Blocks purchase stock decreases that would drive stock_qty negative (sold units still outstanding).';

REVOKE ALL ON FUNCTION public.assert_variant_stock_decrease_allowed(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_variant_stock_decrease_allowed(uuid, numeric)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- handle_purchase_item_update — same delta logic, floor before decreases
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qty_difference INTEGER;
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
  v_sku_changed BOOLEAN;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = COALESCE(NEW.sku_id, OLD.sku_id)
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  v_sku_changed := OLD.sku_id IS DISTINCT FROM NEW.sku_id;

  IF NOT v_sku_changed AND OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;

  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb WHERE pb.id = NEW.bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for purchase bill';
  END IF;

  IF v_sku_changed THEN
    IF OLD.sku_id IS NOT NULL THEN
      -- Reversing OLD.qty off the previous variant — same corruption door as qty decrease
      PERFORM public.assert_variant_stock_decrease_allowed(OLD.sku_id, OLD.qty);

      UPDATE product_variants
      SET stock_qty = stock_qty - OLD.qty, updated_at = NOW()
      WHERE id = OLD.sku_id;

      UPDATE batch_stock
      SET quantity = quantity - OLD.qty, updated_at = NOW()
      WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number;

      DELETE FROM batch_stock
      WHERE variant_id = OLD.sku_id
        AND bill_number = v_bill_number
        AND quantity <= 0;

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (OLD.sku_id, 'purchase_sku_change_out', -OLD.qty, NEW.bill_id, v_bill_number,
        'Purchase variant changed: reversed ' || OLD.qty || ' from old variant in bill ' || v_bill_number,
        v_org_id, auth.uid());
    END IF;

    IF NEW.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
      WHERE id = NEW.sku_id;

      INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
      VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
      ON CONFLICT (variant_id, bill_number)
      DO UPDATE SET quantity = batch_stock.quantity + NEW.qty, updated_at = NOW();

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (NEW.sku_id, 'purchase_sku_change_in', NEW.qty, NEW.bill_id, v_bill_number,
        'Purchase variant changed: added ' || NEW.qty || ' to new variant in bill ' || v_bill_number,
        v_org_id, auth.uid());
    END IF;

    RETURN NEW;
  END IF;

  v_qty_difference := NEW.qty - OLD.qty;

  -- Floor only when reducing stock; increases are always safe
  IF v_qty_difference < 0 THEN
    PERFORM public.assert_variant_stock_decrease_allowed(NEW.sku_id, ABS(v_qty_difference));
  END IF;

  UPDATE product_variants
  SET stock_qty = stock_qty + v_qty_difference, updated_at = NOW()
  WHERE id = NEW.sku_id;

  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, v_qty_difference, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = batch_stock.quantity + v_qty_difference, updated_at = NOW();

  DELETE FROM batch_stock
  WHERE variant_id = NEW.sku_id
    AND bill_number = v_bill_number
    AND quantity <= 0;

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id,
    CASE WHEN v_qty_difference > 0 THEN 'purchase_increase' ELSE 'purchase_decrease' END,
    v_qty_difference, NEW.bill_id, v_bill_number,
    'Stock adjusted: Purchase qty changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number,
    v_org_id, auth.uid());

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Preserve intentional floor errors for the client; wrap unexpected failures
    IF SQLERRM LIKE 'PURCHASE_STOCK_FLOOR:%' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$$;

-- ---------------------------------------------------------------------------
-- handle_purchase_item_delete — same floor (line delete ≡ full qty reverse)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_purchase_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.sku_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;

  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb WHERE pb.id = OLD.bill_id;

  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization ID not found for purchase bill'; END IF;

  PERFORM public.assert_variant_stock_decrease_allowed(OLD.sku_id, OLD.qty);

  UPDATE product_variants SET stock_qty = stock_qty - OLD.qty, updated_at = NOW() WHERE id = OLD.sku_id;
  UPDATE batch_stock SET quantity = quantity - OLD.qty, updated_at = NOW() WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number;
  DELETE FROM batch_stock WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number AND quantity <= 0;

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (OLD.sku_id, 'purchase_delete', -OLD.qty, OLD.bill_id, v_bill_number, 'Stock decreased: Purchase item deleted from bill ' || v_bill_number, v_org_id, auth.uid());

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'PURCHASE_STOCK_FLOOR:%' THEN
      RAISE;
    END IF;
    RAISE EXCEPTION 'Error in purchase_item_delete trigger: %', SQLERRM;
END;
$function$;
