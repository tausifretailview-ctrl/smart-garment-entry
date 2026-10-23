-- Purchase Entry > Photo (bill photo import): one row per bill photo read by the
-- read-purchase-bill edge function. Used for the daily cap (50 reads per shop per 24 hours)
-- and to see AI usage per shop. Only the edge function (service role) writes here.
-- Re-run safe.

CREATE TABLE IF NOT EXISTS public.purchase_photo_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  pages integer NOT NULL DEFAULT 1,
  model text,
  input_tokens integer,
  output_tokens integer,
  line_count integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_photo_reads_org_created
  ON public.purchase_photo_reads (organization_id, created_at DESC);

ALTER TABLE public.purchase_photo_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_photo_reads_org_members_select" ON public.purchase_photo_reads;
CREATE POLICY "purchase_photo_reads_org_members_select"
  ON public.purchase_photo_reads
  FOR SELECT
  TO authenticated
  USING (user_belongs_to_org((SELECT auth.uid()), organization_id));
