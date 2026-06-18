## What I already verified in Mulund Mobility's data

- **No duplicate `sale_number`s** in the whole `sales` table for this org.
- **No soft-deleted and no cancelled sales** today or recent history (the bill the user thinks was "deleted" is actually still present in the database).
- **POS number generation is concurrency-safe.** Mulund Mobility has no custom POS format, so the system uses `generate_pos_number_atomic`, which:
  - Increments `bill_number_sequences` atomically via `INSERT … ON CONFLICT (organization_id, series) DO UPDATE SET last_number = last_number + 1 RETURNING last_number`.
  - Self-heals to `MAX(sale_number) + 1` if the sequence ever falls behind.
  - Result: two simultaneous saves from two devices cannot get the same number, and one save cannot overwrite the other's row (each save inserts a brand new `sales` row keyed by its own UUID + unique `sale_number`).
- **Edit-mode save (`useSaveSale`)** is scoped strictly by `sale_id` — it deletes and re-inserts only `sale_items WHERE sale_id = X`, then updates `sales WHERE id = X`. It cannot touch another user's in-flight new bill.

## What the specific example actually shows

The bill the user said "disappeared" — **POS/26-27/1576** — is **still in the database**, not deleted:

| Field | Value |
|---|---|
| `sale_number` | POS/26-27/1576 |
| `customer_name` | MOHAMMAD TABREJ SHAIKH (₹3,500) |
| `created_at` | 17-Jun 15:11:54 |
| `updated_at` | 17-Jun **15:37:54** (edited 26 min after creation) |
| `created_by` | user `5cda0a08…` (same user both times) |
| `deleted_at` | null |

Sangita Kale's bills for the same period are **POS/26-27/1577** (₹2,000, 17-Jun 15:14) and **POS/26-27/1584** (₹82,900, 18-Jun 09:47) — both intact, both created by the same user.

So in this case the bill wasn't deleted by another user — bill 1576 was **edited** (customer field overwritten) 26 minutes after creation by the same login. That looks more like an accidental "Modify" on the wrong bill than a multi-user race. I want to confirm this before changing code.

## Plan

### Step 1 — Confirm with the user what they actually saw

Ask once whether:
- They (or whoever they meant by "Sangita Kale's bill on 1576") saw POS/26-27/1576 in the dashboard yesterday with "Sangita Kale" as the customer, then later saw it as "Mohammad Tabrej Shaikh", or
- They simply never saw bill 1576 belonging to Sangita Kale and were expecting that number based on memory.

(This question goes out in chat, not in the plan.)

### Step 2 — Forensic check on bill 1576 and its neighbours

Read-only SQL — no data changes:
- Pull `audit_logs`, `customer_ledger_entries`, `journal_entries`/`journal_lines` for bill 1576, and the `sale_items` rows with their `created_at`. Map the timeline of every change to that bill.
- Pull all sales created between 15:00 and 16:00 on 17-Jun by both users with `created_at` / `updated_at` / payment method, to see if any two-user interleaving could have caused the customer name to flip.
- Compare original print/WhatsApp logs (`whatsapp_logs`) for 1576 if any — they'd show the customer name at the moment of the original send.

This is enough to prove whether 1576 was "deleted" or just "edited".

### Step 3 — Static review of the multi-user save path

Read the code paths that two-user POS billing depends on, and document concrete risks:
- `src/hooks/useSaveSale.tsx` (new-sale insert + edit-mode update).
- `src/utils/saleNumber.ts` + RPCs `generate_pos_number_atomic`, `generate_custom_pos_number`, `generate_sale_number_atomic`.
- `src/lib/posCartPersistence.ts` (POS cart is keyed by `pos_cart_${orgId}` in `sessionStorage`, scoped per tab — confirmed safe across devices, but two tabs on the same device share `localStorage` clean-up on cold open).
- POS dashboard query / realtime invalidation (`useDashboardInvalidation`) — to ensure both terminals refresh when the other saves, so a bill doesn't *appear* to be missing just because the list is stale.

The output of this step is a short written report (`docs/mulund-multi-user-pos-audit-2026-06-18.md`) listing:
- What is already safe (number generator, per-row locks, edit-mode scoping).
- Any minor gaps found (e.g. `pos_cart_${orgId}` is not keyed by user; dashboard list may need realtime refresh after another user saves; "Modify" button on dashboard should re-fetch the row before opening so a stale row can't be edited from cached state).

### Step 4 — Code fixes, only if Step 2/3 prove a real bug

Likely candidates if needed (each kept tiny and frontend-only unless a backend bug is proven):
- Add a "stale row guard" before opening Modify: re-fetch `sales` by id and warn if `updated_at` changed since the dashboard loaded the row.
- Add a small confirmation when the customer field is changed during edit-mode of a saved POS bill.
- Force a dashboard refetch (or realtime subscription) on `sales INSERT/UPDATE` so a second terminal's new bill shows up instantly.

No backend / RLS / number-generator changes are planned unless Step 2 produces evidence that the structure is unsafe — current evidence says it is safe.

### Step 5 — Hand the audit report back to the user

A one-page summary in plain language: "Numbers cannot collide, bills cannot overwrite each other across two devices, here is what actually happened to 1576, and here is the small UX fix we made (if any)." No accounting numbers are touched.

## Technical detail (for reference)

- `generate_pos_number_atomic` uses `bill_number_sequences (organization_id, series)` with `ON CONFLICT DO UPDATE … RETURNING` → race-safe.
- `generate_custom_pos_number` uses `pg_advisory_xact_lock(hashtext(org||':pos'))` + duplicate-check loop → race-safe but only relevant if the org sets a custom format (Mulund doesn't).
- `useSaveSale` edit-mode: `DELETE FROM sale_items WHERE sale_id = $1` then bulk insert; scoped by `sale_id`, cannot touch another bill.
- POS cart storage: `sessionStorage["pos_cart_<orgId>"]`, tab-isolated, device-isolated — two physical devices never share a cart.
