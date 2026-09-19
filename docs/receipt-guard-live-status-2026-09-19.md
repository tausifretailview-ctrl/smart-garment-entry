# Receipt guard — live status (19 Sep 2026 morning)

**Do not roll back.** Duplicate-click key + settled-bill database lock stay in production.

Go-live: Lovable `6652716da` **2026-09-18 20:10:54 UTC** (overnight). Same SQL file added `client_request_id`, `uq_voucher_entries_client_request_active`, and `trg_enforce_receipt_within_invoice_cap`.

---

## Independently verified from this environment (no SQL editor)

| Check | Result |
| --- | --- |
| Production PostgREST `voucher_entries.client_request_id` | **Exists.** `select=client_request_id` → HTTP 200. A fake column → HTTP 400 `42703`. |
| Production Vercel bundle (`smart-garment-entry.vercel.app`, `erpBootstrap-BwwRdOAE.js` + payment chunks) | **Live.** Writes `client_request_id`; maps `23505` / `uq_voucher_entries_client_request_active` and `P0431` / `RECEIPT_OVER_CREDIT`; toasts “already recorded” and “already fully settled”. POS Dashboard, Payments Dashboard, Floating Payments insert the key. `createReceiptVoucher` in the same bootstrap is what Customer Payment Tab, Settle Customer Account, and Sales-Invoice cash call. |
| Trigger as a PostgREST RPC | Not exposed (expected). Trigger functions are not callable; 404/`PGRST202` does not mean it is missing. |
| Postgres reject log | **Not readable here.** Anon RLS returns `[]` on `voucher_entries`. No service-role key. Rejects leave no row. |

---

## The three questions

Rejected attempts do not insert a voucher. There is no fire table. So (1) and (2) cannot be proven from successful rows alone. (3) can, once the SQL-editor paste in `scripts/receipt-guard-live-status-2026-09-19.sql` is run.

### 1. Has it fired on a real attempt since go-live?

**Not yet observable from queryable tables.** Last night’s rehearsal (rolled-back T1/T4) is still the only named fire. A real double-click or settled-bill attempt would raise `23505` or `P0431` and leave no extra receipt. Those exceptions are not stored in-app.

**Query E paste** (`query-results-export-2026-09-19_13-49-03_0038.csv`, 19 Sep 2026 13:49 IST):

| function_name | stats_reset_at | trigger_calls |
| --- | --- | --- |
| `enforce_receipt_within_invoice_cap` | 2025-11-04 02:17:06+00 | *(empty)* |

The function **exists** on production `pg_proc`. Empty `trigger_calls` means `track_functions` is off (`pg_stat_user_functions` has no row) — not that the trigger never ran. `stats_reset_at` is the database-wide stats clock (project age), not go-live. Query E cannot name a real-world block.

**Query A paste** (`query-results-export-2026-09-19_14-51-39_344f.csv`, 19 Sep 2026 14:51 IST):

| column_live | unique_index_live | trigger_live_and_enabled |
| --- | --- | --- |
| **true** | **true** | **true** |

Column, unique index, and trigger are all still installed and enabled. Do **not** roll them back. C / C2 / D were not in this export (SQL editor first-tab only). Next paste is `scripts/receipt-guard-live-status-C2D-2026-09-19.sql` (C2 first so the first tab is the SHREEVASTAV already-zero check).

### 2. Has it rejected a genuine payment on any of the six screens?

**No evidence of a false reject, and the unique key cannot create one.** A new submit mints a new UUID (`newReceiptSubmissionId`); only a retry of the *same* click collides. The cap fires only when existing non-CN sale receipts + incoming > `net_amount` + ₹1.

This environment cannot see toast-only failures.

**Query B paste** (`query-results-export-2026-09-19_13-50-58_e8af.csv`, 19 Sep 2026 13:50 IST):

| receipts_since_golive | with_submit_key | without_submit_key | orgs | first_at UTC | last_at UTC |
| ---: | ---: | ---: | ---: | --- | --- |
| **14** | **0** | **14** | 1 | 2026-09-19 06:42:26 | 2026-09-19 08:17:48 |

