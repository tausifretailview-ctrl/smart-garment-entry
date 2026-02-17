

## Fix: Loading Spinner Stuck After User Creation + Login Page Not Appearing

### Problem
After creating an organization and user, when visiting the org auth URL (e.g., `/adtechagency`), the page gets stuck on an infinite loading spinner instead of showing the login form. This prevents logging in with a different account.

### Root Cause
The `OrgLayout` component shows a loading spinner while `authLoading || orgLoading` is true. After sign-out or session transitions, there can be a race condition where:
1. `authLoading` from `AuthContext` doesn't resolve to `false` quickly enough
2. The `OrgLayout` waits for both auth AND org loading, even when there's no user (org loading is irrelevant without a user)
3. The `checkUserMembership` effect in `OrgAuth` signs out non-members, but the loading state doesn't reset properly

### Solution

**1. Fix `OrgLayout.tsx`** - Prioritize auth state over org loading:
- If auth is done loading and there's NO user, immediately render `<OrgAuth />` without waiting for org loading
- This prevents the spinner from blocking the login page when the user is logged out

```tsx
// Current (broken):
if (authLoading || orgLoading) {
  return <Loader2 spinner />;
}

// Fixed:
if (authLoading) {
  return <Loader2 spinner />;
}
if (!user) {
  return <OrgAuth />;
}
if (orgLoading) {
  return <Loader2 spinner />;
}
```

**2. Fix `OrgAuth.tsx`** - Ensure loading state resets after membership check sign-out:
- When `checkUserMembership` signs out a non-member, ensure the component properly shows the login form
- Add a local state to track when the membership check has completed to avoid re-triggering

### Files to Modify
- `src/components/OrgLayout.tsx` - Reorder auth/loading checks
- `src/pages/OrgAuth.tsx` - Improve membership check flow and loading reset

### Technical Details
The fix separates the loading logic so that:
1. First, wait only for auth to load
2. If no user after auth loads, show login immediately (skip org loading)
3. Only wait for org loading when a user IS authenticated

