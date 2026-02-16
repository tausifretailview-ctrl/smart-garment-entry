
-- Add auto-backup settings columns to settings table
ALTER TABLE public.settings 
  ADD COLUMN IF NOT EXISTS auto_backup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS backup_email text,
  ADD COLUMN IF NOT EXISTS last_auto_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS backup_retention_days integer DEFAULT 30;

-- Add storage_path to backup_logs for cloud backups
ALTER TABLE public.backup_logs
  ADD COLUMN IF NOT EXISTS storage_path text;

-- Create private storage bucket for organization backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-backups', 'organization-backups', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can only access their own organization's backups
CREATE POLICY "Users can view own org backups"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'organization-backups' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role can insert org backups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organization-backups'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role can delete org backups"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'organization-backups'
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text FROM public.organization_members WHERE user_id = auth.uid()
  )
);
