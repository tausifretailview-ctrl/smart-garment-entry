-- Create purchase_returns table
CREATE TABLE public.purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name TEXT NOT NULL,
  original_bill_number TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  gst_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create purchase_return_items table
CREATE TABLE public.purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  sku_id UUID NOT NULL REFERENCES public.product_variants(id),
  size TEXT NOT NULL,
  qty INTEGER NOT NULL,
  pur_price NUMERIC NOT NULL,
  gst_per INTEGER NOT NULL,
  hsn_code TEXT,
  barcode TEXT,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on purchase_returns
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;

-- Enable RLS on purchase_return_items
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for purchase_returns
CREATE POLICY "Users can view returns in their organizations"
ON public.purchase_returns
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage returns"
ON public.purchase_returns
FOR ALL
USING (
  user_belongs_to_org(auth.uid(), organization_id) AND 
  (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
   has_org_role(auth.uid(), organization_id, 'manager'::app_role))
)
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id) AND 
  (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
   has_org_role(auth.uid(), organization_id, 'manager'::app_role))
);

-- RLS policies for purchase_return_items
CREATE POLICY "Users can view return items in their organizations"
ON public.purchase_return_items
FOR SELECT
USING (
  return_id IN (
    SELECT id FROM public.purchase_returns 
    WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  )
);

CREATE POLICY "Admins and managers can manage return items"
ON public.purchase_return_items
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Create trigger function for stock deduction on purchase returns
CREATE OR REPLACE FUNCTION public.deduct_stock_on_purchase_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_date TIMESTAMPTZ;
  v_remaining_qty INTEGER := NEW.qty;
  v_batch RECORD;
  v_deduct_qty INTEGER;
BEGIN
  -- Get return date
  SELECT return_date INTO v_return_date
  FROM purchase_returns
  WHERE id = NEW.return_id;
  
  -- Deduct from batch_stock using FIFO (oldest first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = NEW.sku_id 
      AND quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    -- Calculate how much to deduct from this batch
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    
    -- Update batch stock
    UPDATE batch_stock
    SET quantity = quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Record stock movement for this batch
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.sku_id,
      'purchase_return',
      -v_deduct_qty,
      NEW.return_id,
      v_batch.bill_number,
      'Purchase return: ' || v_deduct_qty || ' units returned from batch ' || v_batch.bill_number
    );
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  -- If remaining quantity (deduct from opening stock)
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.sku_id,
      'purchase_return',
      -v_remaining_qty,
      NEW.return_id,
      NULL,
      'Purchase return from opening stock: ' || v_remaining_qty || ' units'
    );
  END IF;
  
  -- Decrease total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.qty,
      updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger on purchase_return_items
CREATE TRIGGER trigger_deduct_stock_on_purchase_return
AFTER INSERT ON public.purchase_return_items
FOR EACH ROW
EXECUTE FUNCTION public.deduct_stock_on_purchase_return();

-- Add updated_at trigger for purchase_returns
CREATE TRIGGER update_purchase_returns_updated_at
BEFORE UPDATE ON public.purchase_returns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();