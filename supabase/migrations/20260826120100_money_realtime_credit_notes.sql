-- Extend Realtime publication for credit_notes (customer CN pool / used_amount).

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_notes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
