-- Create customer_product_prices table for tracking customer-specific pricing
CREATE TABLE public.customer_product_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  last_sale_price NUMERIC NOT NULL,
  last_mrp NUMERIC NOT NULL,
  last_sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  last_order_id UUID REFERENCES public.sale_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_product_prices_unique UNIQUE (organization_id, customer_id, variant_id)
);

-- Create indexes for fast lookups
CREATE INDEX idx_customer_product_prices_customer ON public.customer_product_prices(customer_id);
CREATE INDEX idx_customer_product_prices_variant ON public.customer_product_prices(variant_id);
CREATE INDEX idx_customer_product_prices_org_customer ON public.customer_product_prices(organization_id, customer_id);

-- Enable RLS
ALTER TABLE public.customer_product_prices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view customer prices in their organization"
  ON public.customer_product_prices
  FOR SELECT
  USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can insert customer prices in their organization"
  ON public.customer_product_prices
  FOR INSERT
  WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can update customer prices in their organization"
  ON public.customer_product_prices
  FOR UPDATE
  USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can delete customer prices in their organization"
  ON public.customer_product_prices
  FOR DELETE
  USING (public.user_belongs_to_org(auth.uid(), organization_id));

-- Trigger function to update customer_product_prices on sale_items insert
CREATE OR REPLACE FUNCTION public.update_customer_product_price_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_org_id UUID;
  v_sale_date TIMESTAMPTZ;
BEGIN
  -- Get customer_id, organization_id, and sale_date from the sale
  SELECT customer_id, organization_id, sale_date
  INTO v_customer_id, v_org_id, v_sale_date
  FROM sales
  WHERE id = NEW.sale_id;
  
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
      last_sale_id
    ) VALUES (
      v_org_id,
      v_customer_id,
      NEW.variant_id,
      NEW.unit_price,
      NEW.mrp,
      v_sale_date,
      NEW.sale_id
    )
    ON CONFLICT (organization_id, customer_id, variant_id)
    DO UPDATE SET
      last_sale_price = EXCLUDED.last_sale_price,
      last_mrp = EXCLUDED.last_mrp,
      last_sale_date = EXCLUDED.last_sale_date,
      last_sale_id = EXCLUDED.last_sale_id,
      updated_at = now()
    WHERE customer_product_prices.last_sale_date < EXCLUDED.last_sale_date;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function to update customer_product_prices on sale_order_items insert
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

-- Create triggers
CREATE TRIGGER update_customer_price_on_sale
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_product_price_on_sale();

CREATE TRIGGER update_customer_price_on_order
  AFTER INSERT ON public.sale_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_product_price_on_order();