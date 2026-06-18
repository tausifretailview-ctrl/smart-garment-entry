# Mulund Mobility — Multi-user POS billing audit

Date: 18-Jun-2026
Organization: MULUND MOBILITY (`697c451a-f863-4fe4-82f3-31859a9e5251`)
Trigger: User report that "when 2 users bill in POS at the same time, one invoice gets deleted".

## Verdict

The two-user POS billing **structure is safe**. No invoice was deleted, no sale number collided, no concurrent save overwrote another. What actually happened in the example bill (POS/26-27/1576) was that **user B opened an existing bill created by user A and saved it after replacing its customer and amount** — i.e. an accidental **Modify on the wrong invoice**, not a concurrency bug.

## Evidence

### 1. No duplicate sale numbers, no deletions

```sql
-- duplicates
SELECT sale_number, count(*) FROM sales
WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251'
GROUP BY sale_number HAVING count(*) > 1;
-- → 0 rows

-- soft-deleted
SELECT count(*) FROM sales
WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251'
  AND deleted_at IS NOT NULL;
-- → 0 rows
```

### 2. POS number generator is concurrency-safe

Mulund has no custom POS format, so saves call `generate_pos_number_atomic`, which:

- Uses `INSERT INTO bill_number_sequences … ON CONFLICT (organization_id, series) DO UPDATE SET last_number = last_number + 1 RETURNING last_number` — a single atomic upsert.
- Then self-heals: if the returned number is ≤ `MAX(sale_number)` of the org for that series, it jumps to `MAX + 1` and persists.

Two simultaneous saves from two devices therefore receive two **different** numbers; each inserts a brand-new `sales` row keyed by its own UUID. One save cannot overwrite the other.

### 3. Edit-mode save is scoped strictly by `sale_id`

`src/hooks/useSaveSale.tsx` edit branch:

```
DELETE FROM sale_items WHERE sale_id = $1
INSERT INTO sale_items (…)              -- new lines
UPDATE sales SET … WHERE id = $1
```

All writes are scoped by primary key. No path can touch another bill.

### 4. What really happened to POS/26-27/1576

```
entity_id: 91a05796-b889-4c7b-93fd-dfb160b8f89b
action:    SALE_UPDATED
at:        17-Jun-2026 15:37:51 IST
by:        mobility@gmail.com    (user eeb080f0)
old_values.net_amount: 82,900
new_values.net_amount:  3,500
```

Bill 1576 was originally **created** at 15:11:54 IST by `mobilitynx@gmail.com` (`5cda0a08…`) for **SANGITA KALE ₹82,900**.
At 15:37:51 IST a different user, `mobility@gmail.com` (`eeb080f0…`), opened it via Modify and saved it as **MOHAMMAD TABREJ SHAIKH ₹3,500**.

Sangita Kale's ₹82,900 bill was then re-entered the next morning as POS/26-27/1584 (18-Jun 09:47).

This is the only "vanished" bill in the recent window. The wider `audit_logs` shows `mobility@gmail.com` has edited several bills originally created by `mobilitynx@gmail.com` (POS/26-27/985, /1212, /1390, /1553, /1576). Most edits kept the amount unchanged (likely payment-method fixes); only 1576 shows a destructive content change.

## What is already safe

| Concern | Mechanism | Status |
| --- | --- | --- |
| Two devices getting the same POS number | `bill_number_sequences` upsert + self-heal | OK |
| Two devices overwriting the same row | Each save inserts a new UUID row | OK |
| Edit mode touching another bill | `WHERE sale_id = …` everywhere | OK |
| POS cart leaking across devices | `pos_cart_${orgId}` stored in `sessionStorage`, tab- and device-isolated | OK |
| Custom format race | `generate_custom_pos_number` uses `pg_advisory_xact_lock` (not used by Mulund anyway) | OK |

## Gap that caused the user-visible issue

The system permits any user with **Modify** permission to open any saved POS bill and replace its customer / line items / amount, with no warning, even when the change is destructive. On a busy counter where two terminals are creating bills seconds apart, a stale dashboard row clicked by mistake is enough to overwrite a coworker's just-saved invoice — exactly what happened to 1576.

## Fix applied

