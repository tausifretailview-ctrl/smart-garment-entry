
The user wants to apply an RLS hardening migration that closes 3 cross-tenant access gaps. This is a schema/policy change → migration tool. Need to verify a few assumptions before writing.

Let me check:
1. Does `public.get_user_organization_ids(uuid)` exist?
2. Does `login_attempts` have `organization_id` or `email`?
3. Current policies on the 4 affected tables.
