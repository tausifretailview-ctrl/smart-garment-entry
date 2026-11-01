-- Industrial mode, Phase 1 step 5: quotation follow-up date, revision number, lost reason.
-- Nullable columns, no defaults: existing quotations and retail shops are unchanged.
-- Written only when Industrial mode is on.

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS revision_no integer;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS lost_reason text;

CREATE INDEX IF NOT EXISTS idx_quotations_org_follow_up
  ON public.quotations (organization_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.quotations.follow_up_date IS 'Industrial mode: next follow-up call / visit date';
COMMENT ON COLUMN public.quotations.revision_no IS 'Industrial mode: 0 = first issue, +1 per saved revision (prints as Rev N)';
COMMENT ON COLUMN public.quotations.lost_reason IS 'Industrial mode: why the quotation was lost (set when cancelled)';
