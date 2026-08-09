-- =============================================================================
-- Verify search_invoice_sale_ids (Item 3) — ELLA NOOR
-- =============================================================================
-- Replace :org_id with ELLA NOOR org uuid.
-- Run BEFORE applying 20261111120000, save plans; AFTER apply, compare.
--
-- Also count RPC calls from the browser Network tab while searching All Time:
--   before: search_invoice_sale_ids × ~4+ per keystroke settle
--   after (app Item 2): ×1 per page fetch + ×1 if stats client fallback
-- =============================================================================

-- A) Customer-name term (expect 0 line-item sale ids — cost should drop after Item 3)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  ':org_id'::uuid,
  'ANUSHA PATHAN',
  NULL,  -- All Time
  NULL,
  1000
);

-- B) Product / barcode term (pick a real barcode or product fragment from the org)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  ':org_id'::uuid,
  'REPLACE_WITH_PRODUCT_OR_BARCODE',
  NULL,
  NULL,
  1000
);

-- C) Date-bounded line-item search still applies date filter
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  ':org_id'::uuid,
  'REPLACE_WITH_PRODUCT_OR_BARCODE',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000
);

-- D) Result-set equality smoke (run against OLD function backup if you saved it,
--    or compare count/ids before vs after deploy on a fixed term):
SELECT COUNT(*) AS n FROM public.search_invoice_sale_ids(
  ':org_id'::uuid,
  'REPLACE_WITH_PRODUCT_OR_BARCODE',
  NULL,
  NULL,
  1000
);
