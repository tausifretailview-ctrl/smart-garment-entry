# Tier 1 duplicate-receipt repair — five hand-checks (for review before any write)

**Status: NOT EXECUTED.** Dry-run + rehearsal script written; the actual soft-delete waits
for an explicit go-ahead after these five checks are read with a clear head. Nothing in this
document is summarised — every number below is the live row from the 22:25 IST dry-run v2
paste (`docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv`). Timestamps IST.

Script: `scripts/ssot-tier1-dup-double-submit-repair-2026-09-19.sql` (Block A dry-run,
Block B rehearse/execute, Block C digest). Set locked in `test/money/ssotTier1RepairSet.test.ts`.

## The set — 11 rows / 10 customers / ₹62,916

Every row: `DUP_DOUBLE_SUBMIT`, `tender = 0` on the bill, `remaining_before ≤ 0` when the
row was written, same amount (±1) as an earlier live receipt on the same bill, customer READY
in the v2 dry-run with no `DUP_TENDER_REKEYED` leg, customer `REPAIR_SUFFICIENT_SNAP` in the
v3 full scan (no SNAP drop on any bill after repair).

| # | Customer | Bill | Net due | Keep (earlier) | Delete (echo) | ₹ | Gap | Paid live → after |
|---|---|---|---:|---|---|---:|---|---|
| 1 | `8538501f` JATIN BHAI KENYA (Velvet) | POS/26-27/808 | 13,699.90 | RCP/26-27/20#da15b3b8d · 13 May 12:05 · card | **RCP/26-27/1131** · 30 May 17:04 · card | 13,700 | 17 d (batch) | 13,699.90 → 13,699.90 |
| 2 | `71b043b8` RUCHI (Velvet) | POS/26-27/1116 | 5,570 | RCP/26-27/1104 · 27 May 15:28 · upi (sale day) | **RCP/26-27/1133** · 30 May 17:06 · upi | 5,570 | 3 d (batch) | 5,570 → 5,570 |
| 3 | `71b043b8` RUCHI (Velvet) | POS/26-27/292 | 570 | RCP/26-27/8#da922b887 · 28 Apr 22:29 | **RCP/26-27/1141** · 30 May 17:09 · cash | 570 | 32 d (batch) | 570 → 570 |
| 4 | `ae7d0c17` SAYALI MADAM (Velvet) | POS/26-27/610 | 2,299 | RCP/26-27/10#d2ad9f600 · 1 May 12:30 | **RCP/26-27/1135** · 30 May 17:07 · cash | 2,299 | 29 d (batch) | 2,299 → 2,299 |
| 5 | `1ad6cd52` REKHA SANCHETI (Velvet) | POS/26-27/416 | 2,000 | RCP/26-27/6#dedfea962 · 25 Apr 21:33 | **RCP/26-27/1137** · 30 May 17:08 · cash | 2,000 | 35 d (batch) | 2,000 → 2,000 |
| 6 | `c25acad2` SURESH (Velvet) | POS/26-27/378 | 1,977 | BCK/dcf49184/13df2d · vdate 19 Apr (Phase-4 backfill, written 12 May 01:54) · cash | **RCP/26-27/1142** · 30 May 17:10 · cash | 1,977 | 41 d (batch) | 1,977 → 1,977 |
| 7 | `721fd1c2` NIKKI PATEL (Velvet) | POS/26-27/558 | 3,300 | RCP/26-27/9#dfab7999b · 29 Apr 16:58 | **RCP/26-27/1143** · 30 May 17:10 · cash | 3,300 | 31 d (batch) | 3,300 → 3,300 |
| 8 | `2fcbb26b` (ELLA NOOR a/c) | INV/26-27/1089 | 5,250 | RCP/26-27/2442 · 1 Jul 21:13 · upi | **RCP/26-27/2442#d791657cc** · 1 Jul 21:13 · upi | 5,250 | same minute, same number | 5,250 → 5,250 |
| 9 | `933ba20a` (SHEZA AMANI a/c) | INV/26-27/1117 | 3,150 | RCP/26-27/2858 · 14 Jul 17:17 · upi (vdate 13 Jul) | **RCP/26-27/2859** · 14 Jul 17:17 · upi (vdate 13 Jul) | 3,150 | same minute | 3,150 → 3,150 |
| 10 | `526460c5` | INV/26-27/1621 | 250 | RCP/26-27/1836 · 16 Jun 20:37 · cash (sale day) | **RCP/26-27/1838** · 16 Jun 20:38 · cash | 250 | 1 min | 250 → 250 |
| 11 | `fd857b39` | INV/25-26/821 | 24,850 | RCP/25-26/936 · 7 Mar 22:13 (sale day) | **RCP/25-26/937** · 7 Mar 22:28 | 24,850 | 15 min | 24,850 → 24,850 |

Sum of the Delete column: 13,700 + 5,570 + 570 + 2,299 + 2,000 + 1,977 + 3,300 + 5,250 +
3,150 + 250 + 24,850 = **62,916**. Distinct customers: 10 (RUCHI has two bills).

