-- Create function to check if a purchase bill has stock dependencies (active sales using the stock)
CREATE OR REPLACE FUNCTION check_purchase_stock_dependencies(p_bill_id UUID)
RETURNS TABLE (
  sale_id UUID,
  sale_number TEXT,
  sale_date TIMESTAMPTZ,
  product_name TEXT,
  size TEXT,
  quantity INTEGER,
  would_go_negative BOOLEAN,
  current_stock INTEGER,
  purchased_qty INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Get organization_id from purchase bill
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;
  
  RETURN QUERY
  WITH purchase_variants AS (
    -- Get all variants and quantities from this purchase bill
    SELECT 
      pi.sku_id as variant_id,
      pi.qty as purchased_qty,
      pi.product_name,
      pi.size
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
  ),
  variant_current_stock AS (
    -- Get current stock for each variant
    SELECT 
      pv.id as variant_id,
      pv.stock_qty
    FROM product_variants pv
    WHERE pv.id IN (SELECT variant_id FROM purchase_variants)
  ),
  sales_using_stock AS (
    -- Find active sales that have items from these variants
    SELECT DISTINCT
      s.id as sale_id,
      s.sale_number,
      s.sale_date,
      si.product_name,
      si.size,
      si.quantity,
      si.variant_id
    FROM sales s
    INNER JOIN sale_items si ON si.sale_id = s.id
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.variant_id IN (SELECT variant_id FROM purchase_variants)
  )
  SELECT 
    sus.sale_id,
    sus.sale_number,
    sus.sale_date,
    COALESCE(sus.product_name, pv.product_name) as product_name,
    COALESCE(sus.size, pv.size) as size,
    sus.quantity::INTEGER,
    (vcs.stock_qty - pv.purchased_qty < 0)::BOOLEAN as would_go_negative,
    vcs.stock_qty::INTEGER as current_stock,
    pv.purchased_qty::INTEGER as purchased_qty
  FROM sales_using_stock sus
  INNER JOIN purchase_variants pv ON pv.variant_id = sus.variant_id
  INNER JOIN variant_current_stock vcs ON vcs.variant_id = sus.variant_id
  WHERE vcs.stock_qty - pv.purchased_qty < 0  -- Only return if would cause negative stock
  ORDER BY sus.sale_date DESC;
END;
$$;