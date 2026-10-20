-- Stock Transfer (20270130120000) logs 'transfer_out' / 'transfer_in' (and the *_cancel pair on
-- Cancel) into stock_movements, but stock_movements_movement_type_check never allowed them.
-- Every create_stock_transfer call rolled back with a check-constraint error, so no transfer
-- could be saved (Lovable scan 2026-10-20).
--
-- Rebuilds the check from the LIVE allowed list plus the four transfer types, so values added
-- in production outside this repo are kept.

DO $mt$
DECLARE
  v_def text;
  v_types text[];
  v_list text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.stock_movements'::regclass
    AND c.conname = 'stock_movements_movement_type_check';

  IF v_def IS NULL THEN
    RAISE NOTICE 'stock_movements_movement_type_check not found; nothing to change';
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_types
  FROM (
    SELECT m[1] AS t FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m
    UNION
    SELECT unnest(ARRAY['transfer_out', 'transfer_in', 'transfer_out_cancel', 'transfer_in_cancel'])
  ) x;

  SELECT string_agg(quote_literal(t) || '::text', ', ') INTO v_list FROM unnest(v_types) t;

  ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_movement_type_check;
  EXECUTE 'ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_movement_type_check '
       || 'CHECK (movement_type = ANY (ARRAY[' || v_list || ']))';
  RAISE NOTICE 'stock_movements_movement_type_check now allows % types', array_length(v_types, 1);
END
$mt$;
