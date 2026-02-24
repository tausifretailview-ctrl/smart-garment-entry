
CREATE OR REPLACE FUNCTION public.merge_products(p_target_product_id uuid, p_source_product_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_variants_moved INTEGER := 0;
  v_variants_merged INTEGER := 0;
  v_org_id UUID;
  v_combined_colors TEXT;
  v_src_variant RECORD;
  v_target_variant_id UUID;
BEGIN
  SELECT id, product_name, organization_id INTO v_target
  FROM products WHERE id = p_target_product_id AND deleted_at IS NULL;

  SELECT id, product_name, organization_id INTO v_source
  FROM products WHERE id = p_source_product_id AND deleted_at IS NULL;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Target product not found or is deleted.';
  END IF;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Source product not found or is deleted.';
  END IF;
  IF v_target.organization_id != v_source.organization_id THEN
    RAISE EXCEPTION 'Products must belong to the same organization.';
  END IF;

  v_org_id := v_target.organization_id;

  -- Process each source variant
  FOR v_src_variant IN
    SELECT * FROM product_variants
    WHERE product_id = p_source_product_id AND deleted_at IS NULL
  LOOP
    -- Check if target already has a variant with same color+size
    SELECT id INTO v_target_variant_id
    FROM product_variants
    WHERE product_id = p_target_product_id
      AND COALESCE(color, '') = COALESCE(v_src_variant.color, '')
      AND size = v_src_variant.size
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_target_variant_id IS NOT NULL THEN
      -- Consolidate stock into target variant
      UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) + COALESCE(v_src_variant.stock_qty, 0),
          opening_qty = COALESCE(opening_qty, 0) + COALESCE(v_src_variant.opening_qty, 0)
      WHERE id = v_target_variant_id;

      -- Reassign all transaction references from source variant to target variant
      UPDATE sale_items SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE purchase_items SET sku_id = v_target_variant_id WHERE sku_id = v_src_variant.id;
      UPDATE sale_return_items SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE purchase_return_items SET sku_id = v_target_variant_id WHERE sku_id = v_src_variant.id;
      UPDATE quotation_items SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE sale_order_items SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE delivery_challan_items SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE batch_stock SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE stock_movements SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;
      UPDATE customer_product_prices SET variant_id = v_target_variant_id WHERE variant_id = v_src_variant.id;

      -- Soft-delete the source variant
      UPDATE product_variants SET deleted_at = NOW() WHERE id = v_src_variant.id;
      v_variants_merged := v_variants_merged + 1;
    ELSE
      -- No conflict: move variant to target product
      UPDATE product_variants SET product_id = p_target_product_id WHERE id = v_src_variant.id;
      v_variants_moved := v_variants_moved + 1;
    END IF;
  END LOOP;

  -- Update product-level references
  UPDATE sale_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;
  UPDATE purchase_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;
  UPDATE sale_return_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;
  UPDATE purchase_return_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;
  UPDATE quotation_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;
  UPDATE sale_order_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;
  UPDATE delivery_challan_items SET product_id = p_target_product_id WHERE product_id = p_source_product_id;

  -- Move product images
  UPDATE product_images SET product_id = p_target_product_id WHERE product_id = p_source_product_id;

  -- Rebuild color field on target
  SELECT STRING_AGG(DISTINCT v.color, ', ' ORDER BY v.color)
  INTO v_combined_colors
  FROM product_variants v
  WHERE v.product_id = p_target_product_id AND v.deleted_at IS NULL AND v.color IS NOT NULL;

  UPDATE products SET color = v_combined_colors WHERE id = p_target_product_id;

  -- Soft-delete source product
  UPDATE products SET deleted_at = NOW() WHERE id = p_source_product_id;

  -- Audit log with proper UUID cast
  INSERT INTO audit_logs (organization_id, entity_type, entity_id, action, old_values, new_values)
  VALUES (
    v_org_id,
    'product',
    p_target_product_id,
    'PRODUCT_MERGED',
    jsonb_build_object('source_product_id', p_source_product_id, 'source_product_name', v_source.product_name),
    jsonb_build_object('variants_moved', v_variants_moved, 'variants_merged', v_variants_merged, 'target_product_name', v_target.product_name)
  );

  RETURN json_build_object(
    'variants_moved', v_variants_moved,
    'variants_merged', v_variants_merged
  );
END;
$function$;
