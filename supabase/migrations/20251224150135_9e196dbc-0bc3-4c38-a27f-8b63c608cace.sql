-- Fix detect_stock_discrepancies to EXCLUDE reconciliation movements from calculation
-- This prevents the loop where reconciliation movements affect future scans
CREATE OR REPLACE FUNCTION public.detect_stock_discrepancies(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(variant_id uuid, barcode text, product_name text, size text, current_stock_qty integer, calculated_stock_qty bigint, discrepancy bigint, opening_qty integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH movement_totals AS (
    SELECT 
      sm.variant_id,
      COALESCE(SUM(sm.quantity), 0) as total_movements
    FROM stock_movements sm
    WHERE (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
      AND sm.movement_type <> 'reconciliation'  -- EXCLUDE reconciliation from calculation
    GROUP BY sm.variant_id
  )
  SELECT 
    pv.id as variant_id,
    pv.barcode,
    p.product_name,
    pv.size,
    pv.stock_qty as current_stock_qty,
    (COALESCE(pv.opening_qty, 0) + COALESCE(mt.total_movements, 0))::bigint as calculated_stock_qty,
    (pv.stock_qty - (COALESCE(pv.opening_qty, 0) + COALESCE(mt.total_movements, 0)))::bigint as discrepancy,
    COALESCE(pv.opening_qty, 0) as opening_qty
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  LEFT JOIN movement_totals mt ON mt.variant_id = pv.id
  WHERE (p_organization_id IS NULL OR pv.organization_id = p_organization_id)
    AND pv.stock_qty != (COALESCE(pv.opening_qty, 0) + COALESCE(mt.total_movements, 0))
  ORDER BY ABS(pv.stock_qty - (COALESCE(pv.opening_qty, 0) + COALESCE(mt.total_movements, 0))) DESC;
END;
$function$;

-- Fix fix_stock_discrepancies to insert reconciliation with quantity=0 (audit only)
-- The actual adjustment is stored in notes, not as a quantity that affects calculations
CREATE OR REPLACE FUNCTION public.fix_stock_discrepancies(p_organization_id uuid DEFAULT NULL::uuid)
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
  FOR v_record IN 
    SELECT * FROM detect_stock_discrepancies(p_organization_id)
  LOOP
    -- Update stock_qty to match calculated value
    UPDATE product_variants
    SET stock_qty = v_record.calculated_stock_qty,
        updated_at = NOW()
    WHERE id = v_record.variant_id;
    
    -- Record the fix in stock_movements for audit trail
    -- IMPORTANT: quantity = 0 so it doesn't affect future calculations
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      notes,
      organization_id
    )
    SELECT 
      v_record.variant_id,
      'reconciliation',
      0,  -- Zero quantity - audit only, doesn't affect totals
      'Stock reconciliation: adjusted from ' || v_record.current_stock_qty || ' to ' || v_record.calculated_stock_qty || ' (adjustment: ' || (-v_record.discrepancy) || ')',
      pv.organization_id
    FROM product_variants pv
    WHERE pv.id = v_record.variant_id;
    
    v_fixed_count := v_fixed_count + 1;
    v_details := v_details || jsonb_build_object(
      'barcode', v_record.barcode,
      'product_name', v_record.product_name,
      'size', v_record.size,
      'old_qty', v_record.current_stock_qty,
      'new_qty', v_record.calculated_stock_qty,
      'adjustment', -v_record.discrepancy
    );
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count, v_details;
END;
$function$;