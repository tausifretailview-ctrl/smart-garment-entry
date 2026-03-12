-- Fix discount_amount for existing invoices where items have discount_percent but sales.discount_amount = 0
UPDATE sales s
SET discount_amount = (
  SELECT COALESCE(SUM(si.unit_price * si.quantity * si.discount_percent / 100), 0)
  FROM sale_items si
  WHERE si.sale_id = s.id
  AND si.discount_percent > 0
)
WHERE s.discount_amount = 0
AND s.sale_type = 'invoice'
AND EXISTS (
  SELECT 1 FROM sale_items si
  WHERE si.sale_id = s.id
  AND si.discount_percent > 0
);