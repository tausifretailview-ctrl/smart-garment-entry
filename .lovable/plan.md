

# Fix: "Create Organization" Showing for All Existing Users

## Root Cause (NOT network related)

The real problem is a **stale JWT + RLS interaction**:

1. User's session token expires (Chrome suspends tab, login expires naturally, Chrome clears storage)
2. `AuthContext` still has `user` object briefly (from cached state), so the user appears "logged in"
3. `OrganizationContext.fetchOrganizations()` runs with an **expired/invalid JWT**
4. The `organization_members` query does NOT throw an error -- it returns **empty results** because RLS silently filters out rows when the JWT is invalid
5. Code sees `organizations.length === 0` + `hasResolvedOrganizations = true` + `fetchError = false`
6. Result: "Create Your Organization" form appears for an existing user

This is why it affects ALL organizations regardless of network -- it's a JWT validity issue, not connectivity.

## Solution

### 1. Detect suspicious empty results in OrganizationContext
**File: `src/contexts/OrganizationContext.tsx`**

After fetching organizations, if the result is empty BUT the user previously had organizations (from cache), treat it as a potential stale-session issue:
- Try refreshing the auth session first
- Re-fetch organizations with the fresh token
- Only accept "0 organizations" if the session is confirmed fresh AND there's no cached org history

### 2. Force session refresh before accepting empty org list
**File: `src/contexts/OrganizationContext.tsx`**

When `memberships` returns empty for a logged-in user:
- Call `supabase.auth.refreshSession()` to get a fresh JWT
- If refresh succeeds, retry the organization query once with the new token
- If refresh fails (token truly revoked), sign out locally and redirect to org login using stored slug
- This catches the case where RLS returns empty due to expired JWT

### 3. Auto-redirect to org login instead of showing Create form
**File: `src/components/OrganizationSetup.tsx`**

For authenticated users with 0 organizations but a stored slug (from cookie/localStorage/cache):
- Instead of showing the "Create Organization" form, automatically redirect to `/:storedSlug`
- The `OrgLayout` will detect the user isn't a member and show the proper login page
- Only show the Create form if there is genuinely NO stored slug AND no cached orgs AND session is fresh

### 4. Add session-freshness check before org fetch
**File: `src/contexts/OrganizationContext.tsx`**

Before running the org membership query, verify the current session token is not expired:
- Check `session.expires_at` against current time
- If expired, refresh first, then fetch orgs
- This prevents the "empty results from expired JWT" scenario entirely

## Technical Details

### OrganizationContext changes
```text
fetchOrganizations():
  1. Get current session via supabase.auth.getSession()
  2. If session expired -> refreshSession() first
  3. Run membership query
  4. If results empty AND cachedOrgs exist for this user:
     a. Try refreshSession() + re-query once
     b. If still empty after fresh token -> accept as genuine
     c. If refresh fails -> set fetchError, show retry UI
  5. Only set hasResolvedOrganizations=true when we trust the result
```

### OrganizationSetup changes
```text
When authenticated + hasResolved + organizations.length === 0:
  - If storedSlug OR cachedOrgs exist:
    -> Auto-redirect to /${slug} (don't show create form)
  - If NO slug AND NO cache:
    -> Show create form (genuinely new user)
```

## File Summary

| File | Change |
|---|---|
| `src/contexts/OrganizationContext.tsx` | Refresh session before org fetch; retry on suspicious empty results |
| `src/components/OrganizationSetup.tsx` | Auto-redirect to org login when slug exists instead of showing create form |

## Expected Outcome
- Users with expired sessions will get their token refreshed automatically before the org query runs
- If token refresh works: user sees their dashboard normally
- If token is truly revoked: user lands on their org's login page (not "Create Organization")
- Only genuinely new users (no slug, no cache, fresh session) see the create form

