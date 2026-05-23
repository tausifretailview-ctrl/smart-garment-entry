-- Track shop on receipt vouchers (multi-shop orgs); matches sales.shop_name.
ALTER TABLE public.voucher_entries
  ADD COLUMN IF NOT EXISTS shop_name TEXT;

CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_shop
  ON public.voucher_entries (organization_id, shop_name)
  WHERE deleted_at IS NULL AND shop_name IS NOT NULL;
