
CREATE TABLE public.bulk_update_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  update_type TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  config JSONB DEFAULT '{}'::jsonb,
  items_count INTEGER NOT NULL DEFAULT 0,
  items_summary JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_update_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bulk update history for their org"
  ON public.bulk_update_history
  FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can insert bulk update history for their org"
  ON public.bulk_update_history
  FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE INDEX idx_bulk_update_history_org ON public.bulk_update_history(organization_id, created_at DESC);
