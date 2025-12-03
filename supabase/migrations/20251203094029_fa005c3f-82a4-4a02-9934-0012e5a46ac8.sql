-- Audit function for product variant price changes
CREATE OR REPLACE FUNCTION public.audit_variant_price_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only log if prices actually changed
  IF (OLD.sale_price IS DISTINCT FROM NEW.sale_price) 
     OR (OLD.pur_price IS DISTINCT FROM NEW.pur_price) THEN
    PERFORM log_audit(
      'PRICE_CHANGE',
      'product_variant',
      NEW.id,
      jsonb_build_object(
        'barcode', OLD.barcode,
        'size', OLD.size,
        'pur_price', OLD.pur_price,
        'sale_price', OLD.sale_price
      ),
      jsonb_build_object(
        'barcode', NEW.barcode,
        'size', NEW.size,
        'pur_price', NEW.pur_price,
        'sale_price', NEW.sale_price
      ),
      jsonb_build_object('table', 'product_variants', 'product_id', NEW.product_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for price change auditing
DROP TRIGGER IF EXISTS audit_variant_prices_trigger ON public.product_variants;
CREATE TRIGGER audit_variant_prices_trigger
AFTER UPDATE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.audit_variant_price_changes();