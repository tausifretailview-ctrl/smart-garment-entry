
# Fix: Prevent Page Re-render When Switching Browser Tabs

## Problem
When users operate multiple browser tabs (common for fast billing), switching between tabs triggers a cascade:
1. Tab becomes visible → auth session refresh fires
2. Session refresh calls `setUser(data.session.user)` with a new object reference
3. OrganizationContext depends on `user` and calls `fetchOrganizations()`, setting `loading: true`
4. The loading state causes the entire page to re-render with a spinner, losing any in-progress work (selected customer, cart items, etc.)

## Root Cause
The `user` dependency in OrganizationContext (line 81) triggers a full org re-fetch whenever the user object reference changes, even if the actual user ID hasn't changed. Session refreshes create new object references every time.

## Changes

### 1. AuthContext -- Skip state update when user hasn't changed
**File: `src/contexts/AuthContext.tsx`**

In the `safelyRefreshSession` callback (around line 105-108), only update state if the user ID actually changed:
```typescript
} else if (data.session) {
  // Only update state if user actually changed (prevents re-render cascade on tab switch)
  if (data.session.user?.id !== sessionRef.current?.user?.id) {
    setSession(data.session);
    setUser(data.session.user);
  } else {
    // Silently update the ref without triggering re-renders
    sessionRef.current = data.session;
  }
}
```

### 2. OrganizationContext -- Track user ID instead of user object
**File: `src/contexts/OrganizationContext.tsx`**

Change the useEffect dependency from `user` (object reference) to `user?.id` (stable string):
```typescript
useEffect(() => {
  if (!user) { ... return; }
  fetchOrganizations();
}, [user?.id]); // Was [user] -- object reference changed on every refresh
```

This ensures organizations are only re-fetched when the user actually logs in/out, not on every session token refresh.

### 3. Auth onAuthStateChange -- Same user ID guard
**File: `src/contexts/AuthContext.tsx`**

In the `onAuthStateChange` handler, apply the same optimization: only call `setUser` if the user ID has actually changed, to prevent cascade re-renders from `TOKEN_REFRESHED` events.

---

## Impact
- Multi-tab billing will work smoothly without page refresh on tab switch
- Session tokens will still be refreshed silently in the background
- No impact on login/logout flows (those change the user ID)
- Existing session security (Chrome token revocation, expiry checks) remains intact
