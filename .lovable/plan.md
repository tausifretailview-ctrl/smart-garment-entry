

## Fix: Chrome Session Stability - Startup Health Check

### Problem
Chrome's aggressive caching and tracking protection can sometimes leave corrupted auth tokens in localStorage, causing users to get stuck in a "logged out but can't log back in" state.

### What's Already Handled (No Changes Needed)
- Session persistence via localStorage
- Chrome-specific `refresh_token_not_found` recovery
- Cross-tab refresh locking to prevent 429 errors
- Expired session auto-refresh
- Visibility-change token refresh

### What We'll Add

**1. Startup Session Health Check in `App.tsx`**
- On app mount (before AuthProvider renders), check if localStorage contains auth tokens
- If tokens exist but are malformed/corrupted (can't be parsed as valid JSON), clear them immediately
- This prevents the "stuck login" scenario where Chrome preserves bad tokens across sessions

**2. Storage Key Collision Guard in `AuthContext.tsx`**
- Since we can't set a custom `storageKey` in client.ts, add a guard that detects if multiple Supabase instances are competing for the same localStorage key
- On session errors, do a clean wipe of all `sb-*` keys in localStorage before retrying

### Technical Details

**File: `src/App.tsx`**
- Add a top-level effect (or inline script before providers) that:
  - Scans localStorage for keys matching `sb-*-auth-token`
  - Validates the stored value is valid JSON with expected fields (`access_token`, `refresh_token`)
  - If corrupted, removes the key so AuthProvider starts fresh
  - Logs a warning for debugging

**File: `src/contexts/AuthContext.tsx`**
- In the `getSession` error handler, add a more aggressive cleanup:
  - Remove all `sb-*` keys from localStorage (not just calling `signOut({ scope: 'local' })`)
  - This handles edge cases where Supabase's own cleanup misses corrupted entries

### Files to Modify
1. `src/App.tsx` -- Add startup token health check
2. `src/contexts/AuthContext.tsx` -- Enhance error cleanup to clear all `sb-*` keys

