-- Create backup_logs table to track backup history
CREATE TABLE public.backup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('manual', 'automatic')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  file_name TEXT,
  drive_file_id TEXT,
  drive_file_link TEXT,
  file_size BIGINT,
  tables_included TEXT[],
  records_count JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for organization lookup
CREATE INDEX idx_backup_logs_organization ON public.backup_logs(organization_id);
CREATE INDEX idx_backup_logs_created_at ON public.backup_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - only org members can view their backup logs
CREATE POLICY "Users can view their organization's backup logs"
  ON public.backup_logs
  FOR SELECT
  USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can create backup logs for their organization"
  ON public.backup_logs
  FOR INSERT
  WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can update their organization's backup logs"
  ON public.backup_logs
  FOR UPDATE
  USING (user_belongs_to_org(auth.uid(), organization_id));