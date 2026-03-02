
Goal: eliminate the Chrome-only login dead-end by making the organization login screen resilient even when the initial organization lookup request fails before reaching the backend.

What I investigated and what it shows:
1) Runtime evidence (from your logs + network)
- Repeated failures are on `POST .../rest/v1/rpc/get_org_public_info`.
- Error is `TypeError: Failed to fetch` (browser/network layer), not an API error payload.
- This happens before a response status is returned.

2) Backend health check
- Organization records for `demo` and `adtech-accounts` exist.
- `get_org_public_info('demo')` returns valid data when queried from backend tools.
- No matching backend log entries for the failing Chrome attempts, which indicates requests are failing client-side (transport/service worker/extension/network stack), not because data/function is missing.

3) Code path review
- `OrgAuth.tsx` currently blocks the full login UI behind pre-login org metadata fetch (`orgLoading` spinner path).
- Even with timeout fallback, users are still forced into a “connection problem” gate before they can attempt normal login.
- `handleSignIn` hard-requires `organization` object from that prefetch, so login cannot proceed when org metadata fetch is blocked.

Proposed fix (minimal-risk, no UX redesign):
1) Make login page render-first, fetch branding in background
- File: `src/pages/OrgAuth.tsx`
- Keep org metadata fetch, but remove full-page blocking spinner dependency for valid slugs.
- Render login form immediately using safe defaults (current brand fallback already exists).
- Treat org fetch as enhancement (branding/details), not a gate to sign-in.

2) Add submit-time organization resolution fallback
- File: `src/pages/OrgAuth.tsx`
- In `handleSignIn`, if `organization` is null:
  - Resolve org membership after authentication using slug-based membership query (authenticated path), e.g. `organization_members` joined with `organizations` filtered by `orgSlug`.
  - Continue existing membership validation and role-based navigation logic.
- This removes the hard dependency on `get_org_public_info` for initial login access.

3) Preserve strict invalid/not-found behavior
- File: `src/pages/OrgAuth.tsx`
- Keep current invalid slug and not-found messages/cards.
- Only relax the “network error” path so users can still use login form instead of being blocked.

4) Add explicit Chrome recovery action for stuck network state
- File: `src/pages/OrgAuth.tsx` (reuse existing cache utilities)
- Add a “Reset App Cache & Retry” action in connection-problem state:
  - unregister service workers
  - clear caches
  - hard reload
- This is already used elsewhere (`ErrorBoundary`, `useClearCache`) and is especially relevant for Chrome-only stuck sessions.

5) Tighten request lifecycle to avoid hanging race effects
- File: `src/pages/OrgAuth.tsx`
- Use request token/abort guard so stale async retries cannot overwrite latest state after retry/navigation.
- Keep existing retry/backoff but ensure state updates only for the active request cycle.

Why this is the safest effective approach:
- No backend schema or policy changes.
- No visual redesign; same login page and branding system remain.
- Fix targets the real bottleneck: pre-login blocking dependency on a network-sensitive RPC call.
- Users get immediate access to login interaction even in degraded Chrome conditions.

Validation plan after implementation:
1) Baseline happy path
- Open `/:orgSlug` on normal browser state; confirm branded login appears and login flow unchanged.

2) Simulated degraded org lookup
- Force org metadata request failure (offline/throttle/block) and confirm:
  - page still renders login form immediately
  - submit path still handles auth + membership checks correctly
  - user gets actionable errors instead of indefinite loading/dead-end.

3) Chrome-specific recovery
- In Chrome, verify “Reset App Cache & Retry” clears stale worker/cache and app recovers without manual devtools steps.

4) Regression checks
- Invalid slug -> still shows invalid URL flow.
- Non-existent org -> still shows not found flow.
- Existing non-member user -> still receives membership denial and sign-out behavior.

Technical implementation notes:
- Primary file to update: `src/pages/OrgAuth.tsx`
- Optional small utility reuse/import: `src/hooks/useClearCache.tsx` (or inline equivalent existing logic)
- No changes to generated backend client files.
- No database migration required.

Expected outcome:
- Users will no longer be trapped on loading/connection gate before login in Chrome.
- Login remains available and functional even when initial organization metadata fetch intermittently fails.
- Friction is reduced with an in-UI self-healing recovery path for Chrome cache/service worker corruption scenarios.
