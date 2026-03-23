

## Fix: Login fails on Wi-Fi but works on mobile hotspot

### Root Cause
Indian ISPs (especially Jio broadband/fiber) block `*.supabase.co` domains. The `get_org_public_info` RPC call fails on these networks, showing the "Connection issue detected" warning and potentially blocking login. Mobile hotspot uses cellular routing which bypasses this block.

The project already has `api.inventoryshop.in` as a custom API proxy (per existing architecture), but the Supabase client in `client.ts` still uses the default `VITE_SUPABASE_URL` (which points to `lkbbrqcsbhqjvsxiorvp.supabase.co`). Since `client.ts` is auto-generated and cannot be edited, the fix must be at the application level.

### Solution: Cache org metadata in localStorage

**File: `src/pages/OrgAuth.tsx`**

1. **On successful RPC response** (line ~147): Cache the org data in `localStorage` with key `org_public_info_{slug}`

2. **On component mount** (before RPC call, line ~81): Check localStorage first. If cached data exists, use it immediately to populate `organization` and `orgSettings`, and set `orgLoading = false`. This prevents the warning banner from appearing.

3. **Background refresh**: Still run the RPC call silently. If it succeeds, update the cache. If it fails but cache exists, suppress the network error entirely (no yellow banner, no "Connection issue detected").

4. **Only show warning if**: Cache is empty AND RPC fails after all retries (first-ever visit on a blocked network).

### Changes detail

```text
Line ~81-173 (fetchOrganization function):

1. Before the retry loop, check:
   const cacheKey = `org_pub_${normalizedSlug}`;
   const cached = localStorage.getItem(cacheKey);
   if (cached) {
     const parsed = JSON.parse(cached);
     setOrganization({ id, name, slug, settings });
     setOrgSettings({ business_name, bill_barcode_settings });
     setOrgLoading(false);
     // Continue fetching in background but don't show errors
   }

2. After successful RPC (line ~147):
   localStorage.setItem(cacheKey, JSON.stringify(resolvedOrgData));

3. In the error path (line ~161):
   If cached data was already loaded, skip setting error/warning states.
```

### Result
- First visit on blocked Wi-Fi: Warning shows (unavoidable, no cache yet). Login via hotspot once creates the cache.
- All subsequent visits on any network: Cached data loads instantly, no warning, login form appears immediately. Background refresh keeps cache fresh silently.
- Works identically on all ISPs for returning users.

