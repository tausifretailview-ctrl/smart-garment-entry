-- Create a function to reset stock based ONLY on purchase bill quantities
-- This will recalculate stock_qty = opening_qty + purchases - sales - purchase_returns + sale_returns
-- Ignoring all the duplicate/corrupted stock movements from old delete bugs

CREATE OR REPLACE FUNCTION public.reset_stock_from_transactions(p_organization_id uuid)
 RETURNS TABLE(fixed_count integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fixed_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_record RECORD;
BEGIN
  -- For each product variant in the organization
  FOR v_record IN 
    WITH variant_transactions AS (
      SELECT 
        pv.id as variant_id,
        pv.barcode,
        p.product_name,
        pv.size,
        pv.stock_qty as current_stock_qty,
        COALESCE(pv.opening_qty, 0) as opening_qty,
        -- Sum of active purchase items (not soft-deleted)
        COALESCE((
          SELECT SUM(pi.qty)
          FROM purchase_items pi
          JOIN purchase_bills pb ON pb.id = pi.bill_id
          WHERE pi.sku_id = pv.id 
            AND pi.deleted_at IS NULL 
            AND pb.deleted_at IS NULL
        ), 0) as purchase_qty,
        -- Sum of active sale items (not soft-deleted)
        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE si.variant_id = pv.id 
            AND si.deleted_at IS NULL 
            AND s.deleted_at IS NULL
        ), 0) as sale_qty,
        -- Sum of active purchase return items (not soft-deleted)
        COALESCE((
          SELECT SUM(pri.qty)
          FROM purchase_return_items pri
          JOIN purchase_returns pr ON pr.id = pri.return_id
          WHERE pri.sku_id = pv.id 
            AND pri.deleted_at IS NULL 
            AND pr.deleted_at IS NULL
        ), 0) as purchase_return_qty,
        -- Sum of active sale return items (not soft-deleted)
        COALESCE((
          SELECT SUM(sri.quantity)
          FROM sale_return_items sri
          JOIN sale_returns sr ON sr.id = sri.return_id
          WHERE sri.variant_id = pv.id 
            AND sri.deleted_at IS NULL 
            AND sr.deleted_at IS NULL
        ), 0) as sale_return_qty
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.organization_id = p_organization_id
        AND pv.deleted_at IS NULL
    )
    SELECT 
      vt.*,
      (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty) as calculated_stock
    FROM variant_transactions vt
    WHERE vt.current_stock_qty != (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty)
  LOOP
    -- Update stock_qty to calculated value
    UPDATE product_variants
    SET stock_qty = v_record.calculated_stock,
        updated_at = NOW()
    WHERE id = v_record.variant_id;
    
    -- Log the reset in stock_movements (quantity=0 for audit only)
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      notes,
      organization_id
    ) VALUES (
      v_record.variant_id,
      'stock_reset',
      0,
      'Stock reset from transactions: opening=' || v_record.opening_qty || 
      ', purchases=' || v_record.purchase_qty || 
      ', sales=' || v_record.sale_qty || 
      ', pur_returns=' || v_record.purchase_return_qty || 
      ', sale_returns=' || v_record.sale_return_qty || 
      ' | old_qty=' || v_record.current_stock_qty || 
      ', new_qty=' || v_record.calculated_stock,
      p_organization_id
    );
    
    v_fixed_count := v_fixed_count + 1;
    v_details := v_details || jsonb_build_object(
      'barcode', v_record.barcode,
      'product_name', v_record.product_name,
      'size', v_record.size,
      'old_qty', v_record.current_stock_qty,
      'new_qty', v_record.calculated_stock,
      'opening', v_record.opening_qty,
      'purchases', v_record.purchase_qty,
      'sales', v_record.sale_qty,
      'pur_returns', v_record.purchase_return_qty,
      'sale_returns', v_record.sale_return_qty
    );
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count, v_details;
END;
$function$;