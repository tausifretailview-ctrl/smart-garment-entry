
UPDATE sales
SET paid_amount = net_amount,
    payment_status = 'completed',
    sale_return_adjust = COALESCE(sale_return_adjust, 0) + 950
WHERE sale_number = 'INV/25-26/1013'
  AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%ella noor%' LIMIT 1);
