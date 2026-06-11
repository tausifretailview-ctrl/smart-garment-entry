## Diagnosis

**Excel file (`file 4d.xlsx`)** has **1136 valid product rows** with **1798 total qty** and **all unique barcodes**.

**Database (bill `PUR/26-27/16` in Kids Zone)** contains only **600 line items, 917 qty**.

I dumped the imported barcodes and compared to the Excel:

```text
Imported rows: Excel rows 2 – 601   (exactly first 600)
Dropped rows : Excel rows 602 – 1142 (last 536)
```

The cutoff is exactly **3 × `VARIANT_BATCH_SIZE` (200) = 600**, which matches the variant‑insert batch loop in `src/pages/PurchaseEntry.tsx` (`handleExcelImport`). After the 3rd batch the loop stopped contributing to `insertedVariantMap`, so `buildLineItemsFromMap()` produced 600 line items and `setLineItems` saved a 600‑row bill.

Root cause hypothesis: somewhere between batch 3 and batch 4 the loop received either
- an unhandled rejection from `persistEntrySnapshotNow()` (called every batch with a growing snapshot — by batch 3 the JSON is ~2 MB and writes to sessionStorage/localStorage/IndexedDB/DB stub), or
- a network/timeout error from `supabase.from('product_variants').insert(...).select('id')` whose `batchErr` path didn't propagate cleanly.

Either way, the loop has **no try/catch around individual batches**, so a single thrown error skips every remaining batch *silently* and the bill is saved truncated.

The screenshot's "Showing 400 rows – scroll to load more / Large bill: 600 items" is normal virtualization (`visibleItemCount=200/400`) — that part is *not* a bug.

## Fix

### 1. Harden `handleExcelImport` in `src/pages/PurchaseEntry.tsx`

- Wrap each variant‑insert batch (line 4305 loop) in `try/catch` so a thrown error never short‑circuits the remaining batches.
- Wrap the per‑batch `await persistEntrySnapshotNow(...)` in `try/catch`; checkpointing must never abort the import.
- After every batch, log `console.info` with `{ batchIndex, batchSize, insertedSoFar, errorsSoFar }`.
- Collect failed row indices into a `failedRows: number[]` array; show them in the completion toast and `console.warn` the full list so the user can re‑import only the missing rows.
- Replace the "Import Partially Completed" toast with an explicit count: `Imported X of Y — Z rows failed (see console for row numbers)`.

### 2. Backfill the affected bill (`PUR/26-27/16`)

Re‑run the import for only the missing 536 rows (Excel rows 602–1142) into the existing bill `81ba1cd0-2c30-4b1c-8faa-62b7082a7c2a`:

- Create products / variants for the missing barcodes (all unique, none in DB).
- Insert the corresponding `purchase_items` linked to that bill.
- Update `purchase_bills.total_qty`, `gross_amount`, `net_amount` to reflect the new totals.

Run as a one‑off Node script inside the project using the same logic from `handleExcelImport`, so the result is consistent with a fresh import. I'll generate the script, dry‑run it, then execute.

### 3. SR No / "product loading" issue in Edit mode

The Edit screen shows "Showing 400 rows – scroll to load more" with SR numbers 328…336 visible. SR No is purely a render‑time index of `lineItems`; it isn't stored. The number sequence is correct (328…336 means rows 328+ in the virtualized window). The "loading" perception on first paint is due to lazy product enrichment after `fetchPurchaseItemsByBillId`. I'll add:

- a stable, persistent SR No column (`index + 1` over the full `lineItems` array, not over the visible window) so SR No is always continuous from 1, including for rows added during edit.
- a lightweight per‑row skeleton placeholder so half‑loaded rows show "Loading product…" instead of an empty cell.

### Technical details

- File: `src/pages/PurchaseEntry.tsx`
  - `handleExcelImport` lines ~4305–4345: add `try/catch` around each batch and around `persistEntrySnapshotNow`; collect `failedRows`.
  - Toast/console message updated.
  - Edit‑mode SR No: ensure the table renders `lineItems.indexOf(row) + 1` not the windowed index.
- Backfill: standalone script `scripts/backfill-kidszone-pur-26-27-16.mjs` that reads `/mnt/user-uploads/file_4d.xlsx`, computes the 536 missing rows, and inserts products/variants/purchase_items + updates bill totals. Run once via `psql`‑equivalent migration `insert` calls (or service‑role edge run).
- No schema migration required.

### Out of scope

- Re‑architecting the variant insert pipeline. The hardening above is enough to surface and recover from the failure; we can revisit batching strategy if the new diagnostics reveal a systematic cause.
