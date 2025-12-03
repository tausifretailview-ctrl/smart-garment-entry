-- Add dashboard_settings column to settings table for storing column preferences
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS dashboard_settings jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.settings.dashboard_settings IS 'Stores dashboard column visibility preferences per dashboard type';