`src/hooks/useSaveSale.tsx` — edit-mode branch now reads the existing bill's `customer_id`, `customer_name`, and `net_amount`, and surfaces a `window.confirm(...)` before saving when **either**:

1. The customer is being **changed** (different `customer_id` or different `customer_name`), or
2. The net amount changes by **more than 50%**.

The dialog names the bill number, shows old → new values, and asks the user to confirm before overwriting. Routine edits (payment method, small price tweaks) are unaffected.

No backend / RLS / number-generator changes were made — current evidence shows the structure is sound.

## Recommended follow-ups (not done yet)

- Tighten the **Modify** permission so that only specific users can edit bills they did not create (use `created_by` check in `user_permissions` UI). Today both users have Modify on every bill.
- Add a realtime subscription on `sales INSERT/UPDATE` so the POS dashboard auto-refreshes on a second terminal as soon as the first terminal saves, removing the stale-row foot-gun at its source.
- Show the **bill creator's name** in the POS dashboard row, so a different user sees clearly "this bill belongs to someone else" before clicking Modify.

These three together would harden multi-user POS billing to a Tally / Vyapar–grade safety level.

## Second confirmed incident — POS/26-27/1101 (30-May-2026)

User shared a printed copy of **POS/26-27/1101, TEJAS SURESH CHAVAN ₹20,500, 30-05-2026** that no longer appears in the POS dashboard. Same complaint as 1576.

### Database evidence

- `sales` table has **no row** with `sale_number = 'POS/26-27/1101'` for this org — the row was eventually hard-deleted (likely from Recycle Bin after the overwrite).
- `audit_logs` for entity `8ddb711e-61c3-404c-8084-3546c9b5283c` (the original 1101):

```
30-May 08:39:01 IST  SALE_UPDATED  mobility@gmail.com
  old: { sale_number: POS/26-27/1101, net_amount:  20,500 }
  new: { sale_number: POS/26-27/1101, net_amount: 109,999 }

30-May 11:31:18 IST  SALE_UPDATED  mobility@gmail.com
  old: { sale_number: POS/26-27/1101, net_amount: 109,999 }
  new: { sale_number: POS/26-27/1101, net_amount: 109,999 }
```

- Three minutes after the destructive edit, the same user created **POS/26-27/1102 — RAKESH TAMBE ₹1,09,999** (30-May 08:42:15 IST). 1101's content was effectively the Rakesh Tambe bill pasted over Tejas Chavan.
- TEJAS SURESH CHAVAN's ₹20,500 invoice was later re-entered as **POS/26-27/1541** on 16-Jun 10:41 IST. That row itself shows a follow-up `SALE_UPDATED` at 10:55 IST changing `net_amount 23,999 → 20,500` — same Modify-on-wrong-bill foot-gun, this time noticed and corrected within 15 minutes.

### Root cause

Identical to POS/26-27/1576: a user with Modify permission opened the wrong row from the POS dashboard (likely a stale list while another terminal was billing) and saved over it. **No concurrency bug, no number-collision, no RLS bug.** Two independent occurrences (1101 and 1576) plus a near-miss (1541) confirm the pattern.

## Why this won't happen again (fix already shipped 18-Jun)

`src/hooks/useSaveSale.tsx` edit-mode now reads the bill's existing `customer_id`, `customer_name`, and `net_amount` before saving and shows a blocking `window.confirm(...)` whenever:

1. The customer is being changed (different `customer_id` or different `customer_name`), or
2. The net amount changes by more than 50 %.

Both 1101 (₹20,500 → ₹1,09,999, +437 %) and 1576 (₹82,900 → ₹3,500, –96 %) would have been blocked by this dialog. Routine edits (payment-method change, small price tweak) are unaffected.

## Open follow-ups to fully harden multi-user POS

1. **Creator-scoped Modify permission** — restrict Modify on saved POS bills to the original creator, or gate cross-user edits behind an explicit "Edit others' bills" right under User Rights. Today both `mobility@gmail.com` and `mobilitynx@gmail.com` can edit every bill.
2. **Realtime POS dashboard** — subscribe to `sales` INSERT / UPDATE for the current org so the second terminal's list refreshes instantly, removing the stale-row foot-gun at its source.
3. **Show bill creator on the dashboard row** — make it visually obvious that a row belongs to a coworker before someone clicks Modify.