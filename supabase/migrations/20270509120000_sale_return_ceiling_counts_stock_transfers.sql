-- Sale return of a product that came in by Stock Transfer was refused (user report).
--
-- check_stock_ceiling_on_sale_return (trigger on sale_return_items) caps a variant's stock at
--   opening + purchased - purchase-returned.
-- A product received from a sibling shop is created in the receiving shop with no opening
-- qty and no purchase (accept_stock_transfer, 20270313120000), so its ceiling is 0 and any
-- sale return of it raised "Stock ceiling exceeded". Transferred-in stock on an existing
-- item could push it over the same cap.
--
-- Now the ceiling also counts stock transfers:
--   + qty received here by accepted transfers (stock_transfer_items.to_variant_id)
--   - qty sent from here by pending or accepted transfers (from_variant_id); a rejected or
--     cancelled transfer has already put the stock back with the sender.
-- The app check (src/utils/stockCeilingValidation.ts) uses the same formula.
--
-- Edits the LIVE function body: only the v_max_allowed line is replaced, so hotfixes made
-- outside the repo are kept. Safe to re-run: skips when the marker is already present.
-- Stops (nothing changed) when the expected line is not found.

DO $ceiling_transfers$
DECLARE
  r record;
  v_def text;
  v_src text;
  v_new_src text;
  v_line_pattern constant text :=
    'v_max_allowed\s*:=\s*v_opening_qty\s*\+\s*v_total_purchased\s*-\s*v_total_returned\s*;';
  marker constant text := '-- ceiling counts stock transfers 2027-05-09';
  v_found boolean := false;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_stock_ceiling_on_sale_return'
  LOOP
    v_found := true;
    v_def := pg_get_functiondef(r.oid);
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = r.oid;

    IF position(marker IN v_src) > 0 THEN
      RAISE NOTICE 'check_stock_ceiling_on_sale_return already counts stock transfers';
      CONTINUE;
    END IF;

    IF v_src !~ v_line_pattern THEN
      RAISE EXCEPTION
        'check_stock_ceiling_on_sale_return: the "v_max_allowed := v_opening_qty + v_total_purchased - v_total_returned;" line was not found — add the stock transfer terms by hand';
    END IF;

    v_new_src := regexp_replace(
      v_src,
      v_line_pattern,
      marker || E'\n'
      || $add$  v_max_allowed := v_opening_qty + v_total_purchased - v_total_returned
    + COALESCE((
        SELECT SUM(sti.qty)
        FROM stock_transfer_items sti
        JOIN stock_transfers st ON st.id = sti.transfer_id
        WHERE sti.to_variant_id = NEW.variant_id
          AND st.status = 'accepted'
      ), 0)
    - COALESCE((
        SELECT SUM(sti.qty)
        FROM stock_transfer_items sti
        JOIN stock_transfers st ON st.id = sti.transfer_id
        WHERE sti.from_variant_id = NEW.variant_id
          AND st.status IN ('pending', 'accepted')
      ), 0);$add$
    );

    IF position(v_src IN v_def) = 0 THEN
      RAISE EXCEPTION 'check_stock_ceiling_on_sale_return: body not found in definition — edit by hand';
    END IF;

    EXECUTE overlay(v_def PLACING v_new_src FROM position(v_src IN v_def) FOR length(v_src));
    RAISE NOTICE 'check_stock_ceiling_on_sale_return: stock transfers now counted';
  END LOOP;

  IF NOT v_found THEN
    RAISE NOTICE 'check_stock_ceiling_on_sale_return not found; nothing to change';
  END IF;
END
$ceiling_transfers$;
