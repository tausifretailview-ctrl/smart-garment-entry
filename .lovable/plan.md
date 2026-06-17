
## Part A — Fix build error (1 line)

`src/components/accounts/SupplierPaymentTab.tsx` line 295 calls `ensureStringKeyMap(map)` without a generic, so TS infers `Map<string, unknown>`, which then fails to pass into `sumSupplierBillNetPayable(...)` on line 303.

Change:
```ts
return ensureStringKeyMap(map);
```
to:
```ts
return ensureStringKeyMap<SupplierBillOutstandingBreakdown>(map);
```

That's the only edit. No behaviour change.

---

## Part B — Kids Zone bulk-delete diagnosis (why "0 deleted")

Verified in DB — selected bills are still **alive** (`deleted_at IS NULL`):

| Bill | Items | Total Qty | Status |
|---|---|---|---|
| PUR/26-27/1  | 3,490 lines | 3,720 | Safe to delete (0 variants short) |
| PUR/26-27/8  | 1,855 lines | 3,929 | **BLOCKED** — 5 variants already sold |
| PUR/26-27/10 | 5,072 lines | 5,093 | Safe to delete |
| PUR/26-27/14 | 4,151 lines | 4,455 | Safe to delete |

The "0 deleted" is **not** a size/quantity issue. It's the negative-stock guard inside `soft_delete_purchase_bill()`:

> *"Cannot delete: stock would go negative for KIDS WEAR (XS). Current: 0, need to reverse: 3. Delete the sales that consumed this stock first."*

Bill PUR/26-27/8 has 5 SKUs where stock is already 0 but the bill recorded 1–3 units each (sample barcodes `100000000064134`, `…64159`, `…64142`, `…64149`, `…64155` — all "KIDS WEAR / XS"). The trigger refuses to take stock negative, the row's softDelete returns `false`, and because the user selected only bill 8 in the bulk action (or the four-bill toast collapsed), the success toast shows `0 moved to recycle bin`.

The other three (1, 10, 14) would actually succeed if selected alone. The current bulk-delete loop already aborts the per-bill RPC on error and shows a destructive toast per failure plus one "0 / N succeeded" success toast — that's the "0 deleted" the user sees.

### Recommended path (needs user choice — no code changes until decided)

**Option 1 — Force delete of PUR/26-27/8 by clamping at zero** (one-time data fix)
   Run a one-off admin operation: ignore the negative-stock guard for this bill, reverse only what's available (clamp `stock_qty` at 0 for those 5 SKUs), mark the bill deleted. Cleanest for opening-stock re-imports.

**Option 2 — Delete bills 1, 10, 14 now and leave 8 for later**
   User selects only those three and re-runs bulk delete; they'll succeed (4,000+ line set-based RPC runs in seconds).

**Option 3 — Improve the bulk-delete UX (small code change)**
   Show a clearer toast: *"3 of 4 deleted. PUR/26-27/8 blocked — 5 SKUs already sold (KIDS WEAR XS …)."* — list per-bill failure reasons instead of a single generic toast. Independent of the data fix.

Tell me which (1, 2, 3, or any combination) and I'll prepare the implementation plan.
