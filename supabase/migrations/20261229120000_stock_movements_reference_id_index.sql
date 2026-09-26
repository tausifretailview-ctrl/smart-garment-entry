-- Purchase save (save_purchase_bill_with_items_atomic → _apply_bulk_purchase_insert_effects
-- + its guardrail) looks up stock_movements by reference_id four times per save.
-- No migration indexes reference_id, so each lookup can scan the whole table and
-- the save hits the 8s statement timeout (57014). Additive index only.
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id_type
  ON public.stock_movements (reference_id, movement_type);
