# Blank workspace on navigation — single render owner + blank-frame watchdog

**Date:** 2026-08-11
**Symptom:** After a page switch or reload, the workspace paints white. Reported on
Account Ledger, Purchase Bill and Insights. Users recover by reloading 2-3 times.

## Root cause

`OrgLayout` decided who paints the workspace with **two independently computed
booleans**: `renderViaTabCache` (does the cached pane render?) and
`hideTabCacheContainer` (is the cache container hidden?). Nothing tied them
together, so the state "cache hidden **and** Outlet suppressed" was reachable —
that state is the blank page. It shows up when a lazy chunk is mid-flight and no
sibling pane is ready, and the old 18s (12s on Electron) rescue timer was far
past the point users gave up and reloaded manually.

## Changes

### 1. Single render owner (`src/components/OrgLayout.tsx`)
One `renderOwner: "tab-cache" | "outlet"` value; both old booleans now derive from
it, making "both hidden" unrepresentable. The source carries a 9-row mapping table
proving cases 1-8 are behaviour-identical to the old pair and case 9 is the bug
being removed. The table lives in the source, not just here, so it survives.

### 2. Blank-frame watchdog (`src/components/OrgLayout.tsx`)
1.2s after a navigation, if the workspace container has no visible child box
(`hasPaintedContent`), record the decision snapshot and hand the route back to
`<Outlet>`. Rescue timer for a stuck pane dropped from 18s/12s to 6s.

Both the watchdog and the rescue timer read one shared exemption,
`usesLongLoadBudget` (`isEntryPage || isCacheableEntryActive`), so bill-entry
screens holding unsaved draft state can never be swapped out from under the user.
They must not diverge — noted at the definition. `AppBootSplash` independently
satisfies `hasPaintedContent` (full-height element, >1px box), so the entry
exemption is belt-and-braces rather than load-bearing.

### 3. Always-on render-owner instrumentation (`src/lib/navigationPerfDiagnostics.ts`)
30-entry ring of render-owner decisions, recorded **even when NavPerf is disabled**,
readable in the field via `window.__ezzyRenderOwner.print()`. Field reports arrive
after the fact, so the evidence has to already be in memory when we ask a user to
read it out. Reproduction target cited in source: the SM HAIR REPLACEMENT Electron
case (five tabs open, stuck on Settings / User Rights, both the 8s soft hint and
the hard timeout fired).

### 4. Insights deliberately NOT added to the tab registry (`src/lib/tabPageRegistry.ts`)
Registering `insights` would have moved it into the cached pane, and the registry
only supports **role** gating. The route is guarded by
`MenuPermissionRoute("business_insights")`, so caching it would have silently
bypassed that permission check — a worse bug than the blank page. A comment at the
registry site records the reason so nobody re-adds it without re-deriving it.

### 5. Unrelated build fix — `src/pages/CustomerLedgerPage.tsx`
The `payAtSaleLedgerRows` map callback lacked an explicit `LedgerRow | null` return
type, so TS2322 blocked the build. **Nothing to do with render-owner logic** — it
was bundled into this commit only because the build could not run without it.

## Ruled out

- **Mobile / `SalesmanLayout`.** Mobile shares `OrgLayout` (`useShowDesktopChrome`
  only swaps chrome), so it receives this fix. The one separate shell,
  `src/layouts/SalesmanLayout.tsx`, renders a plain `<Outlet />` with no competing
  render owner, so it cannot hit this class of bug. Recorded here so a future
  mobile blank-page report does not re-derive it — if one appears, the cause is
  something else.

## Verification status

Typecheck clean; lint clean on changed files (one pre-existing `prefer-const` in
`navigationPerfDiagnostics.ts`, untouched).

**Outstanding:** the authenticated Purchase Bills -> Ledger -> Insights loop under
network throttling has NOT been run — the preview session was signed out
(`LOVABLE_BROWSER_AUTH_STATUS=signed_out`), and no session can be minted here.
This is the step that actually proves the fix; everything above only makes it
verifiable. Run it after signing in via the preview, and check
`window.__ezzyRenderOwner.print()` for any `BLANK` / `RESCUED` entries.
