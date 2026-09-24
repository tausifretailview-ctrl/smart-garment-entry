-- Sale Order Dashboard stats — EXPLAIN baseline + numeric parity checks
-- Run in Supabase SQL Editor (authenticated as org member, or service_role).
--
-- Orgs (from prior investigations):
--   KS FOOTWEAR (POS)     4bc73037-e877-4123-9261-eb6e3876698c
--   Bombay Coldchain      (replace with org uuid from organizations table)
--   Demo                  (replace with org uuid)

-- ---------------------------------------------------------------------------
-- STEP 1 — Baseline / after index: execution plan + timing
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.get_sale_order_dashboard_stats('4bc73037-e877-4123-9261-eb6e3876698c'::uuid);

-- ---------------------------------------------------------------------------
-- Parity: pending_qty on non-open orders should be 0 before relying on open-only shortcuts
-- (If this returns > 0, full org item join is required for byte-identical KPIs.)
-- ---------------------------------------------------------------------------
SELECT COALESCE(SUM(soi.pending_qty), 0) AS pending_qty_on_closed_status_orders
FROM public.sale_order_items soi
INNER JOIN public.sale_orders o ON o.id = soi.order_id
WHERE o.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
  AND o.deleted_at IS NULL
  AND o.status NOT IN ('pending', 'partial');

-- ---------------------------------------------------------------------------
-- Snapshot KPI row (compare before/after migration deploy — must match exactly)
-- ---------------------------------------------------------------------------
SELECT * FROM public.get_sale_order_dashboard_stats('4bc73037-e877-4123-9261-eb6e3876698c'::uuid);

-- Repeat for smaller orgs:
-- SELECT * FROM public.get_sale_order_dashboard_stats('<bombay-coldchain-org-id>'::uuid);
-- SELECT * FROM public.get_sale_order_dashboard_stats('<demo-org-id>'::uuid);

-- ---------------------------------------------------------------------------
-- Customer options: row count + sample (should match dashboard filter list)
-- ---------------------------------------------------------------------------
SELECT COUNT(*) FROM public.get_sale_order_customer_options('4bc73037-e877-4123-9261-eb6e3876698c'::uuid);
