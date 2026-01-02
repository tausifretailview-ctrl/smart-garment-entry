-- Create delivery_challans table
CREATE TABLE public.delivery_challans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challan_number TEXT NOT NULL,
  challan_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  sale_order_id UUID REFERENCES public.sale_orders(id),
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  flat_discount_percent NUMERIC NOT NULL DEFAULT 0,
  flat_discount_amount NUMERIC NOT NULL DEFAULT 0,
  round_off NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  salesman TEXT,
  shipping_address TEXT,
  notes TEXT,
  terms_conditions TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  converted_to_invoice_id UUID REFERENCES public.sales(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

-- Create delivery_challan_items table
CREATE TABLE public.delivery_challan_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challan_id UUID NOT NULL REFERENCES public.delivery_challans(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  variant_id UUID NOT NULL REFERENCES public.product_variants(id),
  product_name TEXT NOT NULL,
  size TEXT NOT NULL,
  barcode TEXT,
  color TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  mrp NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  hsn_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

-- Enable RLS
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_challan_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for delivery_challans
CREATE POLICY "Users can view delivery challans of their organizations"
ON public.delivery_challans FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can insert delivery challans to their organizations"
ON public.delivery_challans FOR INSERT
WITH CHECK (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can update delivery challans of their organizations"
ON public.delivery_challans FOR UPDATE
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can delete delivery challans of their organizations"
ON public.delivery_challans FOR DELETE
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- RLS policies for delivery_challan_items
CREATE POLICY "Users can view challan items of their organizations"
ON public.delivery_challan_items FOR SELECT
USING (challan_id IN (
  SELECT id FROM public.delivery_challans 
  WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
));

CREATE POLICY "Users can insert challan items to their organizations"
ON public.delivery_challan_items FOR INSERT
WITH CHECK (challan_id IN (
  SELECT id FROM public.delivery_challans 
  WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
));

CREATE POLICY "Users can update challan items of their organizations"
ON public.delivery_challan_items FOR UPDATE
USING (challan_id IN (
  SELECT id FROM public.delivery_challans 
  WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
));

CREATE POLICY "Users can delete challan items of their organizations"
ON public.delivery_challan_items FOR DELETE
USING (challan_id IN (
  SELECT id FROM public.delivery_challans 
  WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
));

-- Function to generate challan number
CREATE OR REPLACE FUNCTION public.generate_challan_number(p_organization_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT := 'DC';
  v_count INTEGER;
  v_number TEXT;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(
    CAST(REGEXP_REPLACE(challan_number, '^DC/' || financial_year || '/', '') AS INTEGER)
  ), 0) + 1
  INTO v_count
  FROM delivery_challans
  WHERE organization_id = p_organization_id
    AND challan_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$$;

-- Trigger for stock deduction on challan item insert
CREATE OR REPLACE FUNCTION public.update_stock_on_challan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_current_stock INTEGER;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  -- Get organization_id from the challan
  SELECT organization_id INTO v_org_id
  FROM delivery_challans
  WHERE id = NEW.challan_id;
  
  -- Get product type
  SELECT p.product_type INTO v_product_type
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id;
  
  -- Skip stock for services and combos
  IF v_product_type IN ('service', 'combo') THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id)
    VALUES (NEW.variant_id, 'challan', -NEW.quantity, NEW.challan_id, 'Service/Combo challan (no stock tracking)', v_org_id);
    RETURN NEW;
  END IF;
  
  -- Check available stock
  SELECT stock_qty INTO v_current_stock FROM product_variants WHERE id = NEW.variant_id;
  
  IF v_current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available %', NEW.quantity, v_current_stock;
  END IF;
  
  -- FIFO deduction from batches
  FOR v_batch IN 
    SELECT bill_number, quantity, id FROM batch_stock
    WHERE variant_id = NEW.variant_id AND quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id)
    VALUES (NEW.variant_id, 'challan', -v_deduct_qty, NEW.challan_id, v_batch.bill_number, 
            'Challan FIFO: ' || v_deduct_qty || ' from batch ' || v_batch.bill_number, v_org_id);
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id)
    VALUES (NEW.variant_id, 'challan', -v_remaining_qty, NEW.challan_id, 'Challan from opening stock', v_org_id);
  END IF;
  
  -- Update product_variants stock
  UPDATE product_variants SET stock_qty = stock_qty - NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_stock_on_challan
AFTER INSERT ON public.delivery_challan_items
FOR EACH ROW
EXECUTE FUNCTION update_stock_on_challan();

-- Trigger for stock restoration on challan item delete
CREATE OR REPLACE FUNCTION public.handle_challan_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  SELECT organization_id INTO v_org_id FROM delivery_challans WHERE id = OLD.challan_id;
  
  UPDATE product_variants SET stock_qty = stock_qty + OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;
  
  FOR v_batch IN 
    SELECT bill_number, id FROM batch_stock WHERE variant_id = OLD.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, OLD.quantity);
    
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id)
    VALUES (OLD.variant_id, 'challan_delete', v_restore_qty, OLD.challan_id, v_batch.bill_number,
            'Challan deleted: ' || v_restore_qty || ' restored to batch ' || v_batch.bill_number, v_org_id);
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id)
    VALUES (OLD.variant_id, 'challan_delete', v_remaining_qty, OLD.challan_id, 'Challan deleted: restored to opening stock', v_org_id);
  END IF;
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_handle_challan_item_delete
BEFORE DELETE ON public.delivery_challan_items
FOR EACH ROW
EXECUTE FUNCTION handle_challan_item_delete();

-- Soft delete function
CREATE OR REPLACE FUNCTION public.soft_delete_delivery_challan(p_challan_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM delivery_challans WHERE id = p_challan_id;
  
  FOR v_item IN 
    SELECT variant_id, quantity FROM delivery_challan_items
    WHERE challan_id = p_challan_id AND deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes)
      VALUES (v_item.variant_id, 'soft_delete_challan', v_item.quantity, p_challan_id, v_org_id, 'Stock restored - challan moved to recycle bin');
    END IF;
  END LOOP;
  
  UPDATE delivery_challan_items SET deleted_at = now(), deleted_by = p_user_id WHERE challan_id = p_challan_id;
  UPDATE delivery_challans SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_challan_id;
END;
$$;

-- Indexes
CREATE INDEX idx_delivery_challans_org ON public.delivery_challans(organization_id);
CREATE INDEX idx_delivery_challans_customer ON public.delivery_challans(customer_id);
CREATE INDEX idx_delivery_challans_date ON public.delivery_challans(challan_date);
CREATE INDEX idx_delivery_challan_items_challan ON public.delivery_challan_items(challan_id);
CREATE INDEX idx_delivery_challan_items_variant ON public.delivery_challan_items(variant_id);