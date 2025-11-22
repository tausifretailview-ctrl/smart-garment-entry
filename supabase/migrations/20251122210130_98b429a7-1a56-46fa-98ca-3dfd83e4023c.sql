-- Add 'sale_delete' to stock_movements movement_type check constraint
-- This fixes the error when deleting sales from POS Dashboard

-- Drop the existing check constraint
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

-- Recreate the constraint with 'sale_delete' included
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
CHECK (movement_type IN (
  'purchase',
  'sale',
  'purchase_return',
  'sale_return',
  'purchase_delete',
  'purchase_increase',
  'purchase_decrease',
  'sale_delete'
));