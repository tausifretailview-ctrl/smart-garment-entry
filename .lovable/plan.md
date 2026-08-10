# Purchase Entry & Barcode Printing: finish the slow-load / blank-page fix

## Where we are after the last four items

The work already merged fixes the **database and network** side:

- Barcode Printing search is now tenant-scoped with a 500-row cap (was a cross-tenant scan).
- Purchase Entry no longer runs two full-table counts per removed line.
- Bill saving is one batched RPC instead of ~100 re-sums (the 8s timeout).
- Idle prefetch lists are deduped and skip already-warmed chunks.

Those remove the query timeouts and the bandwidth contention. They do **not** remove the remaining cause of "slow open, then blank page after refresh" on these two screens: both pages are single very large modules (BarcodePrinting 8,340 lines, PurchaseEntry 8,624 lines), and BarcodePrinting statically imports `jspdf`, `html2canvas` and `jsbarcode` at the top of the file. On slow shop Wi-Fi that chunk download can exceed the module-load timeout, the lazy import rejects, and the user sees the error/blank screen until a retry succeeds.

So: expect a clear improvement in Velvet / Chirag, but the blank-page tail is not fully closed yet. Below is what closes it.

## What to change

1. **Make the PDF/canvas stack load on demand (Barcode Printing)**
   Convert `jspdf`, `html2canvas` and the A4 PDF helper to dynamic `import()` inside the print/download handlers instead of top-level imports. The page becomes usable while the print engine loads only when the user actually prints.

2. **Split the two pages into a light shell + heavy panels**
   Keep the toolbar, search, and item table in the main chunk; move the rarely-opened heavy sections (label designer / preset dialogs on Barcode Printing, Excel import and bulk dialogs on Purchase Entry) behind `React.lazy` sub-chunks. Goal: first-open chunk well under the timeout on a 3G-class link.

3. **Retry instead of blanking**
   These two routes currently surface the failed dynamic import as a full error screen. Give them an inline "Still loading — Retry" state that re-runs the import with the existing `importWithRetry` path, so a transient chunk failure never leaves a blank page requiring 2-3 manual refreshes.

4. **Verify with a real measurement**
   Run a production build, record the emitted chunk sizes for both routes before/after, and load each route in a throttled browser session to confirm first paint and no chunk error.

## Technical notes

- Dynamic-import conversion in `src/pages/BarcodePrinting.tsx`; heavy panels extracted into new files under `src/components/precision-barcode/` and `src/components/purchase/`.
- Lazy sub-chunks use `lazyWithRetry` from `src/lib/chunkLoadRetry.ts` so they inherit the existing retry/timeout policy.
- Retry state hooks into the existing `TabCachedPages` suspense boundary rather than a new error boundary.
- No database, RLS, or business-logic changes — presentation and module-loading only.

## Out of scope

No changes to purchase totals, stock triggers, barcode generation rules, or label geometry.
