-- Dispatch of accepted sale orders (Nov 2026).
--
-- Sales → Dispatch lists accepted sale orders. Staff check the items, download / print them,
-- press Start (picking the staff who dispatches) and then Delivered.
-- * sale_orders.dispatch_status: pending (default) → in_process → delivered.
-- * dispatch_staff (name, as printed) and dispatch_staff_id (employee, if picked from the list).
-- * dispatch_started_at / delivered_at.
-- Writes are plain updates under the existing sale_orders row rules (organization members).
-- Safe to run more than once.

ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS dispatch_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS dispatch_staff text;
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS dispatch_staff_id uuid;
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz;
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_orders_dispatch_status_check' AND conrelid = 'public.sale_orders'::regclass
  ) THEN
    ALTER TABLE public.sale_orders
      ADD CONSTRAINT sale_orders_dispatch_status_check
      CHECK (dispatch_status IN ('pending', 'in_process', 'delivered'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sale_orders_org_dispatch_idx
  ON public.sale_orders (organization_id, dispatch_status, order_date DESC)
  WHERE deleted_at IS NULL AND customer_accepted IS TRUE;

-- Checks (read-only) after running:
--   SELECT dispatch_status, count(*) FROM public.sale_orders WHERE customer_accepted GROUP BY 1;
