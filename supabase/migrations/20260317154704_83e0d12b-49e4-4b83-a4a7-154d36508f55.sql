-- Update printer_presets "new1" for velvet org with the correct design matching the screenshot
UPDATE printer_presets 
SET label_config = jsonb_build_object(
  'fieldOrder', '["businessName","brand","productName","category","color","style","size","price","mrp","barcode","barcodeText","customText","billNumber","supplierCode","purchaseCode"]'::jsonb,
  'businessName', '{"show":true,"bold":true,"fontSize":11,"textAlign":"left","width":20,"x":1,"y":0}'::jsonb,
  'brand', '{"show":true,"bold":true,"fontSize":10,"textAlign":"left","width":15,"x":22.5,"y":1}'::jsonb,
  'productName', '{"show":true,"bold":true,"fontSize":11,"textAlign":"left","width":20,"x":1.5,"y":5.5}'::jsonb,
  'category', '{"show":false,"bold":false,"fontSize":7,"width":20,"x":1,"y":6}'::jsonb,
  'color', '{"show":true,"bold":true,"fontSize":10,"textAlign":"left","width":15,"x":25,"y":5.5}'::jsonb,
  'style', '{"show":true,"bold":false,"fontSize":9,"textAlign":"left","width":15,"x":10,"y":10.5}'::jsonb,
  'size', '{"show":true,"bold":true,"fontSize":10,"textAlign":"left","width":10,"x":2,"y":10.5}'::jsonb,
  'price', '{"show":true,"bold":true,"fontSize":12,"textAlign":"right","width":16,"x":25,"y":8}'::jsonb,
  'mrp', '{"show":false,"bold":false,"fontSize":7,"textAlign":"right","width":18,"x":30,"y":9}'::jsonb,
  'barcode', '{"show":true,"bold":false,"fontSize":9,"height":8,"width":30,"x":4,"y":13.5}'::jsonb,
  'barcodeText', '{"show":true,"bold":true,"fontSize":9,"textAlign":"right","width":20,"x":20,"y":20}'::jsonb,
  'barcodeHeight', '20'::jsonb,
  'barcodeWidth', '1.5'::jsonb,
  'customText', '{"show":false,"bold":false,"fontSize":7,"textAlign":"center","width":48,"x":1,"y":22}'::jsonb,
  'customTextValue', '""'::jsonb,
  'billNumber', '{"show":false,"bold":false,"fontSize":6,"width":20,"x":1,"y":22}'::jsonb,
  'supplierCode', '{"show":false,"bold":false,"fontSize":6,"width":24,"x":18.5,"y":23.5}'::jsonb,
  'purchaseCode', '{"show":true,"bold":false,"fontSize":8,"width":15,"x":2.5,"y":20}'::jsonb
),
updated_at = now()
WHERE id = '9561adf5-59b4-4eef-9a3c-19fa025725f3';

-- Also update the label_template in barcode_label_settings to match
UPDATE barcode_label_settings
SET setting_data = jsonb_build_object(
  'labelWidth', 38,
  'labelHeight', 25,
  'config', jsonb_build_object(
    'fieldOrder', '["businessName","brand","productName","category","color","style","size","price","mrp","barcode","barcodeText","customText","billNumber","supplierCode","purchaseCode"]'::jsonb,
    'businessName', '{"show":true,"bold":true,"fontSize":11,"textAlign":"left","width":20,"x":1,"y":0}'::jsonb,
    'brand', '{"show":true,"bold":true,"fontSize":10,"textAlign":"left","width":15,"x":22.5,"y":1}'::jsonb,
    'productName', '{"show":true,"bold":true,"fontSize":11,"textAlign":"left","width":20,"x":1.5,"y":5.5}'::jsonb,
    'category', '{"show":false,"bold":false,"fontSize":7,"width":20,"x":1,"y":6}'::jsonb,
    'color', '{"show":true,"bold":true,"fontSize":10,"textAlign":"left","width":15,"x":25,"y":5.5}'::jsonb,
    'style', '{"show":true,"bold":false,"fontSize":9,"textAlign":"left","width":15,"x":10,"y":10.5}'::jsonb,
    'size', '{"show":true,"bold":true,"fontSize":10,"textAlign":"left","width":10,"x":2,"y":10.5}'::jsonb,
    'price', '{"show":true,"bold":true,"fontSize":12,"textAlign":"right","width":16,"x":25,"y":8}'::jsonb,
    'mrp', '{"show":false,"bold":false,"fontSize":7,"textAlign":"right","width":18,"x":30,"y":9}'::jsonb,
    'barcode', '{"show":true,"bold":false,"fontSize":9,"height":8,"width":30,"x":4,"y":13.5}'::jsonb,
    'barcodeText', '{"show":true,"bold":true,"fontSize":9,"textAlign":"right","width":20,"x":20,"y":20}'::jsonb,
    'barcodeHeight', '20'::jsonb,
    'barcodeWidth', '1.5'::jsonb,
    'customText', '{"show":false,"bold":false,"fontSize":7,"textAlign":"center","width":48,"x":1,"y":22}'::jsonb,
    'customTextValue', '""'::jsonb,
    'billNumber', '{"show":false,"bold":false,"fontSize":6,"width":20,"x":1,"y":22}'::jsonb,
    'supplierCode', '{"show":false,"bold":false,"fontSize":6,"width":24,"x":18.5,"y":23.5}'::jsonb,
    'purchaseCode', '{"show":true,"bold":false,"fontSize":8,"width":15,"x":2.5,"y":20}'::jsonb
  )
),
updated_at = now()
WHERE id = 'cdbc01d8-34a4-41cc-b33f-1874d3843399';