Fourteen receipts landed this morning on one org (12:12–13:47 IST). The settled-bill cap did **not** blanket-block this traffic — genuine payments are flowing.

None of the 14 carry `client_request_id`.

**Query B2 paste** (`query-results-export-2026-09-19_14-46-54_9d68.csv`, 19 Sep 2026 14:46 IST): **21** live receipts, still **one org = ELLA NOOR**, still **0 submit keys**. Seven more landed after the Query B cutoff (08:17–09:16 UTC / 13:47–14:46 IST).

| Writer | Rows | Vouchers |
| --- | ---: | --- |
| Sales Invoice Dashboard dialog (`Payment received for invoice INV/…`) | 12 | RCP/4878–4884, 4888–4891, 4897 |
| `consumeAdvanceFIFO` (`Adjusted from advance balance for invoice (advance ADV/…)`) | 9 | RCP/4885–4887, 4892–4896, 4898 |

No POS Dashboard, Customer Payment Tab, Floating Payments, Payments Dashboard, Settle Customer Account, or Gurukrupa traffic in this window.

0 keys is **expected from source**, not a rollback and not only a cached client:

- Sales Invoice Dashboard **dialog** (`SalesInvoiceDashboard.tsx`) calls `createReceiptVoucher` **without** `clientRequestId`. (Bulk cash `recordInvoiceFullCashPayment` does pass a key; this morning’s rows are the dialog — UPI “Received in: SHEZA AMANI A/C” and cash.)
- `consumeAdvanceFIFO` also omits the key.

The duplicate-click unique index cannot fire on this traffic. The settled-bill **cap trigger still applies** to the 12 cash/UPI rows. Query A is **true / true / true**. Next paste is `scripts/receipt-guard-live-status-C2D-2026-09-19.sql` (C2 first).

Cash/UPI named rows (IST = UTC+5:30):

| UTC | RCP | Invoice | Method | ₹ |
| --- | --- | --- | --- | ---: |
| 06:42:26 | 4878 | INV/26-27/3133 | upi | 2,750 |
| 06:43:05 | 4879 | INV/26-27/3078 | upi | 4,750 |
| 06:43:59 | 4880 | INV/26-27/3132 | upi | 8,950 |
| 06:44:18 | 4881 | INV/26-27/3132 | upi | 1,800 |
| 06:44:41 | 4882 | INV/26-27/3132 | upi | 1,200 |
| 06:46:00 | 4883 | INV/26-27/3131 | upi | 2,950 |
| 06:46:37 | 4884 | INV/26-27/3131 | cash | 2,800 |
| 08:06:55 | 4888 | INV/26-27/3135 | cash | 16,000 |
| 08:11:13 | 4889 | INV/26-27/3134 | cash | 2,950 |
| 08:11:22 | 4890 | INV/26-27/3136 | cash | 4,700 |
| 08:17:48 | 4891 | INV/26-27/3137 | cash | 9,700 |
| 09:14:45 | 4897 | INV/26-27/3014 | upi | 4,500 |

INV/3132 three UPI in 42 seconds (₹8,950 + ₹1,800 + ₹1,200) and INV/3131 UPI then cash are **split/mix until C says otherwise** — different amounts, not the same-click SHREEVASTAV shape. INV/3113 two advances 1.4s apart (ADV/458 + ADV/595) is the known legitimate FIFO pattern.

### 3. Any NEW duplicate-receipt pattern since go-live?

**Cannot finish without query C.** Query **C** is the same `remaining_before <= 0.5` signature as the 30-May leak, restricted to `created_at >= 2026-09-18 20:10:54+00`. **C2** is the same minus `advance_adjustment` (SHREEVASTAV cash/UPI shape).

- **0 rows** → the leak is holding (or nobody tried that shape). Combined with query **B** > 0, the guard is working in traffic.
- **Any row** → a leak after go-live; inspect `client_request_id` and description before blaming the trigger.

Query **D** must be 0 (same `client_request_id` reused on two live rows). A hit would mean the unique index is not enforcing.

---

## What this pass does not do

No trigger drop. No unique-index drop. No money-row mutate. No 51-bill repair.