`paid_amount` is already capped at net on every bill (`payment_status = completed`), so the
`trg_sync_sale_payment_status_from_receipts` recompute after the soft-delete must leave
`paid_amount` **unchanged** on all 11. That is asserted in Block B's post-guard; a change
rolls the whole thing back.

Seven of the eleven (rows 1–7) are the Velvet **30 May 17:04–17:10 IST burst** (RCP/1131–1145,
one bill every 15–20 s, POS Dashboard "Record Payment", all `remaining_before = 0`). The
other eight rows of that burst are accounted for elsewhere, not dropped: 1132 HEENA (Tier 2,
customer-atomic), 1134/1136/1138/1140 ANANYA (HOLD via bill 1787), 1139 walk-in POS/85
(WALK_IN_NO_CUSTOMER), 1144 DOLLY and 1145 DIYA (Group A, bucket (g)).

## The five named hand-checks

### 1. INV/26-27/1089 — same voucher number written twice (`2fcbb26b`, ELLA NOOR)

| | Keep | Delete |
|---|---|---|
| voucher_number | `RCP/26-27/2442` | `RCP/26-27/2442#d791657cc` |
| created_at (IST) | 2026-07-01 21:13 | 2026-07-01 21:13 |
| voucher_date | 2026-07-01 | 2026-07-01 |
| amount / method | 5,250 · upi | 5,250 · upi |
| description | `Payment received for invoice INV/26-27/1089 \| Received in: ELLANOOR A/C` | identical |
| remaining_before | 5,250 | **0** |
| id | `9a3ffbe6-8627-4a51-885a-22ef33786165` | `791657cc-d8b9-465f-a226-604883de9f86` |

Bill: sale 26 May, net 5,250, tender 0, live receipts 10,500 (= 2 × net), paid 5,250.
The `#d791657cc` suffix is the collision rename the unique-voucher-number fix applies when a
second row arrives with a number already taken — the app allocated **the same** RCP number
twice in one minute. That is a single-click/double-submit signature, not a re-key. Deleting
`#d791657cc` leaves 5,250 = net. No receipt with a "clean" number disappears from the
customer's hands: the printed receipt is RCP/26-27/2442, which stays.

### 2. INV/25-26/821 — the largest row, 15 minutes apart (`fd857b39`)

| | Keep | Delete |
|---|---|---|
| voucher_number | `RCP/25-26/936` | `RCP/25-26/937` |
| created_at (IST) | 2026-03-07 22:13 | 2026-03-07 22:28 |
| voucher_date | 2026-03-07 (sale day) | 2026-03-07 |
| amount / method | 24,850 · (blank) | 24,850 · (blank) |
| description | `Payment received for invoice INV/25-26/821` | identical |
| remaining_before | 24,850 | **0** |
| id | `5c37ba4f-da41-4fd1-abd0-a8dda11ac241` | `9a59ec53-932b-4fc9-8ffe-9894ae5dc6dd` |

Bill: sale 7 Mar 2026, net 24,850, tender 0, live receipts 49,700, paid 24,850.
This is the one to look at hardest: **15 minutes** is not a double-click, it is a second
save of the same payment on the same evening (two consecutive voucher numbers, 936 → 937,
nothing between them on this bill). Same amount to the rupee, same bill, same day, bill
already at zero after 936. The alternative reading — that the customer paid ₹49,700 on a
₹24,850 invoice and is owed ₹24,850 — has no support: no refund, no advance, no CN, and
`paid_amount` never rose above net. If 937 is the copy the customer holds, the printed
receipt still says ₹24,850 against INV/25-26/821, which remains fully paid; nothing they
were told changes. Keep the earlier leg (936), delete the later echo (937).

### 3. POS/26-27/808 — 30 May batch, card, 10-paise rounding (`8538501f` JATIN BHAI KENYA, Velvet)

| | Keep | Delete |
|---|---|---|
| voucher_number | `RCP/26-27/20#da15b3b8d` | `RCP/26-27/1131` |
| created_at (IST) | 2026-05-13 12:05 | 2026-05-30 17:04 |
| voucher_date | 2026-05-13 | 2026-05-30 |
| amount / method | 13,700 · card | 13,700 · card |
| description | `Payment received for POS sale POS/26-27/808 - ` | identical |
| remaining_before | 13,699.90 | **−0.10** |
| id | `a15b3b8d-7b39-4dfc-bb39-3a95b261ac95` | `528c1293-6fad-454c-99ed-cf5a718552df` |

Bill: sale 10 May, net **13,699.90**, tender 0, live receipts 27,400, paid 13,699.90.
The keep leg already over-covers the bill by ₹0.10 (card charged a round 13,700). After
the delete: receipts 13,700 vs net 13,699.90 → over by ₹0.10, inside the 0.5 tolerance;
`paid_amount` stays 13,699.90. 1131 is the **first** row of the Velvet 17:04–17:10 burst.

