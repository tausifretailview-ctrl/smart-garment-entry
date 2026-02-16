

# Security Hardening -- Fix All 10 Issues

## Overview

This plan addresses all security gaps found in the audit. **No existing data will be deleted or modified** -- only RLS policies and schema are updated.

---

## Issue 1 (Critical): Public Sales Data Exposure

**Problem:** `"Public can view sales by id for invoice sharing"` uses `USING(true)`, exposing ALL sales (with customer PII like phone, email, address) to unauthenticated users.

**Fix:** Add a `share_token` column to `sales`. Replace the blanket public SELECT policy with one that requires knowing the sale UUID **and** a matching `share_token`. The public invoice view will pass `?token=xxx` in the URL.

```text
Migration:
  1. ALTER TABLE sales ADD COLUMN share_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex');
  2. UPDATE sales SET share_token = encode(gen_random_bytes(16), 'hex') WHERE share_token IS NULL;
  3. ALTER TABLE sales ALTER COLUMN share_token SET NOT NULL;
  4. DROP POLICY "Public can view sales by id for invoice sharing" ON sales;
  5. CREATE POLICY "Public can view shared sales by token"
     ON sales FOR SELECT TO anon, authenticated
     USING (share_token = current_setting('request.headers', true)::json->>'x-share-token');

Code changes:
  - PublicInvoiceView.tsx: read token from URL query param, pass as header or filter
  - Invoice sharing link generation: include share_token in the URL
```

**Simpler alternative (recommended):** Since the public invoice is already accessed by sale UUID (which is unguessable), we can simply restrict the public policy to only return non-sensitive columns using a **database view** instead. This avoids URL changes.

**Chosen approach:** Create a `public_invoice_view` database view that exposes only invoice-display columns (no customer_phone, customer_email, customer_address, payment details), then point the public policy at the view. For the `sales` table itself, remove the public SELECT entirely.

Actually, the simplest safe approach: **Replace the blanket `USING(true)` policy with one that only works for `anon` role and restricts columns via a secure RPC function** that returns only display-safe fields. This avoids breaking existing invoice links.

**Final approach (minimal disruption):**
1. Drop `"Public can view sales by id for invoice sharing"` on `sales`
2. Drop `"Public can view sale items for invoices"` on `sale_items`
3. Create an **edge function** `get-public-invoice` that takes a `saleId`, queries with service role, and returns only display-safe fields (no customer_phone, customer_email, raw addresses)
4. Update `PublicInvoiceView.tsx` to call the edge function instead of direct Supabase queries

---

## Issue 2 (Critical): Public Settings Exposure

**Problem:** `"Public can view settings for invoice display"` uses `USING(true)`, exposing ALL organization settings (GST numbers, API keys, WhatsApp config, etc.) to anyone.

**Fix:** Remove this policy. The edge function from Issue 1 will also return the needed display settings (business name, logo, address) without exposing sensitive config.

---

## Issue 3 (Critical): Public Organizations Exposure

**Problem:** `"Anyone can view organization by slug"` uses `USING(true)`, exposing subscription tiers, enabled features, all org metadata.

**Fix:** Replace with a policy that only exposes `id`, `name`, `slug`, `logo_url` columns. Since RLS cannot restrict columns, create an RPC function `get_org_by_slug(slug)` that returns only safe fields, and drop the blanket policy. Update the login page to use the RPC.

---

## Issue 4 (Critical): Audit Log Protection

**Problem:** `audit_logs` has no `DELETE` or `UPDATE` policies, but also no explicit denial. The table only has a SELECT policy for admins/managers.

**Fix:**
1. Add `organization_id` column to `audit_logs` (populated from existing metadata or via trigger)
2. Replace global `has_role` SELECT policy with org-scoped policy
3. Ensure no INSERT/UPDATE/DELETE policies exist for regular users (only the `log_audit` SECURITY DEFINER function can write)
4. Explicitly add a restrictive DELETE policy that denies all

---

## Issue 5 (Warning): Login Attempts Bypass

**Problem:** `"Authenticated users can manage login attempts"` uses `USING(true)` with `ALL` command, allowing any authenticated user to delete/modify any login attempt record.

**Fix:** Replace with:
- `SELECT` for authenticated users on their own records (by identifier match)
- `INSERT` and `UPDATE` for the server only (via edge function with service role)
- Drop the blanket `ALL` policy

Actually, login_attempts is used client-side with localStorage currently. The RLS policy is overly permissive but the table may not even be actively used via Supabase. Safest fix: restrict to `anon` INSERT only (for recording attempts) and no SELECT/UPDATE/DELETE for regular users.

---

## Issue 6 (Warning): Function Search Path

**Problem:** `generate_next_barcode` is a SECURITY DEFINER function missing `SET search_path = 'public'`.

**Fix:** `ALTER FUNCTION generate_next_barcode(...) SET search_path = 'public';`

---

## Issue 7 (Warning): Organizations INSERT

**Problem:** `"authenticated_users_can_insert_organizations"` has `WITH CHECK(true)`, letting any authenticated user create unlimited organizations.

**Fix:** Replace with a check that the user doesn't already own too many orgs, or restrict to platform_admin only (there's already a `platform_admins_can_create_organizations` policy). Drop the permissive one.

---

## Summary of Database Changes

| Change | Type | Risk |
|--------|------|------|
| Add `share_token` to `sales` | ADD COLUMN | None -- new column with default |
| Add `organization_id` to `audit_logs` | ADD COLUMN | None -- nullable, backfilled |
| Drop 3 public USING(true) policies | DROP POLICY | Low -- replaced by secure alternatives |
| Drop login_attempts blanket policy | DROP POLICY | Low -- replaced |
| Drop permissive org INSERT policy | DROP POLICY | Low -- platform_admin policy remains |
| Fix function search_path | ALTER FUNCTION | None |
| Create edge function `get-public-invoice` | New function | None |
| Create RPC `get_org_public_info` | New function | None |

## Code Changes

1. **`src/pages/PublicInvoiceView.tsx`** -- Call `get-public-invoice` edge function instead of direct table queries
2. **`src/pages/OrgAuth.tsx`** (or wherever org lookup by slug happens) -- Use `get_org_public_info` RPC instead of direct query
3. **New edge function `supabase/functions/get-public-invoice/index.ts`** -- Returns sanitized invoice data
4. **Invoice link generation** -- Include share_token in URL if using token approach

## What Will NOT Change
- No existing data deleted
- No existing auth flow changes
- All existing authenticated queries continue working
- Invoice sharing links may need updating (one-time) if using token approach

