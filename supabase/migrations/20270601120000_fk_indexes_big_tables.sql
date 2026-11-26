-- Foreign keys on big tables that had no index on the pointing column (found by the audit
-- check, 2026-11-27: 117 such keys, 8 of them on tables with 5,000+ rows).
--
-- Without an index, removing or re-keying the parent row (a purchase bill, a sale, a sale
-- order, a bank account, a size group, a customer) makes Postgres read the whole child table
-- to find the rows that point at it: 188,000 batch_stock rows per purchase bill, 150,000
-- customer_product_prices rows (twice) per sale or sale order.
--
-- Partial (NOT NULL) so they stay small; the foreign-key check `col = $1` can still use them.
-- sales.cancelled_by and voucher_entries.created_by are left alone: they point at users,
-- which are almost never removed, and both tables are written on every bill.
-- Additive only: no data or function changes. Safe to re-run. Run off-peak (each build
-- holds writes on its table for about a second).
-- UNDO: DROP INDEX IF EXISTS public.<name>;

CREATE INDEX IF NOT EXISTS idx_batch_stock_purchase_bill_id
  ON public.batch_stock (purchase_bill_id) WHERE purchase_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_product_prices_last_sale_id
  ON public.customer_product_prices (last_sale_id) WHERE last_sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_product_prices_last_order_id
  ON public.customer_product_prices (last_order_id) WHERE last_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_bank_account_id
  ON public.journal_entries (bank_account_id) WHERE bank_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_size_group_id
  ON public.products (size_group_id) WHERE size_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_customer_id
  ON public.whatsapp_conversations (customer_id) WHERE customer_id IS NOT NULL;

-- Check (read-only): should return 6 rows.
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
--   'idx_batch_stock_purchase_bill_id', 'idx_customer_product_prices_last_sale_id',
--   'idx_customer_product_prices_last_order_id', 'idx_journal_entries_bank_account_id',
--   'idx_products_size_group_id', 'idx_whatsapp_conversations_customer_id') ORDER BY 1;
