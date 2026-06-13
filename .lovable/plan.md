## What the user sees
On Windows / web, after minimizing the window and bringing it back, **Purchase Entry** briefly shows a loading state (the amber "Restoring your bill…" banner and a re-mount of the form), even though no bill was actually navigated away from. **Sales Invoice** in the same scenario stays static — the form keeps its values and never flashes a loader.

## Root cause

Purchase Entry has visibility / draft-restore logic that Sales Invoice does not have. Three places re-fire on window focus / remount and together produce the "reload" effect:

1. `src/pages/PurchaseEntry.tsx` lines 928-944 — a `useLayoutEffect` that, whenever its deps change (currentOrganization.id, user.id, lineItems.length, location.state.newBill, location.key), checks `hasPurchaseEntryDraftInBrowser` and calls `setIsRestoringDraft(true)`. When the auth/org context re-resolves on tab focus (the existing session-resilience hook revalidates on `visibilitychange`), `currentOrganization?.id` momentarily changes identity → this effect fires → amber "Restoring your bill…" banner appears.

2. Lines 946-954 — TWO restore effects (one `useLayoutEffect`, one `useEffect`) call `restorePersistedWork()` whenever the callback identity changes. `restorePersistedWork` depends on `currentOrganization?.id`, `user?.id`, `hasDraft`, `draftData`, `location.state.editBillId`, `location.state.loadDraft` etc. On window focus those queries re-validate → callback identity changes → restore runs again → it reads IndexedDB and re-applies the draft into state, causing visible reflow (the "reload").

3. SalesInvoice does **not** have any of `restorePersistedWork`, `isRestoringDraft`, or visibility listeners — it relies entirely on staying mounted in the tab cache. Purchase Entry's extra machinery was originally added for the Excel-import interruption guard but now fires far too often.

The pane itself never unmounts (tab cache keeps it alive) — what the user perceives as "reload" is the banner + a forced re-render from re-running the restore path.

## Fix plan (UI / behaviour only)

Edit `src/pages/PurchaseEntry.tsx`:

1. **Guard the "Restoring" banner against re-trigger after first restore.**
   In the `useLayoutEffect` at lines 928-944, add an early return when `workRestoredRef.current === true`. This stops the amber banner from re-appearing after the initial mount restore is done.

2. **Stop the restore effects from re-running on focus.**
   Replace the two effects at lines 946-954 with a single mount-only `useLayoutEffect` (empty dep array) that calls `restorePersistedWork()` once. The fallback "draft metadata arrives after mount" case is already handled by the `useLayoutEffect` above which sets the banner; once `draftData` lands the existing `loadDraftData` path inside `restorePersistedWork` will be invoked through the dashboard-discarded event handler that already exists.

3. **Skip re-restore when the tab pane is still mounted and we already restored.**
   In `restorePersistedWork`, before doing any IndexedDB read, return early if `workRestoredRef.current === true && lineItemsCountRef.current === 0 && isTabCachePaneMounted(...)` — meaning we're getting called again only because of a focus event, not a real remount.

4. **Do not flip `setIsRestoringDraft(true)` if line items are already present** anywhere in `restorePersistedWork` (lines 869 and 875). The banner is only meaningful before lines load.

No changes to Sales Invoice, no changes to persistence files, no DB / RPC changes. Pure presentation + effect-dependency cleanup so Purchase Entry behaves like Sales Invoice on minimize-restore.

## Verification

- Open Purchase Entry with a few line items → minimize the window → restore. Form stays static, no amber banner, no flash.
- Open blank Purchase Entry, type a supplier invoice no, minimize → restore. Field keeps its value, no flash.
- Hard refresh (F5) on Purchase Entry with a draft in IndexedDB still shows the "Restoring your bill…" banner once (correct behaviour preserved).
- Excel-import interruption guard still works — `pendingImportRef` and `entryPersistenceBlockedRef` paths are untouched.
