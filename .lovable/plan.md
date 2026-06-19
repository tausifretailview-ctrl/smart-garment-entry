## Issue

Every time the user opens the **POS Sales** tab, an old saved invoice (e.g. `POS/26-27/1123`) reappears with the green **Save Changes** button instead of a blank new sale.

## Root Cause

Two layered behaviors keep the previously-loaded invoice "stuck" on the POS Sales tab:

1. **Tab caching keeps POSSales mounted forever.** `src/components/TabCachedPages.tsx` puts `pos-sales` in `EXPLICIT_PROTECTED_TAB_PATHS` / `LIVE_WORK_TAB_PATHS`. So when the user opens any saved invoice (via Previous / Last / Edit from the Sales dashboard) and then switches to another tab, the React state for `POSSales.tsx` — including `currentSaleId`, `items`, `customerId`, `originalItemsForEdit` — is preserved. Returning to the POS Sales tab simply re-shows that loaded invoice in edit mode.

2. **WindowTabsContext persists `?saleId=` in the tab's saved search.** `src/contexts/WindowTabsContext.tsx` (lines ~223–245) stores `location.search` per tab. If the user reached POS via "Edit Invoice" (`/pos-sales?saleId=...`), the `?saleId` stays attached to the POS tab. On hard reload or fresh tab-click navigation, `useEffect` at `POSSales.tsx:694–699` re-runs `loadSaleForEdit(saleId)`, reloading the same old invoice.

A third minor contributor: the session-storage cart snapshot (`writePosCartSnapshot`) keeps writing items even while viewing a saved invoice, so after a refresh the cart re-hydrates with items from the viewed sale (without `currentSaleId`, but the items look "leftover").

## Plan

Goal: opening / reactivating the POS Sales tab should land on a fresh new sale unless the user just navigated there from an "Edit" link in the current navigation event. No business-logic changes — only frontend reset semantics.

### 1. Drop `?saleId` from the persisted POS tab search after it is consumed
**File:** `src/pages/POSSales.tsx` (around the existing `loadSaleForEdit` effect, line 693–699)

- After `loadSaleForEdit(saleId)` resolves, call `setSearchParams({}, { replace: true })` to strip `saleId` from the URL.
- This prevents `WindowTabsContext` from re-storing `?saleId=...` as the tab's "last search", which is what causes the same invoice to reload every time the tab is clicked.

### 2. Auto-reset POS to a new sale when the tab becomes active in edit/view mode
**File:** `src/pages/POSSales.tsx`

- Add a "tab activation" effect: when the `pos-sales` tab transitions from hidden → active (detect via `document.visibilityState` + the `TabCacheLayoutContext`/`markTabCachePaneMounted` signals already in `tabCacheMountRegistry`), AND `currentSaleId` is set, AND the user is not mid-edit of unsaved changes, automatically run `handleNewInvoice()` so the screen is blank.
- Conservative variant: only auto-reset when **no unsaved edits** exist relative to `originalItemsForEdit` — if the user genuinely modified the loaded invoice, keep it (so we don't throw away their work). Otherwise reset.

### 3. Stop snapshotting the cart while a saved invoice is loaded
**File:** `src/pages/POSSales.tsx` (the snapshot effect at lines 645–660)

- Add `if (currentSaleId) { clearPosCartSnapshot(orgId); return; }` at the top of the effect.
- Rationale: the snapshot is meant for **unsaved work-in-progress** only. While viewing/editing a saved invoice, writing its items into sessionStorage causes them to reappear as a phantom cart after a reload.

### 4. Clear the cart snapshot on `loadSaleForEdit` entry
**File:** `src/pages/POSSales.tsx` (inside `loadSaleForEdit`, near line 854)

- Call `clearPosCartSnapshot(currentOrganization.id)` so any earlier in-progress snapshot is dropped when the user explicitly opens a saved invoice.

### 5. Tab-click behavior in WindowTabsBar (optional safety net)
**File:** `src/contexts/WindowTabsContext.tsx`

- When the user clicks the already-open `pos-sales` tab from `WindowTabsBar` (i.e. switches to it from another tab), strip any `saleId` from the saved search before navigating, so re-opening the tab never reloads the edit URL.

## What stays the same

- Edit / Previous / Next / Last buttons still work exactly as today **within a session** while POS is the active tab.
- The held-bill flow, sale return flow, and "New Sale" button are untouched.
- No DB, RLS, or pricing logic changes.
- Mobile POS layout (`MobilePOSLayout`) unaffected — these are POSSales state-level fixes shared by both layouts.

## Verification

1. From Sales Invoice Dashboard, click **Edit** on a saved invoice → POS Sales opens with that invoice and **Save Changes** button (expected).
2. Switch to another tab (e.g. POS Dashboard) and back to POS Sales → POS Sales now shows a **blank new sale** (was: still showed the old invoice).
3. Reload the browser while on POS Sales → POS Sales lands on a blank new sale (was: re-loaded the old invoice via persisted `?saleId`).
4. Open POS Sales fresh, scan items, switch tabs and back → unsaved cart is still preserved (snapshot path still works for genuine new sales).
5. Edit a saved invoice, modify a line, switch tabs and back → the edit-in-progress is preserved (auto-reset skipped because edits differ from `originalItemsForEdit`).