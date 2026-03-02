

# Fix: Sign-In Failing Due to Chrome Network Deadlock

## Problem
The login form now renders correctly (render-first fix is working), but clicking "Sign In" fails because the `signInWithPassword` request also throws `TypeError: Failed to fetch`. ALL requests to the backend are being blocked at Chrome's network layer (Service Worker corruption, DNS cache, or extension interference). The current catch block shows a generic "unexpected error" message with no recovery path.

## Root Cause
When Chrome's network stack is in a deadlocked state (stale Service Worker, corrupted DNS cache, or aggressive extension blocking), every `fetch()` call to the backend fails before reaching the server. The sign-in handler catches this but:
1. Shows a generic unhelpful error message
2. Doesn't offer any recovery action (clear cache button)
3. Counts network failures as "login attempts", eventually locking the user out unfairly

## Changes (single file: `src/pages/OrgAuth.tsx`)

### 1. Detect network errors specifically in handleSignIn
In the `catch` block (line 357), detect `TypeError: Failed to fetch` and show a network-specific error message with retry guidance, instead of the generic "unexpected error" message.

### 2. Don't count network failures as login attempts
Currently, if `signInWithPassword` returns an auth error (wrong password), that's correctly counted. But if the entire request fails at the network layer (thrown TypeError), it hits the catch block. Network failures should NOT increment the login attempt counter or trigger lockout.

### 3. Show "Clear Cache and Retry" button when network errors occur during sign-in
When the catch block detects a network-level failure, set a state flag that renders the existing "Reset App Cache" recovery button prominently near the error message, giving users a one-click fix for Chrome's stuck state.

### 4. Wrap pre-login signOut in try-catch
The `signOut({ scope: 'local' })` call at line 246 should be safe (local-only), but wrap it in its own try-catch to prevent any edge case from blocking the sign-in flow.

## Technical Details

```typescript
// In catch block of handleSignIn:
catch (err: any) {
  const isNetworkError = err instanceof TypeError && 
    (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError'));
  
  if (isNetworkError) {
    setError("Network connection failed. Your browser may have a stale cache. Try clearing the app cache below, or check your internet connection.");
    setShowCacheRecovery(true); // New state flag
  } else {
    setError("An unexpected error occurred. Please try again.");
  }
}
```

- Add `showCacheRecovery` state that triggers rendering a prominent "Clear App Cache & Retry" button alongside the error
- Reset `showCacheRecovery` when user retries
- Wrap line 246 (`signOut`) in try-catch so it can't block sign-in
- The `handleClearCacheAndRetry` function already exists (line 365) -- just need to surface it in the sign-in error UI

## What This Fixes
- Users stuck in Chrome with dead network get a clear explanation and one-click recovery
- Network failures don't count toward the login lockout timer
- The pre-login signOut can't block the flow even in edge cases
- Error messages are specific and actionable instead of generic
