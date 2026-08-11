# Blank white page on page switch — diagnose and make it impossible

## What is happening (and what is not yet confirmed)

Reported: switching pages (Account Ledger, Purchase Bill, Insights) sometimes lands on a blank white screen; a manual reload fixes it.

What I confirmed by reading the code:

- The workspace has **two competing render owners** in `OrgLayout`: the cached tab pane (`TabCachedPages`) and the router `<Outlet>`. Which one paints is decided by two *separately computed* booleans — `renderViaTabCache` and `hideTabCacheContainer` — plus `effectiveTabPaneReady`, `showTabCacheDuringColdNav`, and `forceOutletFallback`.
- Purchase Bill and Customer Ledger Report are tab-cache pages; Insights is **not** registered in the tab registry and always renders through `<Outlet>`. Both render paths are affected, so the common factor is the handoff in `OrgLayout`, not any single page.
- There is no last-resort guard: if the pane subtree renders nothing and `<Outlet>` is suppressed for the same frame, the shell paints an empty container — exactly a white page — with no error and no recovery UI. The existing rescue (`forceOutletFallback`) only fires after **18 seconds** (12s on the desktop shell), far past the point a user gives up and reloads.

What I have **not** confirmed: which of the possible states actually occurs in production. That needs a reproduction with instrumentation, so it is step 1 — not a guess baked into a fix.

## Plan

### 1. Instrument the render handoff (diagnosis first)

Extend the existing navigation diagnostics so every navigation records a snapshot of the decision inputs: `renderViaTabCache`, `hideTabCacheContainer`, `effectiveTabPaneReady`, `showTabCacheDuringColdNav`, `forceOutletFallback`, mounted pane paths, and whether the active pane's chunk was already loaded. Keep the last ~30 entries in memory and expose them for readout, and log a single warning when a navigation ends with **neither** owner painting.

Cheap, always-on, and it turns the next user report into evidence instead of speculation.

### 2. Single source of truth for the render owner

Replace the two independently derived booleans with one computed `renderOwner` value (`"tab-cache" | "outlet"`), and derive both container visibility and `<Outlet>` rendering from it. This makes "both hidden" structurally unrepresentable rather than something reasoned about case by case. No behavioural change intended for states that already work.

### 3. Blank-frame watchdog (the user-visible fix)

After each navigation settles, check that the workspace container actually painted content (rendered children with non-zero height). If it is still empty after a short grace period (~1.2s), log the step-1 snapshot and switch the render owner to `<Outlet>`. A white screen then self-heals in about a second instead of needing a manual reload.

### 4. Shorten the stuck-pane rescue

Drop the `forceOutletFallback` timer from 18s/12s to roughly 6s for non-entry pages. Bill-entry screens keep their longer budget because they hold unsaved draft state and must not be swapped out.

### 5. Register Insights in the tab registry (optional, same pass)

`insights` is the only one of the three reported pages with no registry entry, so it always cold-loads through `<Outlet>` and gets none of the prefetch/keep-alive treatment its sibling report pages get. Adding it removes one asymmetry from the surface being debugged.

## Files this touches

- `src/components/OrgLayout.tsx` — unified render owner, watchdog, shorter rescue timer
- `src/lib/navigationPerfDiagnostics.ts` — render-decision snapshots + blank-frame warning
- `src/lib/tabPageRegistry.ts` — Insights entry (step 5)

## Verification

- Drive the app with Playwright across Purchase Bills → Customer Ledger Report → Insights → back, repeatedly and with the network throttled, asserting the workspace container is non-empty after each navigation.
- Confirm the diagnostics record exactly one owner per navigation and never zero.
- Confirm bill-entry screens (Purchase Entry, POS) still keep draft state across tab switches and are not swapped to `<Outlet>` by the shortened timer.

## Note

Steps 2–4 make a blank page recoverable and short-lived, but the underlying trigger is only pinned down by step 1. If the diagnostics show a specific state (for example, a pane reporting its chunk as loaded while its subtree is unmounted), that root cause gets a targeted fix in a follow-up rather than being papered over by the watchdog.