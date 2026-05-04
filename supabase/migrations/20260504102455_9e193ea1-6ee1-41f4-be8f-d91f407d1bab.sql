
CREATE TABLE IF NOT EXISTS public.advance_booking_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  user_id UUID,
  customer_id UUID,
  customer_name TEXT,
  amount NUMERIC(12,2),
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'attempted',
  error_message TEXT,
  advance_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adv_attempts_org_created
  ON public.advance_booking_attempts (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_adv_attempts_org_status
  ON public.advance_booking_attempts (organization_id, status, created_at DESC);

ALTER TABLE public.advance_booking_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view advance attempts"
  ON public.advance_booking_attempts;
CREATE POLICY "Org members can view advance attempts"
  ON public.advance_booking_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = advance_booking_attempts.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Org members can insert advance attempts"
  ON public.advance_booking_attempts;
CREATE POLICY "Org members can insert advance attempts"
  ON public.advance_booking_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = advance_booking_attempts.organization_id
        AND om.user_id = auth.uid()
    )
  );