### 4. INV/26-27/1621 — ₹250, one minute apart, sale day (`526460c5`)

| | Keep | Delete |
|---|---|---|
| voucher_number | `RCP/26-27/1836` | `RCP/26-27/1838` |
| created_at (IST) | 2026-06-16 20:37 | 2026-06-16 20:38 |
| voucher_date | 2026-06-16 (sale day) | 2026-06-16 |
| amount / method | 250 · cash | 250 · cash |
| description | `Payment received for invoice INV/26-27/1621` | identical |
| remaining_before | 250 | **0** |
| id | `2536816b-7e8b-41de-b1e9-0f5f7c58d462` | `66e65c3a-2057-4eec-95f5-9360275e0452` |

Bill: sale 16 Jun, net 250, tender 0, live receipts 500, paid 250. The intervening number
(1837) is not on this bill (only 1836 and 1838 are) — 1838 is a re-save one minute later
with its own fresh number, not a collision rename. Smallest row in the set; same shape as
#1 without the suffix.

### 5. `71b043b8` RUCHI — two bills on one customer, both in the batch (Velvet)

| | POS/26-27/1116 keep | POS/26-27/1116 delete | POS/26-27/292 keep | POS/26-27/292 delete |
|---|---|---|---|---|
| voucher_number | `RCP/26-27/1104` | `RCP/26-27/1133` | `RCP/26-27/8#da922b887` | `RCP/26-27/1141` |
| created_at (IST) | 27 May 15:28 | 30 May 17:06 | 28 Apr 22:29 | 30 May 17:09 |
| voucher_date | 27 May (sale day) | 30 May | 28 Apr | 30 May |
| amount / method | 5,570 · upi | 5,570 · upi | 570 · (blank) | 570 · cash |
| remaining_before | 5,570 | **0** | 570 | **0** |
| id | `f491f4ca-…` | `02284321-f364-470e-922e-76f516de515d` | `a922b887-…` | `bda7d2cc-f371-489b-92f2-6475a42f268d` |

POS/1116: sale 27 May, net 5,570, tender 0 — the sale-day UPI receipt 1104 **is** the
counter payment (tender was not written on the sale row). POS/292: sale 14 Apr, net 570,
paid 28 Apr. Both re-keyed three minutes apart inside the 30 May burst. Customer-atomic:
both rows go together or neither; after the delete each bill's receipts equal its net
(5,570 / 570) and RUCHI's customer balance drops by ₹6,140 of phantom credit. No other
bill on her account is in any scan population.

## Things the reviewer should know that are NOT in scope of this mutate

- **SAYALI MADAM (`ae7d0c17`) has a sibling, POS/26-27/774**: tender 3,298 on a net due of
  1,503 (`paid_amount` 3,298), no receipts — a `TENDER_ONLY_OVER` of ₹1,795. It is in the
  parked 365 tender-only set, not this repair. After row 4 is deleted, her invoice 610 is
  clean but her customer-level credit is still ₹1,795 too high from 774. Deleting 1135 is
  still correct; it just does not make her account whole on its own.
- **SURESH (`c25acad2`)**: the keep leg is a `BCK/…` Phase-4 backfill (voucher_date = sale
  day, written 12 May 01:54) — the system-generated receipt that stands in for the legacy
  POS counter payment. It is the only record of the 19 Apr payment and must stay; 1142 is
  the echo.
- Two ELLA NOOR-account rows (#1, #9) and two unnamed customers (#4, #11) have no customer
  name in the CSV; Block A prints `org_name` / `customer_name` live so they can be read off
  before the go-ahead.
- HEENA's clean double **RCP/26-27/1132 (₹2,770 on POS/26-27/853)** is Tier-1 shape but
  sits in Tier 2 with her three `DUP_TENDER_REKEYED` bills under customer-atomicity — same
  situation as ANANYA's ₹11,294. Both are named follow-ups in `roadmap.md`.

## Protocol for the go-ahead (not tonight)

1. Paste **Block A** → expect headline `11 rows / 10 customers`, amount 62916.00, `ALL_OK`;
   read the 11 `row` lines against the table above (voucher numbers, amounts, `over_after`
   in [−0.5, 1], `row_ok = true` everywhere). Save the CSV.
2. Paste **Block C** → save the before digest.
3. Paste **Block B** as written (`v_mode = 'REHEARSE'`) → expect the error text
   `REHEARSAL OK (rolled back, nothing written). 11 rows / 10 customers / ₹62916 …`.
4. Only then flip `v_mode := 'EXECUTE'`, paste Block B → the trailing SELECT lists 11 tagged
   rows with `deleted_at` set and `paid_amount` unchanged.
5. Paste **Block C** again → `paid_diverges_from_receipts` down by the number of these bills
   that were listed before, `tier1_bills_still_listed` empty, no other check up. Any rise:
   clear `deleted_at` on the 11 ids in the same session.
