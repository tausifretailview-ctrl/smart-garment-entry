-- Enable AI Assistant (ai_chatbot) for all existing user permission rows across orgs.
-- New users already default on via app presets; this backfills saved permission JSON.

UPDATE public.user_permissions
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{special,ai_chatbot}',
  'true'::jsonb,
  true
)
WHERE COALESCE(permissions->'special'->>'ai_chatbot', '') IS DISTINCT FROM 'true';
