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

Paste query **A** (trigger/index still on) and, if `track_functions` is on, query **E**. A positive function `calls` count only proves the trigger ran on inserts, not that it rejected anyone. Query **E** must read `fn_stats.calls` from `pg_stat_user_functions` — `pg_proc` has no `calls` column (SQL-editor 42703 if rewritten to `p.calls`). If the editor stops on E, A–D still ran; scroll the result tabs or re-run A–D alone.

### 2. Has it rejected a genuine payment on any of the six screens?

**No evidence of a false reject, and the unique key cannot create one.** A new submit mints a new UUID (`newReceiptSubmissionId`); only a retry of the *same* click collides. The cap fires only when existing non-CN sale receipts + incoming > `net_amount` + ₹1.

This environment cannot see toast-only failures. Query **B** is the accept path: if receipts since 20:10 UTC exist — especially rows with `client_request_id` — genuine payments are landing. Rows *without* the key are old clients / Electron / Android caches, not a rollback.

### 3. Any NEW duplicate-receipt pattern since go-live?

**Cannot finish without the SQL-editor paste.** Query **C** is the same `remaining_before <= 0.5` signature as the 30-May leak, restricted to `created_at >= 2026-09-18 20:10:54+00`.

- **0 rows** → the leak is holding (or nobody tried that shape). Combined with query **B** > 0, the guard is working in traffic.
- **Any row** → a leak after go-live; inspect `client_request_id` and description before blaming the trigger.

Query **D** must be 0 (same `client_request_id` reused on two live rows). A hit would mean the unique index is not enforcing.

---

## What this pass does not do

No trigger drop. No unique-index drop. No money-row mutate. No 51-bill repair.
