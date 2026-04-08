WITH calculated AS (
  SELECT 
    pv.id,
    pv.stock_qty AS old_stock,
    COALESCE(pv.opening_qty, 0)
      + COALESCE(pur.qty, 0)
      - COALESCE(sal.qty, 0)
      - COALESCE(pr.qty, 0)
      + COALESCE(sr.qty, 0) AS correct_stock
  FROM product_variants pv
  LEFT JOIN LATERAL (SELECT SUM(qty) AS qty FROM purchase_items WHERE sku_id = pv.id AND deleted_at IS NULL) pur ON true
  LEFT JOIN LATERAL (SELECT SUM(quantity) AS qty FROM sale_items WHERE variant_id = pv.id AND deleted_at IS NULL) sal ON true
  LEFT JOIN LATERAL (SELECT SUM(qty) AS qty FROM purchase_return_items WHERE sku_id = pv.id AND deleted_at IS NULL) pr ON true
  LEFT JOIN LATERAL (SELECT SUM(quantity) AS qty FROM sale_return_items WHERE variant_id = pv.id AND deleted_at IS NULL) sr ON true
  WHERE pv.deleted_at IS NULL AND pv.active = true
)
UPDATE product_variants pv
SET stock_qty = c.correct_stock, updated_at = NOW()
FROM calculated c
WHERE pv.id = c.id AND c.old_stock != c.correct_stock;