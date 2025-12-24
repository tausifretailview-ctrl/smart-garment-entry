-- Drop old check constraint and add new one with 'stock_reset' included
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;

ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check 
CHECK (movement_type = ANY (ARRAY[
  'purchase'::text, 
  'sale'::text, 
  'purchase_return'::text, 
  'sale_return'::text, 
  'purchase_delete'::text, 
  'purchase_increase'::text, 
  'purchase_decrease'::text, 
  'sale_delete'::text, 
  'sale_return_delete'::text, 
  'purchase_return_delete'::text, 
  'reconciliation'::text, 
  'soft_delete_purchase'::text, 
  'restore_purchase'::text, 
  'soft_delete_sale'::text, 
  'restore_sale'::text, 
  'soft_delete_sale_return'::text, 
  'restore_sale_return'::text, 
  'soft_delete_purchase_return'::text, 
  'restore_purchase_return'::text,
  'stock_reset'::text,
  'sale_update_decrease'::text,
  'sale_update_increase'::text
]));