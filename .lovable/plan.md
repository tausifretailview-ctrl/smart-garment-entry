

# Fix: Application Not Loading on Jio Mobile Data and Wi-Fi

## Problem

Users on Jio mobile data and Wi-Fi cannot load the application. The root cause is a **render-blocking external script** and heavy font loading that stalls on Jio's network (known for DNS/CDN throttling in India).

## Changes

### 1. Make QZ Tray Script Non-Blocking

**File: `index.html` (line 6)**

Change the synchronous QZ Tray script to load asynchronously with a fallback timeout. This prevents the entire page from freezing if `cdn.jsdelivr.net` is unreachable.

- Add `async` attribute to the script tag
- Move it to the bottom of `<body>` (before the main app script)
- Add an `onerror` handler so the app still loads even if QZ Tray fails

### 2. Reduce Font Loading Impact

**File: `index.html` (line 30)**

- Add `loading="lazy"` approach: split into critical fonts (Inter only) loaded immediately, and the remaining 10 fonts loaded after the app renders
- Add `font-display: swap` via the Google Fonts URL parameter (already included via `&display=swap` but ensure it's preserved)

### 3. Add Network Timeout for Backend Connection

**File: `src/integrations/supabase/client.ts`** -- CANNOT edit (auto-generated)

Instead, add a connection health check in `src/App.tsx` or `src/contexts/AuthContext.tsx`:
- Add a 10-second timeout wrapper around the initial `getSession()` call
- If it times out, show a "Connection Problem" screen with retry (similar to what `OrgAuth.tsx` already does)

### 4. Add DNS Prefetch Hints for Critical Domains

**File: `index.html`**

Add DNS prefetch and preconnect hints for the backend domain so browsers on slow networks start DNS resolution early:

```html
<link rel="dns-prefetch" href="https://lkbbrqcsbhqjvsxiorvp.supabase.co" />
<link rel="preconnect" href="https://lkbbrqcsbhqjvsxiorvp.supabase.co" />
```

### 5. Service Worker Update Strategy

**File: `vite.config.ts`**

Add `skipWaiting: true` and `clientsClaim: true` to the workbox config to ensure users on Jio (who may have stale caches) get the latest version immediately on refresh.

## Summary of File Changes

| File | Change |
|---|---|
| `index.html` | Make QZ Tray async, split font loading, add DNS prefetch |
| `vite.config.ts` | Add `skipWaiting` and `clientsClaim` to workbox config |
| `src/App.tsx` or auth layer | Add connection timeout with retry UI |

## Expected Outcome

- App loads immediately even if CDN is blocked by Jio
- Fonts load progressively without blocking render
- Users see a helpful "retry" screen instead of a blank page on slow connections
- Stale service worker caches are replaced automatically

