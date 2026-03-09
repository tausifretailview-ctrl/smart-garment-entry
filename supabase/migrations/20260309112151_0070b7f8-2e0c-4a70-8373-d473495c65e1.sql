
CREATE TABLE IF NOT EXISTS public.promotion_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) NOT NULL,
  from_year_id UUID REFERENCES public.academic_years(id) NOT NULL,
  to_year_id UUID REFERENCES public.academic_years(id) NOT NULL,
  from_year_name TEXT NOT NULL,
  to_year_name TEXT NOT NULL,
  total_promoted INTEGER NOT NULL DEFAULT 0,
  total_failed INTEGER NOT NULL DEFAULT 0,
  total_passed_out INTEGER NOT NULL DEFAULT 0,
  carry_forward_enabled BOOLEAN NOT NULL DEFAULT false,
  promoted_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.promotion_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view promotion history for their org"
  ON public.promotion_history FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert promotion history for their org"
  ON public.promotion_history FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));
