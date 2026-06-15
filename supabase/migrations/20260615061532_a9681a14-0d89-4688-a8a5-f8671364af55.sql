DO $$
DECLARE
  v_updated INT;
BEGIN
  WITH upd AS (
    UPDATE public.product_variants pv
       SET mrp = s.mrp,
           updated_at = now()
      FROM public._kidz_mrp_staging s
     WHERE pv.barcode = s.barcode
       AND pv.organization_id = 'a1bac661-f294-4a95-a7a9-8c64e8864456'
       AND pv.deleted_at IS NULL
       AND (pv.mrp IS NULL OR pv.mrp = 0)
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  RAISE NOTICE 'KIDS ZONE MRP backfill — rows updated: %', v_updated;
END $$;

DROP TABLE public._kidz_mrp_staging;