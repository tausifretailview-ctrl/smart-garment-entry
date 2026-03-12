
CREATE TABLE public.fee_structure_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  fee_structure_id UUID,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id),
  class_id UUID NOT NULL REFERENCES public.school_classes(id),
  fee_head_id UUID NOT NULL REFERENCES public.fee_heads(id),
  old_amount NUMERIC DEFAULT 0,
  new_amount NUMERIC DEFAULT 0,
  old_frequency TEXT,
  new_frequency TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.fee_structure_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view fee structure history"
  ON public.fee_structure_history
  FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert fee structure history"
  ON public.fee_structure_history
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));
