-- Ranawat org: seed BLING JEWELLERY LABEL (100×15mm 1-up, 2mm gap) as default precision preset.
-- Matches src/constants/ranawatBlingLabelTemplate.ts

DO $$
DECLARE
  v_org_id uuid;
  v_label_config jsonb := '{
    "businessName": { "show": true, "fontSize": 8, "bold": true, "x": 4, "y": 1, "width": 42, "textAlign": "center" },
    "barcode": { "show": true, "fontSize": 9, "bold": false, "x": 6, "y": 4.5, "width": 38, "height": 5 },
    "price": { "show": true, "fontSize": 10, "bold": true, "x": 4, "y": 10.5, "width": 42, "textAlign": "center" },
    "barcodeText": { "show": true, "fontSize": 7, "bold": true, "x": 50, "y": 1, "width": 48, "textAlign": "right" },
    "productName": { "show": true, "fontSize": 7, "bold": false, "x": 50, "y": 4, "width": 36, "textAlign": "right", "lineHeight": 1.1 },
    "brand": { "show": true, "fontSize": 7, "bold": true, "x": 86, "y": 7, "width": 12, "textAlign": "right" },
    "purchaseCode": { "show": true, "fontSize": 7, "bold": false, "x": 50, "y": 10.5, "width": 24, "textAlign": "left" },
    "size": { "show": true, "fontSize": 7, "bold": true, "x": 86, "y": 10.5, "width": 12, "textAlign": "right" },
    "category": { "show": false, "fontSize": 7, "bold": false, "x": 0, "y": 0, "width": 20 },
    "color": { "show": false, "fontSize": 7, "bold": false, "x": 0, "y": 0, "width": 20 },
    "style": { "show": false, "fontSize": 7, "bold": false, "x": 0, "y": 0, "width": 20 },
    "mrp": { "show": false, "fontSize": 7, "bold": false, "x": 0, "y": 0, "width": 20 },
    "qty": { "show": false, "fontSize": 7, "bold": false, "x": 0, "y": 0, "width": 20 },
    "customText": { "show": false, "fontSize": 7, "bold": false, "x": 0, "y": 0, "width": 48, "textAlign": "center" },
    "billNumber": { "show": false, "fontSize": 6, "bold": false, "x": 0, "y": 0, "width": 20 },
    "supplierCode": { "show": false, "fontSize": 6, "bold": false, "x": 0, "y": 0, "width": 24 },
    "supplierInvoiceNo": { "show": false, "fontSize": 6, "bold": false, "x": 0, "y": 0, "width": 24 },
    "fieldOrder": ["businessName", "barcode", "price", "barcodeText", "productName", "brand", "purchaseCode", "size"],
    "barcodeHeight": 33,
    "barcodeWidth": 1.5,
    "customTextValue": "",
    "customTextFields": [],
    "lines": []
  }'::jsonb;
  v_setting_data jsonb;
BEGIN
  v_org_id := '67443f44-6372-4cf3-b017-fddd7e3bb71b'::uuid;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id) THEN
    RAISE NOTICE 'Ranawat Bling organization (67443f44-6372-4cf3-b017-fddd7e3bb71b) not found — skipping BLING JEWELLERY LABEL seed';
    RETURN;
  END IF;

  v_setting_data := jsonb_build_object(
    'config', v_label_config,
    'labelWidth', 100,
    'labelHeight', 15
  );

  -- Clear org-wide default so BLING becomes the single auto-load preset
  UPDATE printer_presets
  SET is_default = false, updated_at = now()
  WHERE organization_id = v_org_id;

  INSERT INTO barcode_label_settings (
    organization_id,
    setting_type,
    setting_name,
    setting_data,
    is_default
  ) VALUES (
    v_org_id,
    'label_template',
    'BLING JEWELLERY LABEL',
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
    'BLING JEWELLERY LABEL',
    100,
    15,
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
    label_width = 100,
    label_height = 15,
    v_gap = 2,
    print_mode = 'thermal',
    thermal_cols = 1,
    label_config = EXCLUDED.label_config,
    is_default = true,
    updated_at = now();
END $$;
