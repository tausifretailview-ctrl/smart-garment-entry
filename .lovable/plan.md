

# Fix: Users Landing on "Create Organisation" Instead of Their Login Page

## Problem

The screenshot shows a user at a shop seeing "Create Your Organization" instead of their dashboard or org login page. This happens when:
1. The user IS logged in, but the organization membership fetch fails (network issue on Jio) -- so `organizations.length === 0` and `OrganizationSetup` shows the create form
2. OR the user is NOT logged in and the stored org slug was lost from localStorage/sessionStorage -- so `ProtectedRoute` redirects to `/organization-setup` instead of `/:orgSlug`

## Root Cause

- `OrganizationSetup` assumes "no organizations = new user" but it could also mean "fetch failed"
- `ProtectedRoute` falls back to `/organization-setup` when no slug is found, but the slug can be extracted from the URL path itself
- `localStorage`/`sessionStorage` can be cleared by the browser, losing the org slug with no backup

## Changes

### 1. Add cookie-based fallback for org slug persistence
**File: `src/lib/orgSlug.ts`**
- Add `getOrgSlugFromCookie()` and `setOrgSlugCookie()` helper functions
- Update `getStoredOrgSlug()` to check cookie as a third fallback after localStorage and sessionStorage
- Update `storeOrgSlug()` to also write to a cookie (30-day expiry)

### 2. Extract org slug from URL path before falling back
**File: `src/components/ProtectedRoute.tsx`**
- When `!user` and no stored slug found, parse `window.location.pathname` to extract the first path segment
- Validate it with `isValidOrgSlug()` -- if valid, redirect to `/:slug` instead of `/organization-setup`
- This catches cases where user is at `/:orgSlug/dashboard` and session expires

### 3. Handle failed org fetch in OrganizationSetup
**File: `src/components/OrganizationSetup.tsx`**
- Add retry logic to `OrganizationContext` fetch -- if organization fetch fails due to network, show "Connection Problem" with retry instead of "Create Organization"
- Check if a stored org slug exists: if so, show a "Go to your organization" button instead of only the create form
- This prevents existing users from accidentally creating duplicate organizations

### 4. Add org fetch error state to OrganizationContext
**File: `src/contexts/OrganizationContext.tsx`**
- Add `fetchError` state to track when the organization membership query fails
- Expose `fetchError` and `refetchOrganizations` in the context
- `OrganizationSetup` uses these to distinguish "no orgs" vs "fetch failed"

## Technical Details

### Cookie helper (orgSlug.ts)
```text
- setOrgSlugCookie(slug, days=30): document.cookie = `orgSlug=${slug}; path=/; max-age=...`
- getOrgSlugFromCookie(): parse document.cookie for "orgSlug" value
- getStoredOrgSlug(): localStorage -> sessionStorage -> cookie fallback
```

### ProtectedRoute URL extraction
```text
When !user and no stored slug:
  1. const segments = window.location.pathname.split('/').filter(Boolean)
  2. const firstSegment = segments[0]
  3. if (isValidOrgSlug(firstSegment)) redirect to /${firstSegment}
  4. else redirect to /organization-setup
```

### OrganizationSetup guard
```text
When user is authenticated and organizations.length === 0:
  - If fetchError: show "Connection Problem" with retry button
  - If storedOrgSlug exists: show "Go to [slug]" button alongside create form
  - Only show pure "Create Organization" if no error AND no stored slug
```

## File Summary

| File | Change |
|---|---|
| `src/lib/orgSlug.ts` | Add cookie-based fallback persistence |
| `src/components/ProtectedRoute.tsx` | Extract org slug from URL path before fallback |
| `src/contexts/OrganizationContext.tsx` | Add fetchError state and refetch method |
| `src/components/OrganizationSetup.tsx` | Handle fetch errors, show "go to org" when slug exists |

## Expected Outcome
- Users on Jio/unstable networks see "Connection Problem - Retry" instead of "Create Organization"
- The org slug survives localStorage/sessionStorage clearing via cookie backup
- Users at org-scoped URLs always redirect back to their org login, never to organization-setup

