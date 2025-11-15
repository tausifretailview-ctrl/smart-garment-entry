-- Drop existing triggers and indexes if they exist
DROP TRIGGER IF EXISTS audit_products_trigger ON public.products;
DROP TRIGGER IF EXISTS audit_sales_trigger ON public.sales;
DROP TRIGGER IF EXISTS audit_purchase_trigger ON public.purchase_bills;
DROP TRIGGER IF EXISTS audit_stock_movements_trigger ON public.stock_movements;
DROP TRIGGER IF EXISTS audit_user_roles_trigger ON public.user_roles;

DROP INDEX IF EXISTS public.idx_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_audit_logs_user_id;
DROP INDEX IF EXISTS public.idx_audit_logs_entity_type;
DROP INDEX IF EXISTS public.idx_audit_logs_action;
DROP INDEX IF EXISTS public.idx_audit_logs_entity_id;

-- Create audit_logs table for comprehensive activity tracking
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON public.audit_logs(entity_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policy and recreate
DROP POLICY IF EXISTS "Admins and managers can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins and managers can view audit logs"
ON public.audit_logs FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- Create function to log audit entry
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_user_email TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = auth.uid();
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  ) VALUES (
    auth.uid(),
    v_user_email,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit TO authenticated;

-- Create trigger function for product changes
CREATE OR REPLACE FUNCTION public.audit_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'CREATE',
      'product',
      NEW.id,
      NULL,
      to_jsonb(NEW),
      jsonb_build_object('table', 'products')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'UPDATE',
      'product',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('table', 'products')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'DELETE',
      'product',
      OLD.id,
      to_jsonb(OLD),
      NULL,
      jsonb_build_object('table', 'products')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_products_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.audit_product_changes();

-- Create trigger function for sales changes
CREATE OR REPLACE FUNCTION public.audit_sales_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'SALE_CREATED',
      'sale',
      NEW.id,
      NULL,
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'customer_name', NEW.customer_name,
        'net_amount', NEW.net_amount,
        'payment_method', NEW.payment_method
      ),
      jsonb_build_object('table', 'sales')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'SALE_UPDATED',
      'sale',
      NEW.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'net_amount', OLD.net_amount,
        'payment_status', OLD.payment_status
      ),
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'net_amount', NEW.net_amount,
        'payment_status', NEW.payment_status
      ),
      jsonb_build_object('table', 'sales')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'SALE_DELETED',
      'sale',
      OLD.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'customer_name', OLD.customer_name,
        'net_amount', OLD.net_amount
      ),
      NULL,
      jsonb_build_object('table', 'sales', 'warning', 'Sale deletion affects stock')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_sales_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.audit_sales_changes();

-- Create trigger function for purchase bills
CREATE OR REPLACE FUNCTION public.audit_purchase_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'PURCHASE_CREATED',
      'purchase_bill',
      NEW.id,
      NULL,
      jsonb_build_object(
        'supplier_name', NEW.supplier_name,
        'supplier_invoice_no', NEW.supplier_invoice_no,
        'net_amount', NEW.net_amount
      ),
      jsonb_build_object('table', 'purchase_bills')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'PURCHASE_UPDATED',
      'purchase_bill',
      NEW.id,
      jsonb_build_object('supplier_name', OLD.supplier_name, 'net_amount', OLD.net_amount),
      jsonb_build_object('supplier_name', NEW.supplier_name, 'net_amount', NEW.net_amount),
      jsonb_build_object('table', 'purchase_bills')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'PURCHASE_DELETED',
      'purchase_bill',
      OLD.id,
      jsonb_build_object('supplier_name', OLD.supplier_name, 'net_amount', OLD.net_amount),
      NULL,
      jsonb_build_object('table', 'purchase_bills', 'warning', 'Purchase deletion affects stock')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_purchase_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_bills
FOR EACH ROW EXECUTE FUNCTION public.audit_purchase_changes();

-- Create trigger function for stock movements
CREATE OR REPLACE FUNCTION public.audit_stock_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_info JSONB;
BEGIN
  SELECT jsonb_build_object(
    'product_name', p.product_name,
    'size', pv.size,
    'barcode', pv.barcode
  ) INTO v_product_info
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id;

  PERFORM log_audit(
    'STOCK_MOVEMENT',
    'stock_movement',
    NEW.id,
    NULL,
    jsonb_build_object(
      'movement_type', NEW.movement_type,
      'quantity', NEW.quantity,
      'reference_id', NEW.reference_id,
      'product_info', v_product_info
    ),
    jsonb_build_object('table', 'stock_movements')
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_stock_movements_trigger
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.audit_stock_changes();

-- Create trigger function for user role changes
CREATE OR REPLACE FUNCTION public.audit_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'ROLE_ASSIGNED',
      'user_role',
      NEW.id,
      NULL,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role),
      jsonb_build_object('table', 'user_roles')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'ROLE_UPDATED',
      'user_role',
      NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      jsonb_build_object('table', 'user_roles')
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'ROLE_REMOVED',
      'user_role',
      OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role),
      NULL,
      jsonb_build_object('table', 'user_roles')
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_user_roles_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_role_changes();