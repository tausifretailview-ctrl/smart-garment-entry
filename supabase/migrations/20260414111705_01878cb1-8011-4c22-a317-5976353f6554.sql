
-- 1. Update detect_stock_discrepancies to exclude service/combo products
CREATE OR REPLACE FUNCTION public.detect_stock_discrepancies(p_organization_id uuid)
RETURNS TABLE(variant_id uuid, barcode text, product_name text, size text, current_stock_qty bigint, calculated_stock_qty bigint, discrepancy bigint, opening_qty bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH variant_calc AS (
    SELECT
      pv.id as vid,
      pv.barcode as vbarcode,
      p.product_name as vpname,
      pv.size as vsize,
      pv.stock_qty as vcurrent,
      COALESCE(pv.opening_qty, 0) as vopening,
      COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id WHERE pi.sku_id = pv.id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL), 0) as vpurchases,
      COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.variant_id = pv.id AND si.deleted_at IS NULL AND s.deleted_at IS NULL), 0) as vsales,
      COALESCE((SELECT SUM(pri.qty) FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pri.sku_id = pv.id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL), 0) as vpur_returns,
      COALESCE((SELECT SUM(sri.quantity) FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.return_id WHERE sri.variant_id = pv.id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL), 0) as vsale_returns,
      COALESCE((SELECT SUM(dci.quantity) FROM delivery_challan_items dci JOIN delivery_challans dc ON dc.id = dci.challan_id WHERE dci.variant_id = pv.id AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL AND dc.converted_to_invoice_id IS NULL AND dc.status != 'cancelled'), 0) as vpending_challans
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_organization_id
      AND pv.deleted_at IS NULL
      AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
  )
  SELECT
    vc.vid,
    vc.vbarcode,
    vc.vpname,
    vc.vsize,
    vc.vcurrent::bigint,
    (vc.vopening + vc.vpurchases - vc.vsales - vc.vpur_returns + vc.vsale_returns - vc.vpending_challans)::bigint,
    (vc.vcurrent - (vc.vopening + vc.vpurchases - vc.vsales - vc.vpur_returns + vc.vsale_returns - vc.vpending_challans))::bigint,
    vc.vopening::bigint
  FROM variant_calc vc
  WHERE vc.vcurrent != (vc.vopening + vc.vpurchases - vc.vsales - vc.vpur_returns + vc.vsale_returns - vc.vpending_challans)
  ORDER BY ABS(vc.vcurrent - (vc.vopening + vc.vpurchases - vc.vsales - vc.vpur_returns + vc.vsale_returns - vc.vpending_challans)) DESC;
END;
$$;

-- 2. Update reset_stock_from_transactions to exclude service/combo
CREATE OR REPLACE FUNCTION public.reset_stock_from_transactions(p_organization_id uuid)
RETURNS TABLE(fixed_count integer, details jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fixed_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_record RECORD;
BEGIN
  FOR v_record IN 
    WITH variant_transactions AS (
      SELECT pv.id as variant_id, pv.barcode, p.product_name, pv.size,
        pv.stock_qty as current_stock_qty, COALESCE(pv.opening_qty, 0) as opening_qty,
        COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id WHERE pi.sku_id = pv.id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL), 0) as purchase_qty,
        COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.variant_id = pv.id AND si.deleted_at IS NULL AND s.deleted_at IS NULL), 0) as sale_qty,
        COALESCE((SELECT SUM(pri.qty) FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pri.sku_id = pv.id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL), 0) as purchase_return_qty,
        COALESCE((SELECT SUM(sri.quantity) FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.return_id WHERE sri.variant_id = pv.id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL), 0) as sale_return_qty,
        COALESCE((SELECT SUM(dci.quantity) FROM delivery_challan_items dci JOIN delivery_challans dc ON dc.id = dci.challan_id WHERE dci.variant_id = pv.id AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL AND dc.converted_to_invoice_id IS NULL AND dc.status != 'cancelled'), 0) as pending_challan_qty
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.organization_id = p_organization_id AND pv.deleted_at IS NULL
        AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
    )
    SELECT vt.*, (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty - vt.pending_challan_qty) as calculated_stock
    FROM variant_transactions vt
    WHERE vt.current_stock_qty != (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty - vt.pending_challan_qty)
  LOOP
    UPDATE product_variants SET stock_qty = v_record.calculated_stock, updated_at = NOW() WHERE id = v_record.variant_id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, notes, organization_id, user_id)
    VALUES (v_record.variant_id, 'stock_reset', 0,
      'Stock reset: opening=' || v_record.opening_qty || ', purchases=' || v_record.purchase_qty || ', sales=' || v_record.sale_qty || ', pur_returns=' || v_record.purchase_return_qty || ', sale_returns=' || v_record.sale_return_qty || ', pending_dc=' || v_record.pending_challan_qty || ' | old=' || v_record.current_stock_qty || ', new=' || v_record.calculated_stock,
      p_organization_id, auth.uid());
    
    v_fixed_count := v_fixed_count + 1;
    v_details := v_details || jsonb_build_object(
      'barcode', v_record.barcode, 'product_name', v_record.product_name, 'size', v_record.size,
      'old_qty', v_record.current_stock_qty, 'new_qty', v_record.calculated_stock,
      'opening', v_record.opening_qty, 'purchases', v_record.purchase_qty, 'sales', v_record.sale_qty,
      'pur_returns', v_record.purchase_return_qty, 'sale_returns', v_record.sale_return_qty
    );
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count, v_details;
END;
$$;

