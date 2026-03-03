
CREATE TABLE public.printer_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  label_width numeric NOT NULL DEFAULT 50,
  label_height numeric NOT NULL DEFAULT 25,
  x_offset numeric NOT NULL DEFAULT 0,
  y_offset numeric NOT NULL DEFAULT 0,
  v_gap numeric NOT NULL DEFAULT 2,
  a4_cols integer DEFAULT 4,
  a4_rows integer DEFAULT 12,
  label_config jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, name)
);

ALTER TABLE public.printer_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org presets"
  ON public.printer_presets FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert org presets"
  ON public.printer_presets FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update org presets"
  ON public.printer_presets FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete org presets"
  ON public.printer_presets FOR DELETE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE TRIGGER update_printer_presets_updated_at
  BEFORE UPDATE ON public.printer_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
