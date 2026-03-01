

# Fix Google OAuth Login on Custom Domain

## Problem
After clicking "Sign in with Google", users see "Oops! Page not found" on the custom domain. The `vercel.json` already has the correct rewrite rules, but when the OAuth callback reaches the React app (which can happen depending on hosting setup), the catch-all `Route path="*"` renders the NotFound page.

## Root Cause
The `vercel.json` rewrite rules are correctly configured, but:
1. If the app is served via Lovable's custom domain (not Vercel), `vercel.json` has no effect
2. When the `/~oauth` callback reaches the browser, React Router's catch-all route (`path="*"`) renders `<NotFound />` instead of letting the platform handle the OAuth callback

## Solution

### 1. Add `/~oauth` route guard in React Router (App.tsx)
Add a route before the catch-all that intercepts any `/~oauth*` path and shows a loading spinner instead of "Not Found". This handles the brief moment when the OAuth callback URL is visible in the browser:

```tsx
{/* OAuth callback handler - prevent NotFound for /~oauth paths */}
<Route path="/~oauth/*" element={
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin" />
    <span className="ml-2">Completing sign-in...</span>
  </div>
} />

{/* Catch-all for 404 */}
<Route path="*" element={<NotFound />} />
```

### 2. Keep vercel.json as-is
The current `vercel.json` with both `/~oauth` and `/~oauth/:path*` rules is already correct for Vercel deployments. No changes needed.

## Files to Modify
- **src/App.tsx** -- Add a `/~oauth/*` route before the catch-all `*` route (around line 1057)

## Why This Works
- On Vercel: The rewrite rules handle `/~oauth` at the server level (never reaches React)
- On Lovable custom domain: The platform handles `/~oauth` at infrastructure level
- Edge case fallback: If the path ever reaches React Router, users see "Completing sign-in..." instead of "Page not found"

