# PWA cold-open blank Dashboard — Phase 0 (2026-08)

**Date:** 2026-08-25 (updated same day with AAMAN recording)  
**Scope:** Investigation only. No code changes.  
**Report:** Installed standalone PWA (not Electron). Opening an organization shows a blank white Dashboard with a loading spinner on **first paint** — cold, right after selecting/opening the org, **before any tab switch**. Manual reload recovers. Orgs: KS FOOTWEAR, ADEEBAAREEBA, and now **AAMAN** (screen recording + DevTools).

This is **not** assumed to be the same class as:

1. Deploy skew / stale hashed chunks (stale `index.html`)  
2. `OrgLayout` dual-boolean render owner (fixed 2026-08-11; see `docs/blank-page-render-owner-2026-08.md`)  
3. Tab-cache pane-readiness / sibling-tab blank (including the 21 Aug slim post-login prefetch)

Those three are about **already-mounted** shells navigating between panes. This report is the **first Dashboard paint after org open**.

---

## 1. Live DevTools evidence

### 1a. AAMAN recording (decisive for “is a request hanging?”)

A screen recording of a live stuck state on **AAMAN** was analysed frame-by-frame.

**Console (during the blank/spinner):**

- `[OrgLayout] Tab pane not ready — falling back to Outlet` — the 4s tab-cache rescue **did fire**. `OrgLayout` is mounted, past `authLoading` / `orgLoading` / `isOrgSynced`. This is **not** the branded “Loading organization…” splash still waiting on membership.
- `Checking field sales access for user...` then `Field sales access result: null` — `useFieldSalesAccess` `queryFn` ran. That hook is used from `Index.tsx`, so **at least one `Index` tree committed** (hooks do not run while that tree is still in `Suspense`).
- A **406** from `organization_members` `.eq(user_id).eq(organization_id).single()` in `useShopName.tsx`. The hook never checks `error`, so the 406 is swallowed. **Out of scope for this bug** (see §7). Unlikely to block paint.

**Network (during the remainder of the stuck period):**

- Panel status: **“Currently recording network activity.”**
- **Request list empty: zero pending, zero completed**, until the user reloaded from the browser context menu.
- After reload: Dashboard paints; a **wave of chunk requests, all 200**.

**Caveat (must not over-read):** Chrome only records Network while that tab is open (unless Preserve log was on from document start). The field-sales query and the 406 **already happened** (console proves it); they would not appear if recording started after they finished. What the empty list **does** prove: **for the entire remaining hang, the client issued no further HTTP.** A query stuck in-flight would still show as **pending**. That mechanism is ruled out for the *ongoing* freeze.

### 1b. Earlier session (Cursor, no shop login)

Could not open an installed PWA as KS/ADEEBAAREEBA. That gap is closed by the AAMAN recording.

---

## 2. 15-minute silent-update banner

Installed PWA: banner only after `needRefresh`; silent reload requires a **hidden** tab; fallback is 15 minutes.

The AAMAN hang is an **immediate** spinner with **no** further network, not a 15-minute wait. A waiting SW can still contribute to a **bad first import** (then `importWithRetry` behaviour in §5), but the banner timer itself is not what holds the spinner.

Stale HTML navigations remain `NetworkOnly` in `vite.config.ts` (closed). After reload, chunks were **200**, not HTML-for-JS in that capture.

---

## 3. What the 4s Outlet fallback actually does on Dashboard home

PWA `start_url` is `/{orgSlug}`. Logged-in home is Main Dashboard.

`OrgLayout` 4s timer (the log in the recording):

1. `resetTabPageChunk(resolvedCurrentPath)` — drops `prefetchCache` / `lazyCache` / `loadedChunkPaths` for `""`.
2. `setForceOutletFallback(true)` — hide tab-cache container, show `<Outlet />`.

Comment at the timer says Outlet uses **App.tsx `lazyWithRetry`**. For org **index** that is **false**. Outlet is `MobileOrgIndexRedirect` → `lazy(() => import("@/pages/Index"))` (**not** `lazyWithRetry`). Tab-cache uses `getLazyTabPage` → `lazyWithRetry` → `loadTabPageModule` → the **same** `import("@/pages/Index")` URL.

`resetTabPageChunk` does **not** cancel the browser’s in-flight module promise. `refreshStaleInFlightTabChunk` already documents that: *“Browsers may still share a hung module promise for the same URL.”* A second `import()` then **does not show a new Network row**.

That matches “empty Network for the remainder” **if** the hang is a stuck module graph / Suspense. It is **in tension** with field-sales logs, which need a committed `Index` (see §6).

