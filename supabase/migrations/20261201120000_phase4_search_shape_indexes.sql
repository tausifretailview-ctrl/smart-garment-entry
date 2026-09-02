-- Phase 4 — supporting indexes for product contains-search and purchase barcode
-- exact/prefix. No new RPC (Phase 3 taught: do not point the client at a
-- function that is not on production yet).
--
-- products: org-scoped name trigram to match existing org+brand/style/category.
-- purchase_items: btree for exact/prefix numeric barcodes; trigram for remaining
-- text-path contains on barcode. No organization_id column (join via bills).

CREATE INDEX IF NOT EXISTS idx_products_org_name_trgm
  ON public.products USING gin (organization_id uuid_ops, product_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_items_barcode
  ON public.purchase_items (barcode)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL AND barcode <> '';

CREATE INDEX IF NOT EXISTS idx_purchase_items_barcode_trgm
  ON public.purchase_items USING gin (barcode gin_trgm_ops)
  WHERE deleted_at IS NULL;
