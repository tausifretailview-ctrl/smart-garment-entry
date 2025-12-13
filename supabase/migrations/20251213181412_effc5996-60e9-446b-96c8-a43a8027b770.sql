-- Create drafts table for auto-saving incomplete entries
CREATE TABLE public.drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL, -- 'purchase', 'quotation', 'sale_order', 'sale_invoice'
  draft_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only one active draft per user per entry type per organization
  CONSTRAINT unique_user_draft UNIQUE(organization_id, draft_type, created_by)
);

-- Create index for faster lookups
CREATE INDEX idx_drafts_org_type_user ON public.drafts(organization_id, draft_type, created_by);

-- Enable RLS
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own drafts"
ON public.drafts
FOR SELECT
USING (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND created_by = auth.uid()
);

CREATE POLICY "Users can create their own drafts"
ON public.drafts
FOR INSERT
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update their own drafts"
ON public.drafts
FOR UPDATE
USING (
  user_belongs_to_org(auth.uid(), organization_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Users can delete their own drafts"
ON public.drafts
FOR DELETE
USING (
  user_belongs_to_org(auth.uid(), organization_id)
  AND created_by = auth.uid()
);