-- Sales dashboard: org + date range queries
DROP INDEX IF EXISTS idx_sales_org_date;
CREATE INDEX IF NOT EXISTS idx_sales_org_date_status
  ON public.sales(organization_id, sale_date DESC, payment_status)
  WHERE deleted_at IS NULL;

-- Purchase bills: org + supplier + date
CREATE INDEX IF NOT EXISTS idx_purchase_bills_org_supplier_date
  ON public.purchase_bills(organization_id, supplier_id, bill_date DESC)
  WHERE deleted_at IS NULL;

-- Purchase orders: org + supplier + status
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_supplier_status
  ON public.purchase_orders(organization_id, supplier_id, status);

-- Voucher entries: org + date for accounting ledger views
CREATE INDEX IF NOT EXISTS idx_voucher_entries_org_date
  ON public.voucher_entries(organization_id, voucher_date DESC)
  WHERE deleted_at IS NULL;

-- Credit notes: org + status + date
CREATE INDEX IF NOT EXISTS idx_credit_notes_org_status_date
  ON public.credit_notes(organization_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Customers: org + points for loyalty queries
CREATE INDEX IF NOT EXISTS idx_customers_org_points
  ON public.customers(organization_id, points_balance DESC)
  WHERE deleted_at IS NULL;

-- Stock movements: org + variant + date for stock history
DROP INDEX IF EXISTS idx_stock_movements_variant_id;
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_variant_date
  ON stock_movements(organization_id, variant_id, created_at DESC);