CREATE TABLE IF NOT EXISTS public._kidz_mrp_staging (
  barcode TEXT PRIMARY KEY,
  mrp NUMERIC NOT NULL
);
GRANT ALL ON public._kidz_mrp_staging TO service_role;
ALTER TABLE public._kidz_mrp_staging ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role can read/write (used as a one-off staging table).
COMMENT ON TABLE public._kidz_mrp_staging IS 'TEMPORARY: KIDS ZONE MRP backfill staging from KIDZSTOCK_Item_Name.xlsx. Drop after MRP backfill migration runs.';