---

## 4. Trace: Auth → Organization → permissions → MenuPermissionRoute

Mount order in `App.tsx`: `PersistQueryClientProvider` → `AuthProvider` → `OrganizationProvider` → `WindowTabsProvider` → routes → `OrgLayout` → (index) `ProtectedRoute` → `MobileOrgIndexRedirect` → `MenuPermissionRoute` → `Layout` → `Suspense` → `Index`.

Tab-cache (sibling tree under `OrgLayout`) can mount `Index` **without** `MenuPermissionRoute`.

### 4.1 `AuthContext`

`user` comes from `getSession()` (often **IndexedDB/local**, not Network) then `onAuthStateChange`. No unmet effect dependency found that would skip setting `user` forever on a later tick: `getSession` completion and the listener both call `setUser` / `setLoading(false)`. A **hung `getSession()`** would mean empty Network and a splash in `ProtectedRoute` / `OrgLayout`, **not** the OrgLayout 4s log. Does not match AAMAN console.

### 4.2 `OrganizationContext` — asked to inspect for a dead dependency chain

Effect:

```81:91:src/contexts/OrganizationContext.tsx
  useEffect(() => {
    if (!user) {
      setCurrentOrganization(null);
      setOrganizations([]);
      setOrganizationRole(null);
      setLoading(false);
      setHasResolvedOrganizations(false);
      return;
    }
    fetchOrganizations();
  }, [user?.id]);
```

Findings:

| Check | Result |
| --- | --- |
| Fetch never scheduled because `user` is missing on first mount | First run with `user == null` sets `loading=false` and returns. When `user.id` appears, effect **does** re-run. Not a one-shot missed latch. |
| `fetchOrganizations` omitted from effect deps | Stale **callback** identity only. Trigger is `user?.id`. Not a permanent skip once id exists. |
| `fetchingRef.current` early return | If a fetch is in flight, a second call **returns with no state update**. No `useEffect` cleanup resets the ref. StrictMode double-invoke: first call starts the fetch; second is a no-op. Harmless if the first `finally` runs. If the first `await` never returned, `loading` would stay true — **OrgLayout would still be on org splash**, contradicting the 4s Outlet log. |
| Cache seed vs `orgLoading` | Seed sets `currentOrganization` but **keeps `loading=true`**. `OrgLayout` still splash-gates on `orgLoading`. Irrelevant once the 4s log has fired (`orgLoading` already false). |
| `ensureFreshSession` / membership `await` | Would show as **pending** HTTP (refresh or REST) if stuck there. Recording: no pending rows in the remainder. |

**No concrete “this dependency never becomes true” break** in `OrganizationContext` that explains AAMAN’s console + empty remainder Network.

The 20s org timeout log was **not** in the recorded console. Do not treat org-fetch timeout as this incident.

### 4.3 `useUserPermissions`

```24:31:src/hooks/useUserPermissions.tsx
  const { data: permissions = null, isLoading } = useQuery({
    queryKey: ["user_permissions", userId, orgId],
    enabled: !!userId && !!orgId,
    refetchOnMount: false,
    ...
  });
```

TanStack Query **v5** (`package.json`): `isLoading === isPending && isFetching`. A stuck permissions spinner in `MenuPermissionRoute` (`orgLoading \|\| permissionsLoading`) **requires `isFetching`**, which is a **network (or at least a fetch) row**. Persist only dehydrates **`status === "success"`** queries (`App.tsx`). A restored permissions row should **not** sit in fetching forever.

`enabled: false` (no `orgId`): `isFetching` is false → `isLoading` is false → `MenuPermissionRoute` should **not** wait. Fail-open at 12s would also show a Reload **card**, not an endless spinner (unless the user reloaded sooner).

**No concrete “permissions query never enables” loop** found. Field-sales `queryFn` already had `user.id` and `organization.id`, so `enabled` for permissions would have been true in the same provider tree.

### 4.4 Why reload always works

Reload is a **new JS realm**: new module map, new React Query client, new `fetchingRef`, new `lazyCache`. That is consistent with a **client initialization / hung Promise / Suspense** problem, not with “AAMAN’s API is down.” It does **not** by itself prove a stale-closure in org/permissions; those traces did not yield a closed loop.

---

## 5. Client-side mechanisms that issue **no** HTTP while spinning

These remain possible; none is proven as *the* AAMAN root cause.

