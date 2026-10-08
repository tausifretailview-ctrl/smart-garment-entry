-- Live alerts for website orders / bookings / enquiries in the ERP and PWA
-- (src/components/StorefrontEnquiryNotifier.tsx). Realtime only delivers
-- INSERTs for tables in the supabase_realtime publication; row access is still
-- enforced by the existing "Org members can view website enquiries" RLS policy,
-- so each shop only hears about its own rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'website_enquiries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.website_enquiries;
  END IF;
END $$;