-- 3. Update reconcile_variant_stock_qty to skip service/combo
CREATE OR REPLACE FUNCTION public.reconcile_variant_stock_qty(p_variant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_opening numeric;
  v_current numeric;
  v_product_type text;
  v_purchases numeric;
  v_sales numeric;
  v_pur_returns numeric;
  v_sale_returns numeric;
  v_pending_dc numeric;
  v_calculated numeric;
BEGIN
  SELECT pv.organization_id, COALESCE(pv.opening_qty, 0), COALESCE(pv.stock_qty, 0), COALESCE(p.product_type, 'goods')
  INTO v_org_id, v_opening, v_current, v_product_type
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Variant not found');
  END IF;

  -- Skip service and combo products
  IF v_product_type IN ('service', 'combo') THEN
    RETURN jsonb_build_object('variant_id', p_variant_id, 'old_stock', v_current, 'new_stock', v_current, 'corrected', false, 'skipped', true, 'reason', 'Service/combo products do not track stock');
  END IF;

  SELECT COALESCE(SUM(pi.qty), 0) INTO v_purchases
  FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id
  WHERE pi.sku_id = p_variant_id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL;

  SELECT COALESCE(SUM(si.quantity), 0) INTO v_sales
  FROM sale_items si JOIN sales s ON s.id = si.sale_id
  WHERE si.variant_id = p_variant_id AND si.deleted_at IS NULL AND s.deleted_at IS NULL;

  SELECT COALESCE(SUM(pri.qty), 0) INTO v_pur_returns
  FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id
  WHERE pri.sku_id = p_variant_id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL;

  SELECT COALESCE(SUM(sri.quantity), 0) INTO v_sale_returns
  FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.return_id
  WHERE sri.variant_id = p_variant_id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL;

  SELECT COALESCE(SUM(dci.quantity), 0) INTO v_pending_dc
  FROM delivery_challan_items dci JOIN delivery_challans dc ON dc.id = dci.challan_id
  WHERE dci.variant_id = p_variant_id AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL
    AND dc.converted_to_invoice_id IS NULL AND dc.status != 'cancelled';

  v_calculated := v_opening + v_purchases - v_sales - v_pur_returns + v_sale_returns - v_pending_dc;

  IF v_calculated != v_current THEN
    UPDATE product_variants SET stock_qty = v_calculated, updated_at = now()
    WHERE id = p_variant_id;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    VALUES (p_variant_id, v_org_id, 'reconciliation', v_calculated - v_current, p_variant_id,
      'Auto-reconciliation: opening=' || v_opening || ', purchases=' || v_purchases || ', sales=' || v_sales || ', pur_ret=' || v_pur_returns || ', sale_ret=' || v_sale_returns || ', pending_dc=' || v_pending_dc || ' | corrected ' || v_current || ' → ' || v_calculated);
  END IF;

  RETURN jsonb_build_object(
    'variant_id', p_variant_id,
    'old_stock', v_current,
    'new_stock', v_calculated,
    'corrected', v_calculated != v_current
  );
END;
$$;
