# POS open / POS save / Purchase add-to-bill slowness (2026-09-28)

Reported: on client machines (Chrome + installed PWA), sometimes
- POS shows **"Opening POS…"** for a long time,
- **POS bill save** is slow,
- **Purchase Entry**: after filling product details, **add to bill** is slow.

Nothing here could be measured against production (live tenants, no test org), so
causes are ranked from the code paths. Code changes in this branch are limited to
ones that give the same result with fewer database round trips.

---

## 1. "Opening POS…" — the POS code is still downloading

`tabLoadLabels.ts` shows "Opening POS…" only while the POS page **JavaScript chunk**
is loading (Suspense fallback in `TabCachedPages`). It is not a data query.

### Cause A (most likely for "sometimes"): opening a screen right after a deploy

- 18 PRs were merged to `main` on 2026-09-28 alone, and each merge is a production deploy.
- Vercel serves only the **newest** build's `/assets/*.js`. A shop PC still running
  the previous build that opens a screen it has not loaded yet asks for an old chunk
  file name, gets **404**, and then:
  - `importWithRetry` retries 5 times (0.5 s, 1 s, 1.5 s, 2 s waits) → about 5 s+,
  - then `attemptSkewRecoveryReload()` purges caches and **reloads the whole app**.
- The user sees "Opening POS…" → reload → login shell → POS. On slow shop Wi‑Fi this
  takes 10–30 s, and it happens on every PC after every deploy.
- The service worker uses `skipWaiting` + `clientsClaim`, so the new worker takes over
  at once, but the open page keeps running the old build until it reloads.

### Cause B: first open after each deploy downloads the chunk

Since `claude/pwa-no-js-precache` (merged today), JS is no longer precached; each chunk
is cached the first time it is used (`app-js-chunks`, CacheFirst). So after each deploy
the first POS open on each PC downloads the POS chunk once. That is intended (the old
precache re-downloaded ~9 MB on every deploy and starved the open screen), but it
means deploy frequency directly equals "slow first open" frequency.

### What to do (no code needed)

1. **Deploy outside shop hours** (e.g. after 10 pm IST), or batch merges into one
   deploy per day. This removes most of Cause A and B at zero risk.
2. Consider **Vercel Skew Protection** (Project → Settings → Advanced; paid plan). It
   keeps the previous deployment's assets reachable so old pages load old chunks
   instead of 404 + reload. For a plain Vite app it needs the deployment id added to
   asset requests; do this as a separate, tested change.
3. Do **not** shorten the chunk retry loop yet: without skew protection it is also what
   rides out real network blips.

---

## 2. POS bill save

Save path (`POSSales.tsx` → `useSaveSale.saveSale`), each step waits for the previous one:

| # | Step | Round trips |
|---|------|-------------|
| 1 | `validateCartStock` (Mix/F6 path) — one query for all lines | 1 |
| 2 | `ensureFreshSupabaseSession` — network only if the token is about to expire | 0–1 |
| 3 | Bill number RPC (`generate_pos_number_atomic` / custom format) | 1 |
| 4 | `sales` insert | 1 |
| 5 | `sale_items` insert (DB triggers update stock on `product_variants`) | 1 |
| 6 | `apply_pos_credit` (named customer) | 0–1 |
| 7 | `applyRecomputedSalePaymentState` — RPC + read (+ update if different) | 2–3 |
| 8 | Named customer: `fetchInvoicePrintAccountFacets` for the print balance | 1+ |

So a normal bill is about 6–9 sequential round trips. At 100–200 ms each on shop
internet that is 1–2 s; when one step is slow the whole save is slow. Every step here
is a money or stock write that the next step depends on, so none was changed.

The likely "sometimes" factors, in order:

1. **Shop network latency / packet loss** — multiplied by the 6–9 sequential calls.
2. **Row locks on `product_variants`** — the `sale_items` stock trigger waits when
   another counter, or a Purchase Entry save, is updating the same variants.
   Check Supabase → Database → Query Performance for slow `sale_items` inserts /
   `product_variants` updates at the reported times.
3. **Token refresh** at step 2 after a PC was idle for a long time.
4. **Chrome throttling** a PWA window that was in the background (see §4).

Next step if it keeps happening: add an in-memory save timer
(`window.__ezzyPosSaveTiming.print()`, no console output on the hot path, per
`docs/console-perf-protections.md`) so the slow step can be read on the affected PC.

---

## 3. Purchase Entry — add to bill

### 3a. Size grid → add to bill (existing product, generated barcodes) — **changed**

`handleSizeGridConfirm` → `createNewVariantWithBarcode` runs **per size, one size after
another**. Before this change each size did:

1. `findReusableUnusedGeneratedSku` — load leftover zero-stock SKUs of the product,
   plus a purchase/sale history lookup,
2. `recycleOrphanGeneratedSkusOnProduct` — load the **same** SKUs again, the history
   lookup again, then **one UPDATE per leftover SKU**,
3. `generate_next_barcode` RPC, 4. barcode-taken check, 5. insert.

Now steps 1 and 2 are one pass (`reuseOrRecycleGeneratedSkusOnProduct`): one load, one
history lookup, and one batched UPDATE. The result is the same: the same SKU is
reused, and the same leftovers are recycled.

Per size: 5 → 4 round trips with no leftovers; with leftovers
`4 + N` → `2` round trips before the barcode step. A 6-size product saves at least
6 round trips, more for products with leftover SKUs.

### 3b. New product dialog ("fill product details → add to bill") — **changed**

`ProductEntryDialog` re-checked each generated barcode with its own query, one size at
a time. It now checks all sizes in **one** query (`ensureFreshGeneratedBarcodes`) and only
regenerates values that are taken, in the same order as before.

When the barcode series has to skip used numbers (`firstFreeFromAllocated`), it checked
one number per query, up to 200 queries. It now checks 25 numbers per query, in the
same order and with the same limit, so it picks the same free number.

### Not changed (noted for later)

- The size grid still processes sizes one after another. Running sizes in parallel
  would race the leftover-SKU reuse/recycle, so it was left sequential.
- When a product has a leftover SKU for size **B**, recycling during size **A**
  soft-deletes it before size B gets to reuse it, so B burns a new series number. That
  is existing behaviour and was kept exactly; fixing it changes which barcodes users
  see and needs its own review.
- `ProductEntry.tsx` (the full Product Entry page) has the same one-query-per-size
  barcode check; left alone because it was not in the report.

---

## 4. Chrome / PWA settings on shop PCs (no deploy needed)

- **Memory Saver**: Chrome → Settings → Performance → *Always keep these sites active* →
  add the app's domain. Otherwise Chrome may discard an idle PWA; the next click reloads
  it ("Opening POS…" again).
- **Energy Saver**: turn off on desktops, or set it to "only when unplugged" on laptops.
- Keep **one** EzzyERP window/tab per PC; several copies share the same connection limit
  and each one refetches after a deploy.
- Keep Chrome updated and hardware acceleration on (Settings → System).

---

## Verification

- Unit tests updated/added: `src/utils/barcodeCollisionGuard.test.ts`
  (batched lookups; same results as one-at-a-time probing) and
  `src/utils/recycleUnusedGeneratedBarcode.test.ts` (combined reuse + recycle).
- They could **not** be run in the environment where this was written: `npm ci`
  could not reach the private registry that `package-lock.json` points some packages
  at. Run `npm test -- src/utils/barcodeCollisionGuard.test.ts src/utils/recycleUnusedGeneratedBarcode.test.ts`
  and `npm run build` before merging.
- No database migration, no edge function, no change to money, stock, or POS save code.
