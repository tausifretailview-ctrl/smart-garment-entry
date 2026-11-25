-- SQL file 33: purchase return save fails with
--   invalid input syntax for type integer: "0.01"
--
-- 1. update_purchase_return_items (saving an EDITED return) reads qty as ::integer, although
--    purchase_return_items.qty has been NUMERIC(10,3) since 20260410190232. A decimal quantity
--    (0.01, 1.5 m, 2.250 kg) makes the whole save fail. The live function is edited in place
--    (pg_get_functiondef + replace), so guards added to it later are kept.
-- 2. purchase_return_items.gst_per was created INTEGER (20251122043411). GST rates such as
--    0.25 % / 1.5 % / 0.1 %, or a purchase line saved with a decimal GST, fail on every save
--    (new returns too). It becomes NUMERIC(5,2), like the other line tables.
-- One transaction. Running it again changes nothing.

DO $fix$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.update_purchase_return_items(uuid,jsonb)'::regprocedure);
  v_new := replace(v_def, '(item->>''qty'')::integer', '(item->>''qty'')::numeric');
  v_new := replace(v_new, '(v_item->>''qty'')::integer', '(v_item->>''qty'')::numeric');
  IF v_new IS DISTINCT FROM v_def THEN
    EXECUTE v_new;
    RAISE NOTICE 'update_purchase_return_items: qty now read as numeric';
  ELSE
    RAISE NOTICE 'update_purchase_return_items: already numeric, unchanged';
  END IF;
END
$fix$;

DO $fix$
DECLARE
  v_views text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_return_items'
      AND column_name = 'gst_per' AND data_type IN ('integer', 'smallint', 'bigint')
  ) THEN
    RAISE NOTICE 'purchase_return_items.gst_per already allows decimals, unchanged';
    RETURN;
  END IF;

  -- A view on the column blocks ALTER TYPE: leave it as it is and say which view.
  SELECT string_agg(DISTINCT v.relname, ', ') INTO v_views
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class v ON v.oid = r.ev_class
  JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
  WHERE d.refobjid = 'public.purchase_return_items'::regclass AND a.attname = 'gst_per';
  IF v_views IS NOT NULL THEN
    RAISE NOTICE 'purchase_return_items.gst_per NOT changed: used by view(s) %', v_views;
    RETURN;
  END IF;

  ALTER TABLE public.purchase_return_items
    ALTER COLUMN gst_per TYPE numeric(5,2) USING gst_per::numeric;
  RAISE NOTICE 'purchase_return_items.gst_per is now numeric(5,2)';
END
$fix$;
