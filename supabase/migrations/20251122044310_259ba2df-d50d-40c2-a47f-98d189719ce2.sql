-- Create sale_returns table
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_id UUID,
  customer_name TEXT NOT NULL,
  original_sale_number TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create sale_return_items table
CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  variant_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  gst_percent INTEGER NOT NULL,
  barcode TEXT,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on sale_returns
ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;

-- Enable RLS on sale_return_items
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sale_returns
CREATE POLICY "Users can view returns in their organizations"
ON public.sale_returns
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can insert returns"
ON public.sale_returns
FOR INSERT
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND (has_org_role(auth.uid(), organization_id, 'admin'::app_role) 
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role))
);

CREATE POLICY "Admins and managers can update returns"
ON public.sale_returns
FOR UPDATE
USING (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND (has_org_role(auth.uid(), organization_id, 'admin'::app_role) 
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role))
);

CREATE POLICY "Admins can delete returns"
ON public.sale_returns
FOR DELETE
USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- RLS Policies for sale_return_items
CREATE POLICY "Users can view return items in their organizations"
ON public.sale_return_items
FOR SELECT
USING (
  return_id IN (
    SELECT id FROM public.sale_returns 
    WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  )
);

CREATE POLICY "Admins and managers can manage return items"
ON public.sale_return_items
FOR ALL
USING (
  return_id IN (
    SELECT sr.id FROM public.sale_returns sr
    WHERE user_belongs_to_org(auth.uid(), sr.organization_id) 
      AND (has_org_role(auth.uid(), sr.organization_id, 'admin'::app_role) 
        OR has_org_role(auth.uid(), sr.organization_id, 'manager'::app_role))
  )
)
WITH CHECK (
  return_id IN (
    SELECT sr.id FROM public.sale_returns sr
    WHERE user_belongs_to_org(auth.uid(), sr.organization_id) 
      AND (has_org_role(auth.uid(), sr.organization_id, 'admin'::app_role) 
        OR has_org_role(auth.uid(), sr.organization_id, 'manager'::app_role))
  )
);

-- Create trigger function to restore stock on sale return
CREATE OR REPLACE FUNCTION public.restore_stock_on_sale_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_return_date DATE;
BEGIN
  -- Get return date
  SELECT return_date INTO v_return_date
  FROM sale_returns
  WHERE id = NEW.return_id;
  
  -- Step 1: Increase total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  -- Step 2: Restore to batch_stock (FIFO - oldest batches first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = NEW.variant_id
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    v_restore_qty := LEAST(v_remaining_qty, NEW.quantity);
    
    -- Increase batch quantity
    UPDATE batch_stock
    SET quantity = quantity + v_restore_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Log restoration in stock_movements
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.variant_id,
      'sale_return',
      v_restore_qty,
      NEW.return_id,
      v_batch.bill_number,
      'Sale return: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number
    );
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  -- Step 3: If remaining qty (no batch found), log as opening stock addition
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.variant_id,
      'sale_return',
      v_remaining_qty,
      NEW.return_id,
      NULL,
      'Sale return to opening stock: ' || v_remaining_qty || ' units'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on sale_return_items
CREATE TRIGGER trigger_restore_stock_on_sale_return
  AFTER INSERT ON public.sale_return_items
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_stock_on_sale_return();

-- Add updated_at trigger for sale_returns
CREATE TRIGGER update_sale_returns_updated_at
  BEFORE UPDATE ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();