
# Security Hardening -- All Issues FIXED ✅

## Completed Changes

### Issue 1 ✅ (Critical): Public Sales Data Exposure
- Dropped `"Public can view sales by id for invoice sharing"` on `sales`
- Dropped `"Public can view sale items for invoices"` on `sale_items`
- Created edge function `get-public-invoice` that returns only sanitized fields (no customer_phone, customer_email, customer_address)
- Updated `PublicInvoiceView.tsx` to use edge function

### Issue 2 ✅ (Critical): Public Settings Exposure
- Dropped `"Public can view settings for invoice display"` on `settings`
- Settings data now served via `get-public-invoice` edge function (only display fields)

### Issue 3 ✅ (Critical): Public Organizations Exposure
- Dropped `"Anyone can view organization by slug"` on `organizations`
- Created secure RPC `get_org_public_info(slug)` returning only safe fields
- Updated `OrgAuth.tsx` to use RPC instead of direct table query

### Issue 4 ✅ (Critical): Audit Log Protection
- Added `organization_id` column to `audit_logs`
- Added explicit DENY policies for DELETE and UPDATE (append-only)
- Updated `log_audit` and `log_security_event` functions to populate org_id

### Issue 5 ✅ (Warning): Login Attempts Bypass
- Dropped `"Authenticated users can manage login attempts"` blanket policy
- Replaced with anon-only INSERT/SELECT/UPDATE policies

### Issue 6 ✅ (Warning): Function Search Path
- Fixed `generate_next_barcode(uuid)` with `SET search_path = 'public'`

### Issue 7 ✅ (Warning): Organizations INSERT
- Dropped `"authenticated_users_can_insert_organizations"` permissive policy
- Platform admin policy remains for controlled org creation

## Remaining Linter Warnings (Acceptable)
- `login_attempts` anon INSERT/UPDATE with `true` — intentional for brute-force tracking
- Leaked password protection disabled — auth config setting, not a code issue
