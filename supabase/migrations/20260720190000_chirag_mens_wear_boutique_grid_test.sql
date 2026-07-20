-- Chirag Men's Wear ONLY (test): seed Boutique Grid (50×38mm) as default thermal precision preset.
-- Org: e4e8ddf5-53cc-49c2-b453-739259dc53e2
-- Matches src/constants/boutiqueGridLabelTemplate.ts — labelStyle = boutique-grid.
-- Other orgs are untouched.

DO $$
DECLARE
  v_org_id uuid := 'e4e8ddf5-53cc-49c2-b453-739259dc53e2'::uuid;
  v_label_config jsonb := '{
    "labelStyle": "boutique-grid",
    "businessName": { "show": true, "fontSize": 11, "bold": true, "x": 1, "y": 0.5, "width": 42, "textAlign": "center" },
    "brand": { "show": true, "fontSize": 8, "bold": true, "x": 1, "y": 8, "width": 40 },
    "productName": { "show": true, "fontSize": 8, "bold": true, "x": 1, "y": 4, "width": 40 },
    "category": { "show": false, "fontSize": 8, "bold": true, "x": 1, "y": 10, "width": 40 },
    "color": { "show": true, "fontSize": 8, "bold": true, "x": 1, "y": 12, "width": 40 },
    "style": { "show": true, "fontSize": 8, "bold": true, "x": 1, "y": 6, "width": 40 },
    "size": { "show": true, "fontSize": 8, "bold": true, "x": 1, "y": 14, "width": 40 },
    "price": { "show": false, "fontSize": 8, "bold": true, "x": 1, "y": 16, "width": 40 },
    "mrp": { "show": true, "fontSize": 12, "bold": true, "x": 1, "y": 16, "width": 40 },
    "qty": { "show": false, "fontSize": 7, "bold": false, "x": 1, "y": 18, "width": 20 },
    "customText": { "show": false, "fontSize": 7, "bold": false, "x": 1, "y": 34, "width": 40, "textAlign": "center" },
    "barcode": { "show": true, "fontSize": 9, "bold": false, "x": 2, "y": 20, "width": 40, "height": 10 },
    "barcodeText": { "show": true, "fontSize": 8, "bold": true, "x": 1, "y": 31, "width": 40, "textAlign": "center" },
    "billNumber": { "show": false, "fontSize": 6, "bold": false, "x": 1, "y": 34, "width": 20 },
    "supplierCode": { "show": false, "fontSize": 6, "bold": false, "x": 25, "y": 34, "width": 20 },
    "purchaseCode": { "show": true, "fontSize": 7, "bold": true, "x": 44, "y": 8, "width": 5 },
    "supplierInvoiceNo": { "show": false, "fontSize": 6, "bold": false, "x": 25, "y": 35, "width": 20 },
    "fieldOrder": [
      "businessName", "productName", "style", "brand", "color", "size", "mrp",
      "barcode", "barcodeText", "purchaseCode", "category", "price", "qty",
      "customText", "billNumber", "supplierCode", "supplierInvoiceNo"
    ],
    "barcodeHeight": 28,
    "barcodeWidth": 2,
    "customTextValue": "",
    "customTextFields": [],
    "lines": []
  }'::jsonb;
  v_setting_data jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
    RAISE NOTICE 'Chirag Men''s Wear organization (e4e8ddf5-53cc-49c2-b453-739259dc53e2) not found — skipping Boutique Grid test seed';
    RETURN;
  END IF;

  RAISE NOTICE 'Seeding Boutique Grid test default for Chirag Men''s Wear (%)', v_org_id;

  v_setting_data := jsonb_build_object(
    'config', v_label_config,
    'labelWidth', 50,
    'labelHeight', 38
  );

  -- Clear thermal default only (per-mode unique index)
  UPDATE printer_presets
  SET is_default = false, updated_at = now()
  WHERE organization_id = v_org_id
    AND COALESCE(print_mode, 'thermal') = 'thermal'
    AND is_default = true;

  INSERT INTO barcode_label_settings (
    organization_id,
    setting_type,
    setting_name,
    setting_data,
    is_default
  ) VALUES (
    v_org_id,
    'label_template',
    'Boutique Grid',
    v_setting_data,
    true
  )
  ON CONFLICT (organization_id, setting_type, setting_name)
  DO UPDATE SET
    setting_data = EXCLUDED.setting_data,
    is_default = true,
    updated_at = now();

  INSERT INTO printer_presets (
    organization_id,
    name,
    label_width,
    label_height,
    x_offset,
    y_offset,
    v_gap,
    print_mode,
    thermal_cols,
    label_config,
    is_default
  ) VALUES (
    v_org_id,
    'Boutique Grid',
    50,
    38,
    0,
    0,
    2,
    'thermal',
    1,
    v_label_config,
    true
  )
  ON CONFLICT (organization_id, name)
  DO UPDATE SET
    label_width = 50,
    label_height = 38,
    v_gap = 2,
    print_mode = 'thermal',
    thermal_cols = 1,
    label_config = EXCLUDED.label_config,
    is_default = true,
    updated_at = now();
END $$;
