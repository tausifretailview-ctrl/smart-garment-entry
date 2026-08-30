# PWA cold-open: dashboard chunk never ready (ELLA NOOR live, 2026-08-30)

**Scope:** Trace why `isTabPageChunkLoaded("")` / `effectiveTabPaneReady` stayed false until the 4s Outlet rescue.  
**Capture:** ELLA NOOR, live shop session (not `/demo`). `persistRestoreMs: 355` (modest).  
**`__ezzyMainThread.print()`** at rescue: `(no longtasks recorded yet)` — expected; persist had already finished. Re-run later for post-paint jank, not this 29.5s–33.9s gap.

This is the original stuck-Dashboard bug. It is not the main-thread-violation tangent.

---

## 1. Timeline (shop) mapped onto OrgLayout

| UTC | Probe | What the code is doing |
| --- | --- | --- |
| 29.523Z | boot-splash, `orgLoading=true` | `OrgLayout` mounted. Early-return `<AppBootSplash>`. **`TabCachedPages` and `<Outlet>` are not in the tree.** Hooks still run. The 4s Outlet timer **armed here** (old code). |
| 29.678Z | boot-splash, `orgLoading=false` | `OrganizationProvider` first effect with `user==null` sets `loading=false`. Splash may still be `!isOrgSynced` (“Preparing workspace…”) or leftover HTML splash. |
| 29.730Z | boot-splash, `orgLoading=true` | `user.id` appeared → `fetchOrganizations()` → `setLoading(true)`. Workspace **unmounts** again if it had flashed. Timer **not** reset (`orgLoading` was not a dep). |
| 30.109Z | `fetchStatus=fetching`, `orgLoading=true` | Permissions query started. Still splash. **Index chunk still not requested.** |
| 31.386Z | `orgLoading=false`, spinner=`load-shell` | Past splash. Hidden `TabCachedPages` + visible Outlet mount. `DashboardSkeleton` (`data-ezzy-load-shell="dashboard"`). **First moment `import("@/pages/Index")` can start.** |
| 33.924Z | `forceOutletFallback=true`, chunk=false, pane=false, `load-shell` | `[OrgLayout] Tab pane not ready — falling back to Outlet`. 29.523 + 4.401s ≈ `OUTLET_FALLBACK_MS` (4000). |

**Actual import window:** 31.386 → 33.924 = **2.54s**, not 4s.

`effectiveTabPaneReady` stays false until `TabPageWithPerf` commits and `onReady` fires. That requires the lazy `Index` module to resolve. If the import is still in flight at 2.5s, pane-ready cannot become true.

---

## 2. Why `isTabPageChunkLoaded("")=false` at rescue is only half-trustworthy

`loadedChunkPaths` is set only in `loadTabPageModule` when `importWithRetry` resolves.

The rescue callback (old code) did:

1. `resetTabPageChunk("")` — **deletes** `loadedChunkPaths` and `prefetchCache`
2. `setForceOutletFallback(true)`
3. Probe effect then reads `isTabPageChunkLoaded("")` → **always false**

So the rescue snapshot cannot prove the module never resolved. `effectiveTabPaneReady=false` **can** — `onReady` never ran.

Earlier snapshots omitted a chunk=true row. The probe effect did **not** re-snapshot when only the chunk flag changed. A resolve between 31.386 and 33.924 would be invisible, then wiped by reset.

Treat rescue-time `isTabPageChunkLoaded("")=false` as **inconclusive**. Treat `effectiveTabPaneReady=false` as **the pane never committed**.

---

## 3. What actually blocks the chunk

Not persist (355ms). Not a 532ms `message` handler (no longtasks at print time).

### Proven: timer / splash race

`OrgLayout` returns splash while `orgLoading` or `!isOrgSynced`. The 4s `useEffect` did not check those flags. Hooks run during splash, so the clock started ~1.86s before any `import("@/pages/Index")`.

`OrganizationContext` flicker (`loading` false then true when `user` appears) matches 29.678 → 29.730. That remounts the workspace if it had started; the 4s timer kept running.

### Likely: slow (or shared) Index import in the remaining 2.5s

Once the workspace mounts, three factories hit the same Vite URL:

| Caller | Factory |
| --- | --- |
| Tab cache | `getLazyTabPage("")` → `importWithRetry(() => import("@/pages/Index"))` |
| Org home Outlet | `MobileOrgIndexRedirect` → `lazy(() => import("@/pages/Index"))` (**not** App.tsx `lazyWithRetry`) |
| App.tsx | `lazyWithRetry(() => import("./pages/Index"))` (other routes) |

The browser shares one native `import()`. `isTabPageChunkLoaded` only flips when the **tab-cache** wrapper resolves. A 3–8s Index download on shop PWA/wifi fits “never ready in 2.5s.” A hung shared `import()` (AAMAN empty Network) is still possible; 2.5s is too short to tell hung vs slow. `refreshStaleInFlightTabChunk` is 12s; module timeout is 60s.

`prefetchPostLoginCriticalPages` waits for `effectiveTabPaneReady` — chicken-and-egg for **sibling** warms only. The active tab still `prefetchTabPage("", { intent: true })` once `TabCachedPages` mounts. That is not the 29.5–31.4s gap.

Post-login prefetch of `""` is **not** what starts the first dashboard import on cold open. The splash early-return is.

---

## 4. `__ezzyMainThread.print()` empty

The main-thread probe records `longtask` entries ≥50ms. Persist restore (355ms) finished at bootstrap, before this 4s gap. Empty print at rescue does **not** contradict the chunk race. Re-run after Dashboard paint if you still care about later Forced-reflow / `message` handler lines.

---

## 5. Fix (this change)

Do **not** retune `OUTLET_FALLBACK_MS` (still 4000).

- Arm the 4s timer only when `user && !orgLoading && isOrgSynced` (`shouldArmOutletFallbackTimer`). Splash / flicker **clears** the timer; a full 4s starts when the workspace can import.
- Snapshot `chunkLoadedBeforeReset` / `inFlight` **before** `resetTabPageChunk`.
- Log `[PWAColdOpen] chunk (dashboard) start|resolved|failed` from `loadTabPageModule`.

Next capture should show `chunk (dashboard) start` at ~workspace mount, then either `resolved` before 4s (pane ready, no rescue) or `start` still in-flight at a rescue that now reports `chunkLoadedBeforeReset` honestly.
