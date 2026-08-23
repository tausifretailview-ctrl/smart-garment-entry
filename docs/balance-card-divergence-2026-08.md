# Customer Balances vs Customer Ledger — org cards (23 Aug 2026)

Org: **ELLA NOOR** `3fdca631-1e0c-4417-9704-421f5129ff67` (7,632 parties).  
KS Footwear `4bc73037-…` is not this screenshot pair.

**Status:** Tasks 1–2 from the 23 Aug prompt are answered here. Task 3 (Ledger credit pool vs Balances credit) is **not re-baselined** — `get_customer_party_balances` is timing out (57014); no fresh Ledger screenshot of the Customer Credit Pool card. Do not treat the ₹32,96,826 figure as measured.

No writes were made to sales, receipts, advances, or `paid_amount`.

---

## Task 1 — ₹6,30,200 (read-only)

### Columns `_get_customer_party_balances_rows` actually returns

Latest definition: `supabase/migrations/20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql`.

| Output column | Meaning |
|---|---|
| `out_customer_id` / `out_customer_name` | Party |
| `out_signed_balance` | Net position (unused advance **already subtracted**) |
| `out_advance_available` | Unused advance pool only (`amount − used − refunds`) |
| `out_direction` | Dr / Cr / Settled from signed |
| `out_net_position` | `signed − unused` again — **do not use** (double-subtracts advance) |
| `out_total_dr` | **Window:** `SUM(GREATEST(signed, 0))` — same on every row |
| `out_total_cr` | **Window:** `SUM(GREATEST(−signed, 0))` — same on every row |
| `out_net_receivable` | **Window:** `SUM(signed)` — same on every row |

There is **no** dedicated CN-pool, pending-return, or refund column. Credit-note vouchers, pending sale returns, and customer payment refunds are **inside** `out_signed_balance` only (see `credit_note_vouchers`, `pending_sale_returns`, `customer_payment_refunds` CTEs).

### What the DISTINCT window query should return (do not expect the Balances card trio)

```sql
SELECT DISTINCT out_total_dr, out_total_cr, out_net_receivable
FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid);
```

This call is currently **timing out**. From the established live digest + identities, expect:

| Window column | Expected (ELLA NOOR 23 Aug) |
|---|---|
| `out_total_dr` | **32,26,922** (netted debtors) |
| `out_total_cr` | **18,22,504** (netted creditors) |
| `out_net_receivable` | **14,04,418** |

Not 35,08,940 / 21,04,522 / 14,04,418. Those three are **UI facets**, not the window columns.

The Balances page does **not** read `out_total_*`. It recomputes:

`outstanding = signed + unused`, then `summarizeAccountFacets`.

### Credit-side org totals (same digest)

| Component | Amount | In `out_total_cr` window? | In Balances Total Credit card? |
|---|---|---|---|
| `SUM(out_advance_available)` | 14,74,322 | No (window is netted signed only) | Yes |
| Intra-customer offset `SUM(LEAST(gross outstanding, advance))` | 2,82,018 | Explains Balances vs Ledger **Outstanding** (Finding 1) | n/a |
| **Negative recovered invoice outstanding** `SUM(GREATEST(0, −(signed + unused)))` | **6,30,200** | Partially: only the slice already inside `SUM(GREATEST(−signed, 0))` | **Yes** |
| Implied `SUM(signed)` if you do `35,08,940 − 14,74,322` | 20,34,618 | **Wrong identity** — that subtracts unused from **gross Dr only** | — |
| Actual `SUM(signed)` = Net Receivable card | 14,04,418 | Yes (`out_net_receivable`) | Yes (net card) |

**₹6,30,200 is not a missing RPC column.** It is:

```
Σ max(0, −(signed_balance + advance_available))
```

That is leftover **invoice credit** after adding unused advance back: credit notes, pending standalone returns, and overpayments that live in `signed_balance`, not in `advance_available`.

Check:

- 14,74,322 + 6,30,200 = **21,04,522** (Balances Total Credit)
- 20,34,618 − 6,30,200 = **14,04,418** (the mistaken “implied signed” vs real `Σ signed`)

`out_total_cr` (18,22,504) = netted credit only = 21,04,522 − 2,82,018 (same intra-customer offset as Finding 1).

---

## Task 2 — identical Total Sales / Total Paid (fixed in UI)

Measured leak: every Ledger row showed **₹32,26,922** and **₹18,22,504**. Those are the party **window** totals (`out_total_dr` / `out_total_cr`), not lifetime sales/paid. Per-row Outstanding / Advance / Net were already party-correct (e.g. Aa Production ₹8,000).

Source: those two numbers are org aggregates. The list builder now:

1. Strips `total_dr` / `total_cr` / `out_total_*` / `net_receivable` before painting a row.
2. If three or more rows share the same Total Sales **and** Total Paid, treats that as an org leak and shows **—** (Excel/PDF too). Outstanding / Advance / Net are unchanged.

No balance formula was changed.

---

## Task 3 — Ledger credit pool (report only; **re-baseline after timeout fix**)

**Do not close this from the 23 Aug screenshot.**

| Item | Notes |
|---|---|
| Implied Ledger credit ₹32,96,826 | Back-calc from Net AR −₹69,904 vs Outstanding ₹32,26,922. The Customer Credit Pool card was **cut off**. Read the live card first. |
| If the live card is **₹18,22,504** | That is `out_total_cr` / receivables `customer_credit_pool_cr` (netted). Divergence vs Balances 21,04,522 is **exactly Finding 1 + Task 1** (₹2,82,018 intra-offset). No third engine. |
| If the live card is **~₹32,96,826** | Then Ledger KPI used `get_organization_receivables_summary` while the list was empty/loading (prompt sequencing). That RPC’s `customer_credit_pool_cr` is `SUM(GREATEST(−calc_bal, 0))` over the **activity-filtered** 2,363 customers, and `calc_bal` subtracts unused advance. Re-run after party RPC timeout is fixed; take a full card screenshot. |
| Population | Balances: all non-deleted customers (7,632). Receivables summary `customer_count`: customers with invoices, advance, opening, receipts, pending returns, CN, payments, or adjustments (2,363). Excluded parties can still hold leftover credit — measure `SUM(advance)` and `SUM(max(0,−signed))` on the excluded set after timeout is fixed. |
| Top 20 | Not run — party RPC 57014. After the perf rewrite (output-identical), rank `ABS(balances_credit_i − ledger_credit_i)` and hand-check five. |

---

## Labelling (display only)

- Balances Outstanding: gross (same party can appear in both Dr and Cr).
- Balances Credit: unused advances **plus** invoice credits (the ₹6,30,200), not `advance_available` alone.
- Balances cards always include settled parties; the table toggle does not change the cards.
- Ledger Outstanding card: netted per customer when the 32,26,922 path is showing.
