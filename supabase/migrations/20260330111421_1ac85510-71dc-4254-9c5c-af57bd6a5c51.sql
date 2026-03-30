
UPDATE barcode_label_settings
SET setting_data = '{
  "config": {
    "businessName": { "show": true, "fontSize": 9, "bold": true, "x": 20, "y": 0, "width": 18, "textAlign": "left" },
    "brand": { "show": true, "fontSize": 9, "bold": true, "x": 0, "y": 0.5, "width": 18, "textAlign": "left" },
    "productName": { "show": true, "fontSize": 9, "bold": true, "x": 1.5, "y": 4.5, "width": 17, "textAlign": "left" },
    "style": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 8.5, "width": 17, "textAlign": "left" },
    "color": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 11.5, "width": 17, "textAlign": "left" },
    "size": { "show": true, "fontSize": 8, "bold": true, "x": 0, "y": 14, "width": 12, "textAlign": "left" },
    "price": { "show": true, "fontSize": 10, "bold": true, "x": 19, "y": 14, "width": 19, "textAlign": "right" },
    "mrp": { "show": false, "fontSize": 7, "bold": false, "x": 20, "y": 18, "width": 18, "textAlign": "right" },
    "category": { "show": false, "fontSize": 7, "bold": false, "x": 1, "y": 6, "width": 17, "textAlign": "left" },
    "barcode": { "show": true, "fontSize": 9, "bold": false, "x": 19, "y": 0, "width": 19, "height": 14 },
    "barcodeText": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 20, "width": 38, "textAlign": "center" },
    "supplierCode": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 17.5, "width": 18, "textAlign": "left" },
    "purchaseCode": { "show": true, "fontSize": 6, "bold": false, "x": 19, "y": 17.5, "width": 18, "textAlign": "right" },
    "customText": { "show": false, "fontSize": 7, "bold": false, "x": 1, "y": 23, "width": 38, "textAlign": "center" },
    "billNumber": { "show": false, "fontSize": 6, "bold": false, "x": 1, "y": 23, "width": 20, "textAlign": "left" },
    "fieldOrder": ["businessName","brand","productName","category","color","style","size","price","mrp","barcode","barcodeText","customText","billNumber","supplierCode","purchaseCode"],
    "barcodeHeight": 30,
    "barcodeWidth": 1.5,
    "customTextValue": ""
  },
  "labelWidth": 38,
  "labelHeight": 25
}'::jsonb,
updated_at = now()
WHERE organization_id = (
  SELECT id FROM organizations WHERE slug = 'velvet-exclusive-ladies-wear-bags' LIMIT 1
)
AND setting_type = 'label_template'
AND setting_name = '170326';

UPDATE printer_presets
SET label_config = '{
    "businessName": { "show": true, "fontSize": 9, "bold": true, "x": 20, "y": 0, "width": 18, "textAlign": "left" },
    "brand": { "show": true, "fontSize": 9, "bold": true, "x": 0, "y": 0.5, "width": 18, "textAlign": "left" },
    "productName": { "show": true, "fontSize": 9, "bold": true, "x": 1.5, "y": 4.5, "width": 17, "textAlign": "left" },
    "style": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 8.5, "width": 17, "textAlign": "left" },
    "color": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 11.5, "width": 17, "textAlign": "left" },
    "size": { "show": true, "fontSize": 8, "bold": true, "x": 0, "y": 14, "width": 12, "textAlign": "left" },
    "price": { "show": true, "fontSize": 10, "bold": true, "x": 19, "y": 14, "width": 19, "textAlign": "right" },
    "mrp": { "show": false, "fontSize": 7, "bold": false, "x": 20, "y": 18, "width": 18, "textAlign": "right" },
    "category": { "show": false, "fontSize": 7, "bold": false, "x": 1, "y": 6, "width": 17, "textAlign": "left" },
    "barcode": { "show": true, "fontSize": 9, "bold": false, "x": 19, "y": 0, "width": 19, "height": 14 },
    "barcodeText": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 20, "width": 38, "textAlign": "center" },
    "supplierCode": { "show": true, "fontSize": 7, "bold": false, "x": 0, "y": 17.5, "width": 18, "textAlign": "left" },
    "purchaseCode": { "show": true, "fontSize": 6, "bold": false, "x": 19, "y": 17.5, "width": 18, "textAlign": "right" },
    "customText": { "show": false, "fontSize": 7, "bold": false, "x": 1, "y": 23, "width": 38, "textAlign": "center" },
    "billNumber": { "show": false, "fontSize": 6, "bold": false, "x": 1, "y": 23, "width": 20, "textAlign": "left" },
    "fieldOrder": ["businessName","brand","productName","category","color","style","size","price","mrp","barcode","barcodeText","customText","billNumber","supplierCode","purchaseCode"],
    "barcodeHeight": 30,
    "barcodeWidth": 1.5,
    "customTextValue": ""
}'::jsonb,
label_width = 38,
label_height = 25,
updated_at = now()
WHERE organization_id = (
  SELECT id FROM organizations WHERE slug = 'velvet-exclusive-ladies-wear-bags' LIMIT 1
)
AND name = '170326';
