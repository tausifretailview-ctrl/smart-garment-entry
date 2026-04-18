
Plan: combined security cleanup. One migration + one auth config call + one tiny code touch (none needed actually — all server-side).

## What I need to verify before writing the migration

I have the view names (8) and the permissive policy table (`login_attempts`). I still need:
- Exact names of the 7 functions with mutable `search_path` (from linter)
- Current `storage.objects` SELECT policies (to know what to replace vs add)
- Current `login_attempts` INSERT policy definition (to rewrite cleanly)

I'll fetch these inside the migration step — they're quick reads — but the plan below is structured so the SQL can be written with placeholders the implementation step fills in.

## Migration contents (single file)

### 1. Tighten `login_attempts` INSERT
Drop the `WITH CHECK (true)` policy. Replace with a policy that:
- Still allows `anon` to insert (needed — it's pre-auth)
- Restricts inserts to one row per (email, ip) per 10 seconds via a `BEFORE INSERT` trigger that raises if a recent row exists
- Forces `attempted_at = now()` server-side (prevents client-supplied timestamps gaming the window)

```sql
-- Trigger-based rate guard
CREATE OR REPLACE FUNCTION public.login_attempts_rate_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.attempted_at := now();
  IF EXISTS (
    SELECT 1 FROM public.login_attempts
    WHERE email = NEW.email AND ip_address = NEW.ip_address
      AND attempted_at > now() - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "<old permissive name>" ON public.login_attempts;
CREATE POLICY "anon_insert_rate_limited" ON public.login_attempts
  FOR INSERT TO anon WITH CHECK (true);  -- guard enforced by trigger

CREATE TRIGGER trg_login_attempts_rate_guard
  BEFORE INSERT ON public.login_attempts
  FOR EACH ROW EXECUTE FUNCTION public.login_attempts_rate_guard();
```

### 2. Flip 8 dashboard views to `security_invoker`
```sql
ALTER VIEW public.v_dashboard_counts SET (security_invoker = true);
-- ... repeat for: v_dashboard_gross_profit, v_dashboard_purchase_returns,
-- v_dashboard_purchase_summary, v_dashboard_receivables, v_dashboard_sale_returns,
-- v_dashboard_sales_summary, v_dashboard_stock_summary
```
Underlying tables already have `organization_id`-scoped RLS, so invoker mode is safe.

### 3. Pin `search_path` on 7 flagged functions
```sql
ALTER FUNCTION public.<fn>(<args>) SET search_path = public, pg_temp;
```
List filled in from linter output at write time.

### 4. Storage: block public listing on sensitive buckets, keep signed URLs
Signed URLs work via `storage.objects` GET by token — they don't require a SELECT policy match for unauthenticated users. So we can safely restrict authenticated SELECT to bucket owners only, and rely on signed URLs for everyone else.

```sql
-- Block anon listing on sensitive private-data buckets
DROP POLICY IF EXISTS "<existing public select on objects>" ON storage.objects;

CREATE POLICY "supplier_bills_org_members_only" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-bill-images'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "invoice_pdfs_org_members_only" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );

-- Also flip the bucket public flag off; signed URLs still work
UPDATE storage.buckets SET public = false WHERE id IN ('supplier-bill-images','invoice-pdfs');
```

Caveat to verify at write time: confirm the file path convention is `{organization_id}/...` for these buckets. If not, use the actual prefix scheme. `product-images` and `company-logos` stay public (intentional — used in public invoice view + portal catalogue).

### 5. Auth leaked-password protection
Single `cloud--configure_auth` call with `password_hibp_enabled: true`. Not part of the SQL migration.

## Files / actions
- 1 SQL migration (items 1–4)
- 1 auth config call (item 5)
- No app code changes — all server-side hardening

## Acceptance
- `login_attempts` rejects >1 insert per (email,ip) per 10s with a `42501` error, but legitimate logins still work.
- Linter run after migration shows 0 SECURITY DEFINER VIEW errors, 0 mutable-search-path warnings on the 7 fns, 0 permissive-policy warnings on `login_attempts`.
- `supplier-bill-images` and `invoice-pdfs` no longer list publicly; existing signed-URL flows in app continue to work (verify by opening one signed PDF link from Purchase Bill Dashboard).
- Auth → leaked-password protection enabled.