1. **`importWithRetry` after chunk-load error** (`chunkLoadRetry.ts`): if `attemptSkewRecoveryReload()` returns true, it `return new Promise(() => {})` — **never settles**. Suspense spins; **no further chunk HTTP** if the browser already holds a dead import(). Reload (context menu) works. **Tension:** field-sales logs need a committed `Index`. Possible if **tab-cache** is stuck on that promise while **Outlet** `Index` committed (two `lazy()` factories, same URL) — or if those logs were from **before** the freeze. Not proven from the recording timestamps.

2. **`resetTabPageChunk` + shared native `import()`** — explained in §3. Matches empty Network; same tension with committed `Index`.

3. **`prefetchPostLoginCriticalPages` waits until `effectiveTabPaneReady`** when `wantsTabCache`. Chicken-and-egg for *prefetch*, but `TabCachedPages` still loads the active path itself. Not sufficient alone.

4. **`onReady={active ? handlePaneReady : undefined}`** in `TabCachedPages` — inactive panes can commit `Index` (hooks run) **without** telling `OrgLayout` the pane is ready. On home, the dashboard pane is the **active** tab-cache path even when the container is `hidden` after Outlet fallback. Unlikely to be the first-open latch unless `activePath` is `__none__` (entry routes), which home is not.

5. **IndexedDB `getSession()` hang** — empty Network, but wrong UI vs 4s Outlet log.

---

## 6. Root-cause hypothesis (after AAMAN)

**A hanging in-flight REST/RPC call is not what holds the remainder of the freeze.** The working hypothesis is a **pure client state / Promise / render-owner** issue: something that should start the next fetch (or resolve Suspense) never does.

**Not established:** a single broken dependency in `OrganizationContext` or `useUserPermissions` that stays false forever on cold PWA mount. Those files were traced; the latches that exist (`fetchingRef`, `orgLoading` vs cache seed) do **not** match this recording’s console.

**Still open (do not guess a ship fix):**

- Why `Index` hooks ran (field sales) but the user still saw spinner, with **no** later `dashboard-stats` / chunk rows. Candidates: overlay/`DashboardSkeleton` vs `PageFallback` vs `MenuPermissionRoute` vs Index placeholders — **need one screenshot of the spinner chrome** (centred `Loader2` vs pulse cards vs Ezzy splash).
- Whether tab-cache and Outlet `Index` are two instances, one committed and one in Suspense.
- Whether `importWithRetry`’s never-resolving promise ran this session (`attemptSkewRecoveryReload`).

KPI `get_erp_dashboard_stats` is still a poor match for the **first** spinner (gated on `metricsLoadRequested`). If Index is committed and permissions are idle, that RPC **should** have appeared on Network; its **absence** in the remainder is consistent with metrics never being requested **or** the UI not being the Index dashboard at all (spinner from a parent). Without a screenshot, do not pick.

---

## 7. `useShopName` 406 — separate, out of scope

`useShopName.tsx` uses `.single()` and ignores `error`. Zero rows → PostgREST 406. Swap to `.maybeSingle()` like the rest of the app. **Do not bundle** into a Dashboard hang fix.

---

## 8. Proposed fix

**None from this continuation.** The AAMAN Network evidence killed “a specific request is stuck.” The org/permissions dependency trace **did not** produce a concrete, testable break that we should ship against.

Next work (still evidence, or a later Phase 1) should be **instrumentation on the stuck frame**, not a speculative rewrite of `fetchOrganizations`:

- `forceOutletFallback`, `effectiveTabPaneReady`, `isTabPageChunkLoaded("")`, `orgLoading`, permissions `isFetching`/`fetchStatus`
- Whether `importWithRetry` returned the never-resolving promise
- One still of the spinner (`data-ezzy-load-shell` vs `Loader2` vs Index cards)

If that points at hung `import()` after `resetTabPageChunk`, a scoped fix would be: **don’t share a poisoned module promise** (new query string on retry, or don’t `resetTabPageChunk` before Outlet’s `Index` is known to be a *different* loader than tab-cache). Only then.

---

## 9. What was verified in repo

- AAMAN recording: empty Network for the remainder of the hang; 4s Outlet log; field-sales `queryFn`; swallowed 406 in `useShopName`.
- `OrganizationContext` / `useUserPermissions` traces: no closed-loop “never fetch” bug matching that recording.
- Dashboard Outlet is **not** App.tsx `lazyWithRetry` (comment at the 4s timer is wrong).
- `importWithRetry` can return a never-settling Promise after skew reload; not proven on AAMAN.
- 15-minute SW banner: not the remainder-hang mechanism.
- No code changes in this Phase 0 continuation.
