# Auth Email and Org Routing Runbook

Use this runbook when a user is redirected to the wrong organization or cannot log in with an updated email.

## 1) Verify auth identity and membership mapping

Run in Supabase SQL editor:

```sql
SELECT id, email, created_at
FROM auth.users
WHERE email IN ('saleemopr@gmail.com', 'operator@gmail.com')
ORDER BY created_at;
```

```sql
SELECT
  om.user_id,
  om.role,
  o.name AS org_name,
  o.slug
FROM organization_members om
JOIN organizations o ON o.id = om.organization_id
WHERE om.user_id IN (
  SELECT id
  FROM auth.users
  WHERE email IN ('saleemopr@gmail.com', 'operator@gmail.com')
)
ORDER BY o.name;
```

Expected:
- The login email exists in `auth.users`.
- Membership rows in `organization_members` are attached to the same `auth.users.id`.

## 2) Correct a stale auth email

If the user email in `auth.users` is still old:

1. Open Supabase Dashboard.
2. Go to **Authentication** -> **Users**.
3. Search by old email (for example `operator@gmail.com`).
4. Open the user row and edit email to the new value (for example `saleemopr@gmail.com`).
5. Save.

After update, user must log in with the new email.

## 3) App-level behavior expectations

- Multi-org users are shown an organization picker in app setup and are not auto-redirected to the first org.
- Single-org users are auto-redirected.
- Org login (`/{orgSlug}`) only allows membership for that slug and redirects to that slug.
- Admin email edits must go through edge function `admin-update-user` so Auth email is updated.
