UPDATE public.user_permissions
SET permissions = jsonb_set(
  jsonb_set(
    COALESCE(permissions, '{}'::jsonb),
    '{special,cancel_invoice}',
    'true'::jsonb,
    true
  ),
  '{special,delete_records}',
  'false'::jsonb,
  true
)
WHERE permissions IS NOT NULL;