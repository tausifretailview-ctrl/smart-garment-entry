# Blank white workspace when opening an organization

## What happens

Opening `/{org}` (e.g. `/ks-footwear`) paints the sidebar, header and tab bar, but the
workspace area stays white. A reload shows the dashboard normally. The console in the
screenshot confirms the sequence: no error for ~6 seconds, then
`[OrgLayout] Tab pane not ready — falling back to Outlet`.

## Confirmed cause (read from the current code)

Two places treat "the chunk file is downloaded" as "a pane is painted on screen".

1. `src/components/TabCachedPages.tsx` (~line 820)
   `hasReadySiblingPane` counts a sibling tab as ready when
   `isTabCachePaneMounted(p) || isTabPageChunkLoaded(p)`. On a cold open, the
   post-login prefetch downloads sibling chunks (POS Dashboard, Sales, etc.) within
   the first second, so this is true even though no sibling has mounted yet.
   That sets `silentColdNav`, and the active pane's Suspense fallback returns
   `null` ("a sibling is already on screen, don't paint a loading shell") — but no
   sibling is on screen. Nothing renders.

2. `src/components/OrgLayout.tsx` (~lines 109-221)
   `isTabPaneReadyForPath` returns true for a chunk-loaded-but-never-mounted path,
   so `hasReadySiblingPane` → `showTabCacheDuringColdNav` → `renderOwner = "tab-cache"`.
   That also hides `<Outlet>`, so the fallback route cannot paint either.

Result: tab-cache owns the frame, paints nothing, and `<Outlet>` is suppressed —
a white workspace until the 6s rescue timer (or a manual reload) hands the route
back to `<Outlet>`.

The 1.2s blank-frame watchdog does not save this case reliably because the
workspace container still has a sized box while the dimmed (empty) sibling pane is
mounted, so `hasPaintedContent` reports true.

## Fix

1. **Silence only when a sibling is genuinely painted** — in `TabCachedPages`,
   base `hasReadySiblingPane` on real mount state (`isTabCachePaneMounted`) plus a
   pane that has actually signalled ready, not on `isTabPageChunkLoaded`. When no
   sibling is painted, render the normal `DashboardSkeleton` / loading shell instead
   of `null`.
2. **Same correction in `OrgLayout`** — split the two meanings: keep chunk-loaded as
   the fast path for *the current* path (that stays, it prevents the Outlet flash),
   but require an actually mounted sibling before `showTabCacheDuringColdNav` can
   suppress `<Outlet>`.
3. **Harden the watchdog** — treat a workspace whose only visible children are
   `aria-hidden` / dimmed outgoing panes as unpainted, so a future variant of this
   state is rescued in 1.2s instead of 6s.

Net effect: opening an org shows the dashboard skeleton and then the dashboard —
never a white pane — and the 6s Outlet fallback stops being the normal path.

## Notes / out of scope

- The `blob:` manifest CSP warning and the 406 request in the same console are
  separate, non-blocking issues (PWA manifest and a `maybeSingle` lookup) — not the
  cause of the blank frame. Flag if you want them handled too.
- Frontend render-path only; no data, query or backend changes.
