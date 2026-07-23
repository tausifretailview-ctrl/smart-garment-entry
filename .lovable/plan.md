# Goal
Eliminate two related loading stalls on the web app for Ranawat Bling:
1. **Login / reload sometimes hangs** until a manual refresh (or shows a spinner) while the organization syncs.
2. **Purchase → Add New Product button sometimes opens a stuck "Loading product form…" dialog** or takes too long to open.

# Scope
- Web build only (Ranawat Bling / `ranawat-s-bling` org slug).
- Frontend-only fixes; no DB schema changes.
- No new UI design; just loading reliability and timeout behavior.

# Root causes found

## 1. Organization sync stalls
The boot path has **stacked, independent timeouts** that can leave the shell in a spinner longer than needed:
- `OrganizationContext.fetchOrganizations()` uses a 20s fetch timeout and a separate `ensureFreshSession()` session refresh before it even queries `organization_members`.
- `OrganizationContext.switchOrganization()` does a **second** `organization_members` round-trip even though the original membership query already returned the role.
- `OrgLayout` triggers `switchOrganization()` when the URL org slug changes, then waits for a separate 4s `syncTimeout` guard before forcing render. If the network round-trip to `switchOrganization` is slow, the 4s guard fires and renders the shell in a fallback state; the user then refreshes and it usually works because the session is now fresh.
- `fetchOrganizations` also has no in-flight request de-duplication, so remounts/StrictMode can fire the same 20s-guarded query twice.

## 2. Add Product chunk load hangs
- `ProductEntryDialog` is a lazy chunk. The `ProductEntryDialogGate` shows a 20s UI timeout, but the underlying `importWithRetry()` promise keeps running for up to 60s per attempt (5 attempts). Pressing **Retry** nulls the promise and starts a fresh 60s attempt, so a slow connection can stay stuck in a loop.
- `PurchaseEntry.tsx` blocks the button click with `await warmProductEntryDialogForOpen()` before opening the gate, so the user sees a second "Loading form…" state on the button *and* the dialog spinner.
- Post-login background prefetch (`OrgLayout`) competes for the same bandwidth immediately after login, delaying the Add Product chunk on cold start.

# Implementation plan

## 1. Harden organization sync
### `src/contexts/OrganizationContext.tsx`
- Add an in-flight request guard (`fetchingRef`) so concurrent calls do not double the 20s timeout.
- Derive the selected org and role from the already-fetched `memberships` array; avoid the second `organization_members` query.
- Make `ensureFreshSession` non-blocking for the org query: use `getSession()` and only refresh if the token is near expiry, but wrap the refresh in a short timeout so a slow refresh does not hold up the whole org fetch.
- Keep the existing cache fallback but shorten the "empty result retry" path to one quick retry with a small timeout.

### `src/components/OrgLayout.tsx`
- Remove the redundant `switchOrganization()` call when the URL org is already present in `organizations` and the role is already known; set `isOrgSynced` directly.
- If `switchOrganization` is still needed (edge case), wrap it in a timeout and catch so it never leaves `isOrgSynced` unresolved.
- Change the `syncTimeout` safety net from a hard 4s to a value that aligns with the org fetch budget (or derive it from the same state) so we do not force a fallback too early.
- Add a single console warning that captures the exact stall path (`OrgLayout sync timeout / org mismatch / slug` ...) for future diagnosis.

## 2. Make Add Product load abortable and remove double spinner
### `src/lib/productEntryDialogLoad.ts`
- Add an optional `AbortSignal` parameter to the load path so the UI can cancel the in-flight import and its retry loop.
- Expose a `cancelProductEntryDialogLoad()` helper that aborts the current `loadPromise` and resets it.
- Keep `prefetchProductEntryDialog()` for the mount/hover pre-warm, but make it pause background prefetch so it gets priority.

### `src/components/ProductEntryDialogGate.tsx`
- When the 20s UI timeout fires, call `cancelProductEntryDialogLoad()` and reset `loadPromise` so the retry starts clean.
- After a retry, show the loading shell again (not the timeout shell) until the new timeout or success.

### `src/pages/PurchaseEntry.tsx`
- Remove the blocking `await warmProductEntryDialogForOpen()` call from the button click handler. Open the gate immediately; let the gate’s own loading shell handle the feedback.
- Keep `onMouseEnter`/`onFocus` prefetch for the fast path, but remove the `addProductWarming` button spinner so the user does not see two loading states.
- If `handleAddNewProductFromInline` uses the same path, make sure it also opens the gate without blocking.

## 3. Reduce post-login prefetch contention
### `src/lib/tabPageRegistry.ts` and `src/components/OrgLayout.tsx`
- Verify that the web already uses the smaller `POST_LOGIN_PREFETCH_TAB_PATHS_WEB` list. If not, switch the web path to it so fewer chunks compete with Add Product on cold start.
- Keep the full desktop Electron list unchanged.

## 4. Verify
- Run `npm run build` and the Vitest suite (no test changes expected, just a regression check).
- Test the web login flow for `/ranawat-s-bling` in a throttled browser profile: reload the page after login, confirm the workspace renders without a manual refresh.
- Test Purchase Entry → Add New Product on a cold (or throttled) tab: click the button multiple times, confirm it opens the dialog within a few seconds or shows a clean retry prompt without looping.
- Test that the existing dialog data (current purchase bill, line items) is preserved when the dialog is cancelled.

# Technical details
- Files to touch: `src/contexts/OrganizationContext.tsx`, `src/components/OrgLayout.tsx`, `src/lib/productEntryDialogLoad.ts`, `src/components/ProductEntryDialogGate.tsx`, `src/pages/PurchaseEntry.tsx`, possibly `src/lib/tabPageRegistry.ts`.
- No Supabase migrations or RLS changes.
- No new dependencies.

# Out of scope
- Native/Electron/Android app changes unless the same root causes also appear there (the fixes will mostly help all platforms, but verification is web-only).
- Redesigning the Add Product dialog UI or its fields.
- Adding telemetry/logging to production (we will use existing console warnings).