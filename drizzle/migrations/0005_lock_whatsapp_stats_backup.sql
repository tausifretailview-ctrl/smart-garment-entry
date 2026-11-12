ALTER TABLE public.whatsapp_message_stats_backup_20261022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_message_stats_backup_20261022 FROM anon, authenticated;
GRANT ALL ON public.whatsapp_message_stats_backup_20261022 TO service_role;