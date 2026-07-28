-- Per-product IMEI requirement for Mobile ERP (Phase 2).
-- Default TRUE: every existing product keeps today's IMEI behaviour.
-- Accessories must be opted out via Product Entry or Bulk Product Update.
-- Effective enforcement: mobile_erp.enabled AND imei_scan_enforcement AND requires_imei.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS requires_imei boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.requires_imei IS
  'When true (default), Mobile ERP IMEI scan enforcement applies to this product. When false, purchase/POS use a shared barcode + quantity (accessories).';

-- No backfill UPDATE needed: DEFAULT true applies to existing rows on ADD COLUMN in Postgres.
