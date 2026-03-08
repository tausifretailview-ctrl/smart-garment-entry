-- sale_items: variant_id used in stock lookups and reports
CREATE INDEX IF NOT EXISTS idx_sale_items_variant_id
  ON public.sale_items(variant_id);

-- purchase_return_items: return_id used in return detail views
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id
  ON public.purchase_return_items(return_id);

-- sale_return_items: return_id used in return detail views
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return_id
  ON public.sale_return_items(return_id);

-- voucher_items: both FKs used in accounting ledger views
CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher_id
  ON public.voucher_items(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_items_account_id
  ON public.voucher_items(account_id);

-- delivery_challan_items: variant_id used in stock tracking
CREATE INDEX IF NOT EXISTS idx_delivery_challan_items_variant_id
  ON public.delivery_challan_items(variant_id);

-- account_ledgers: parent_account_id used in ledger tree queries
CREATE INDEX IF NOT EXISTS idx_account_ledgers_parent_id
  ON public.account_ledgers(parent_account_id)
  WHERE parent_account_id IS NOT NULL;

-- suppliers: add trigram index for name search
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm
  ON public.suppliers USING gin(supplier_name gin_trgm_ops);