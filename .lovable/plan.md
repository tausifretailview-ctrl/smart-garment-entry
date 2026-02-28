

# Fix Google OAuth on Custom Domain (Vercel)

## Problem
Google sign-in triggers a redirect to `/~oauth` on `app.inventoryshop.in`. The `vercel.json` catch-all rewrite intercepts this path and sends it to `index.html`, which renders the React Router "Not Found" page instead of letting Lovable's OAuth handler process it.

## Root Cause
```json
// Current vercel.json - catches EVERYTHING including /~oauth
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Fix

### File: `vercel.json`
Add a negative lookahead to exclude the `/~oauth` path from the SPA rewrite so it passes through to Lovable's infrastructure:

```json
{
  "rewrites": [
    { "source": "/~oauth", "destination": "/~oauth" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Vercel processes rewrites top-to-bottom, so the first rule ensures `/~oauth` is NOT rewritten to `index.html`. It stays as-is and gets handled by the platform's OAuth callback.

## What Already Works
- Email/password login: works fine (no redirect needed)
- Google OAuth code in `OrgAuth.tsx`: correctly implemented using `lovable.auth.signInWithOAuth("google")`
- PWA service worker: already excludes `/~oauth` via `navigateFallbackDenylist`

## After Fix
1. User clicks "Sign in with Google" on `app.inventoryshop.in/demo`
2. Redirected to Google consent screen
3. Google redirects back to `app.inventoryshop.in/~oauth`
4. Lovable's OAuth handler processes the callback (no longer intercepted by Vercel)
5. User is authenticated and redirected to the org dashboard

## Risk
None -- this is a single-line addition to `vercel.json` that only affects the `/~oauth` path. All other routes continue working as before.

