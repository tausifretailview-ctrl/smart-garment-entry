-- Update stock_movements check constraint to include soft delete and restore movement types
ALTER TABLE stock_movements 
DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE stock_movements 
ADD CONSTRAINT stock_movements_movement_type_check 
CHECK (movement_type IN (
  'purchase', 'sale', 'purchase_return', 'sale_return',
  'purchase_delete', 'purchase_increase', 'purchase_decrease', 'sale_delete',
  'sale_return_delete', 'purchase_return_delete', 'reconciliation',
  -- Soft delete and restore types
  'soft_delete_purchase', 'restore_purchase',
  'soft_delete_sale', 'restore_sale',
  'soft_delete_sale_return', 'restore_sale_return',
  'soft_delete_purchase_return', 'restore_purchase_return'
));