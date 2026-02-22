
CREATE TABLE IF NOT EXISTS public.daily_tally_snapshot (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    tally_date date NOT NULL,
    opening_cash numeric(14,2) DEFAULT 0,
    expected_cash numeric(14,2),
    physical_cash numeric(14,2),
    difference_amount numeric(14,2),
    leave_in_drawer numeric(14,2) DEFAULT 0,
    deposit_to_bank numeric(14,2) DEFAULT 0,
    handover_to_owner numeric(14,2) DEFAULT 0,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    UNIQUE (organization_id, tally_date)
);

ALTER TABLE public.daily_tally_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view daily tally snapshots for their org"
ON public.daily_tally_snapshot FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can insert daily tally snapshots for their org"
ON public.daily_tally_snapshot FOR INSERT
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can update daily tally snapshots for their org"
ON public.daily_tally_snapshot FOR UPDATE
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can delete daily tally snapshots for their org"
ON public.daily_tally_snapshot FOR DELETE
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE INDEX idx_daily_tally_snapshot_org_date ON public.daily_tally_snapshot(organization_id, tally_date);
