-- Realtime publication for org-scoped money-view freshness invalidation.
-- Client subscriptions: sales, voucher_entries, sale_returns, customer_advances
-- (filter: organization_id=eq.<org> — never cross-tenant).
-- Idempotent: skip tables already in supabase_realtime.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.voucher_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_returns;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_advances;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
