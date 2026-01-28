-- Fix: Skip customer_product_prices update for NULL variant_id (custom size items)
CREATE OR REPLACE FUNCTION public.update_customer_product_price_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_org_id UUID;
  v_order_date TIMESTAMPTZ;
BEGIN
  -- Skip if variant_id is NULL (custom size items don't have a variant)
  IF NEW.variant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get customer_id, organization_id, and order_date from the sale order
  SELECT customer_id, organization_id, order_date
  INTO v_customer_id, v_org_id, v_order_date
  FROM sale_orders
  WHERE id = NEW.order_id;
  
  -- Only process if customer is set
  IF v_customer_id IS NOT NULL THEN
    -- Upsert into customer_product_prices
    INSERT INTO customer_product_prices (
      organization_id,
      customer_id,
      variant_id,
      last_sale_price,
      last_mrp,
      last_sale_date,
      last_order_id
    ) VALUES (
      v_org_id,
      v_customer_id,
      NEW.variant_id,
      NEW.unit_price,
      NEW.mrp,
      v_order_date,
      NEW.order_id
    )
    ON CONFLICT (organization_id, customer_id, variant_id)
    DO UPDATE SET
      last_sale_price = EXCLUDED.last_sale_price,
      last_mrp = EXCLUDED.last_mrp,
      last_sale_date = EXCLUDED.last_sale_date,
      last_order_id = EXCLUDED.last_order_id,
      last_sale_id = NULL,
      updated_at = now()
    WHERE customer_product_prices.last_sale_date < EXCLUDED.last_sale_date;
  END IF;
  
  RETURN NEW;
END;
$$;