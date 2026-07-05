-- Per-user AI assistant rate limiting (edge function writes via service role).

CREATE TABLE IF NOT EXISTS public.ai_assistant_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time
  ON public.ai_assistant_usage(user_id, created_at DESC);

ALTER TABLE public.ai_assistant_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_owner_select" ON public.ai_assistant_usage
  FOR SELECT USING (user_id = auth.uid());

GRANT SELECT ON public.ai_assistant_usage TO authenticated;
