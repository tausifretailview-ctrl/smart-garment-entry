# Blank white page — where it stands, and what's left

## Short answer

Partly. Two of the three causes are fixed in code; the third — the one that
actually drove today's reports — is not a code problem and is still open.

## What is already fixed (confirmed in the current checkout)

- **Single render owner + blank-frame watchdog** (`src/components/OrgLayout.tsx`):
  the "cache hidden AND Outlet suppressed" state is no longer representable, and
  a 1.2s watchdog hands the route back to `<Outlet>` if nothing painted.
- **Speculative prefetch no longer reloads the app** (`src/lib/tabPageRegistry.ts`):
  a background chunk fetch that fails now logs `[chunk-skew] ... (intent=false)`
  instead of triggering a full page reload. This is what made Settings reload
  itself under the user.

Neither has been exercised in an authenticated session yet — that verification
was never run (recorded in `docs/blank-page-render-owner-2026-08.md`).

## What is still open

1. **Deploy skew.** 17 production deploys in 17 hours, 11 of them inside a
   ~2.5 hour window, means an open shop tab is stale almost continuously. The
   watchdog cannot fix a chunk that no longer exists on the CDN.
2. **Vercel Skew Protection is not wired.** No `__vdpl` cookie/header handling
   exists in `src/`. It also needs to be toggled on in the Vercel project first —
   that switch is not reachable from here.
3. **Outfit font 404.** `public/fonts/` contains only `inter-latin.woff2`; Outfit
   still comes from Google Fonts through a year-long CacheFirst SW rule pointing
   at hashes Google has deleted. Cosmetic, but it is the 404 in the console
   screenshot.

## Proposed next steps

- Verify the two landed fixes in a signed-in session: navigate Purchase Bills →
  Ledger → Insights under throttling and read `window.__ezzyRenderOwner.print()`
  for `BLANK` / `RESCUED` entries.
- Self-host Outfit next to `inter-latin.woff2` and drop it from the Google Fonts
  link, killing the 404 and the stale-hash cache rule.
- Wire `__vdpl` once Skew Protection is enabled in Vercel.
- Batch deploys outside shop hours until skew protection is live.

## Technical notes

The watchdog and the rescue timer share one exemption, `usesLongLoadBudget`
(`isEntryPage || isCacheableEntryActive`), so bill-entry screens with unsaved
draft state are never swapped out. Those two must not diverge.
