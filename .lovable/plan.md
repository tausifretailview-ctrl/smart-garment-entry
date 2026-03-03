

# Custom Domain Auth & API Configuration

## Analysis

### 1. Supabase Client URL (`client.ts`)
**This file is auto-generated and cannot be edited.** The `VITE_SUPABASE_URL` in `.env` is also auto-managed. Changing either will be overwritten.

**Solution**: The ISP blocking bypass for `api.inventoryshop.in` must be handled at the **DNS/proxy level**, not in application code:
- Set up `api.inventoryshop.in` as a **CNAME** or **reverse proxy** (via Cloudflare, Vercel, or your DNS provider) pointing to `lkbbrqcsbhqjvsxiorvp.supabase.co`
- This makes the Supabase API reachable via your custom domain without any code changes needed
- The browser will connect to `api.inventoryshop.in` which transparently forwards to Supabase

**This is not something that can be done in code -- it requires DNS configuration outside Lovable.**

### 2. Auth Redirect Synchronization
Update all auth redirect logic to use `https://app.inventoryshop.in` as the canonical origin.

#### Files to modify:

**`src/pages/OrgAuth.tsx`** (Google OAuth):
- Custom domain branch: change `redirectTo` from `window.location.origin + "/"` to explicitly use `https://app.inventoryshop.in/` + orgSlug
- Lovable bridge branch: change `redirect_uri` to `https://app.inventoryshop.in`

**`src/components/OrganizationSetup.tsx`**:
- Update the org slug helper text from `inventoryshop.in/` to `app.inventoryshop.in/`

**`vercel.json`**:
- Already has the `~oauth` rewrite -- no changes needed

All other `window.location.origin` usages (invoice links, payment links, clipboard copies) are fine as-is -- they dynamically use whatever domain the user is on, which will be `app.inventoryshop.in` in production.

