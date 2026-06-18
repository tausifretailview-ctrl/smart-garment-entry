
## Goal

The user has shared a second printed invoice — **POS/26-27/1101, TEJAS SURESH CHAVAN, ₹20,500, 30-05-2026** — that "disappeared" from the Mulund Mobility POS dashboard, same complaint as POS/26-27/1576. Audit it the same way as before and append findings to the existing report. No new code fix is required because the `useSaveSale` confirm dialog shipped on 18-Jun already blocks this exact scenario; verify and document.

## What the database shows

- **Sale POS/26-27/1101 no longer exists** in `sales` (Mulund org). It was hard-deleted at some point after being overwritten.
- `audit_logs` for entity `8ddb711e-61c3-404c-8084-3546c9b5283c` (sale_number 1101):
  - **30-May 08:39 IST**, user `mobility@gmail.com` — `SALE_UPDATED`, `net_amount 20,500 → 109,999`. Destructive edit on the wrong bill.
  - **30-May 11:31 IST**, same user — another `SALE_UPDATED`, amount unchanged at ₹1,09,999.
- A few minutes later, at **30-May 08:42 IST**, sale **POS/26-27/1102** was created by the same user for **RAKESH TAMBE ₹1,09,999** — the customer whose data was pasted into 1101.
- TEJAS SURESH CHAVAN's ₹20,500 bill was re-entered on **16-Jun as POS/26-27/1541** by user `mobility@gmail.com` (which itself shows a later `SALE_UPDATED` 23,999 → 20,500 — same Modify-on-wrong-bill pattern, caught and corrected within 15 minutes).

This is the **same root cause** as POS/26-27/1576: a user with Modify permission opened a stale row from another terminal and saved over it. Not a concurrency bug, not a number-collision bug, not an RLS bug.

## Plan

1. **Append a new section** "Second confirmed incident — POS/26-27/1101 (30-May-2026)" to `docs/mulund-multi-user-pos-audit-2026-06-18.md` with the audit-log evidence above and a one-line note that the same pattern recurred again on 1541 (also self-corrected).
2. **Reconfirm** that the destructive-edit guard added on 18-Jun in `src/hooks/useSaveSale.tsx` would have caught both events (customer change + >50% amount change). No code change needed — just document it in the audit file under "Why this won't happen again".
3. **Reiterate the three open follow-ups** that would harden multi-user POS to Tally/Vyapar grade:
   - Creator-scoped Modify permission (only the bill's creator, or an explicit "edit others' bills" right, can edit).
   - Realtime subscription on `sales` INSERT/UPDATE for the POS dashboard so stale rows can't be opened.
   - Show the bill creator's name on the POS dashboard row.
4. **Hand back** an updated one-page audit doc — same file, no other files touched.

## Files

- Update: `docs/mulund-multi-user-pos-audit-2026-06-18.md` (append section + tighten follow-ups).

No code, schema, RLS, or migration changes. Pure documentation update; the destructive-edit confirm dialog already covers this case in `useSaveSale.tsx`.
