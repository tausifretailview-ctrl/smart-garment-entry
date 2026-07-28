ALTER TABLE public._backup_ranawat_products_20260726 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_ranawat_products_20260726 FROM anon, authenticated;
GRANT ALL ON public._backup_ranawat_products_20260726 TO service_role;