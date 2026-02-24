
CREATE OR REPLACE FUNCTION public.merge_products(
  p_target_product_id UUID,
  p_source_product_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_variants_moved INTEGER;
  v_org_id UUID;
BEGIN
  -- Validate both products exist and belong to same org
  SELECT id, product_name, organization_id INTO v_target
  FROM products WHERE id = p_target_product_id AND deleted_at IS NULL;
  
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Target product not found or deleted';
  END IF;

  SELECT id, product_name, organization_id INTO v_source
  FROM products WHERE id = p_source_product_id AND deleted_at IS NULL;
  
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Source product not found or deleted';
  END IF;

  IF v_target.organization_id != v_source.organization_id THEN
    RAISE EXCEPTION 'Products belong to different organizations';
  END IF;

  v_org_id := v_target.organization_id;

  -- 1. Move all variants from source to target
  UPDATE product_variants
  SET product_id = p_target_product_id, updated_at = NOW()
  WHERE product_id = p_source_product_id;
  
  GET DIAGNOSTICS v_variants_moved = ROW_COUNT;

  -- 2. Update all transaction tables
  UPDATE sale_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE purchase_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE quotation_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE sale_order_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE sale_return_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE purchase_return_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE delivery_challan_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  UPDATE purchase_order_items SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  -- 3. Move product images
  UPDATE product_images SET product_id = p_target_product_id
  WHERE product_id = p_source_product_id;

  -- 4. Update customer_product_prices
  UPDATE customer_product_prices SET organization_id = v_org_id
  WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = p_target_product_id);

  -- 5. Soft-delete the source product
  UPDATE products
  SET deleted_at = NOW(), deleted_by = auth.uid()
  WHERE id = p_source_product_id;

  -- 6. Log the merge
  INSERT INTO audit_logs (organization_id, action, entity_type, entity_id, user_id, old_values, new_values, metadata)
  VALUES (
    v_org_id,
    'PRODUCT_MERGED',
    'product',
    p_target_product_id::text,
    auth.uid(),
    jsonb_build_object('source_product_id', p_source_product_id, 'source_name', v_source.product_name),
    jsonb_build_object('target_product_id', p_target_product_id, 'target_name', v_target.product_name),
    jsonb_build_object('variants_moved', v_variants_moved)
  );

  RETURN json_build_object(
    'success', true,
    'target_product_id', p_target_product_id,
    'source_product_id', p_source_product_id,
    'variants_moved', v_variants_moved
  );
END;
$$;
