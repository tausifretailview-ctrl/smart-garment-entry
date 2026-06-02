-- Reduce read amplification on the return-items child tables.
--
-- Intent (per request): add composite indexes on (organization_id, created_at) for
-- public.sale_return_items and public.purchase_return_items.
--
-- IMPORTANT: these two child tables do NOT currently carry an `organization_id`
-- column — they are organization-scoped through their parent rows
-- (sale_returns / purchase_returns). A bare `CREATE INDEX ... (organization_id, ...)`
-- would fail with "column \"organization_id\" does not exist" and break the
-- migration chain.
--
-- To keep this migration index-only, idempotent, and safe regardless of schema
-- drift, each index is created only when the `organization_id` column actually
-- exists on the table. Where the column is absent this is a no-op (no table/RLS
-- changes are made here). If `organization_id` is added to these tables in a
-- separate, security-reviewed change, re-running migrations will then create the
-- intended composite index.

-- sale_return_items (organization_id, created_at)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_return_items'
      AND column_name = 'organization_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_sale_return_items_org_created
      ON public.sale_return_items (organization_id, created_at);
  END IF;
END $$;

-- purchase_return_items (organization_id, created_at)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_return_items'
      AND column_name = 'organization_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_purchase_return_items_org_created
      ON public.purchase_return_items (organization_id, created_at);
  END IF;
END $$;
