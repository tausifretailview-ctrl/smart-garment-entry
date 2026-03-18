
-- Step 1: Add portal fields to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_price_type TEXT DEFAULT 'last_sale',
  ADD COLUMN IF NOT EXISTS portal_otp TEXT,
  ADD COLUMN IF NOT EXISTS portal_otp_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_last_login TIMESTAMPTZ;

-- Step 2: Add order_source to sale_orders
ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'internal';

-- Step 3: Portal sessions table
CREATE TABLE IF NOT EXISTS public.portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON public.portal_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_customer ON public.portal_sessions(customer_id, expires_at);

-- Step 4: RLS on portal_sessions (service role only)
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.portal_sessions USING (false);
