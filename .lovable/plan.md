## Ella Noor — Accounts Finalization: Step 1 audit + Step 2–5 roadmap

### Step 1 status (what's actually done in the DB)


| Check                        | Result                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounting engine enabled    | ✅ ON (`settings.accounting_engine_enabled = true`)                                                                                                                    |
| Chart of Accounts seeded     | ✅ 25 ledgers across 11 Tally groups (Sundry Debtors/Creditors, Sales, Purchase, Duties & Taxes, Direct/Indirect Exp & Inc, Stock-in-Hand, Current Assets/Liabilities) |
| Live posting (going forward) | ✅ Sales / Purchases / Returns / Advances / CN applications all writing `journal_entries` + `journal_lines`                                                            |
| Date range journaled         | 11-Feb-2026 → 21-Jun-2026                                                                                                                                             |


**So "Step 1" = engine ON + CoA seeded + new transactions posting. That is complete. ✅**

### Gaps blocking Tally-exact Trial Balance / P&L / Balance Sheet

Each of these will visibly break one of the three reports until fixed. **Severity order = the order you'll see mismatches with Tally.**


| #   | Gap                                                                                                                                                                                                 | Counts     | Hits which report                                           | Severity    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- | ----------- |
| 1   | **1,988 vouchers have no journal entry** (`vouchers_without_journal` from `get_pending_gl_backfill_counts`). Of 3,138 receipts only 800 are journaled; 32 payments + 3 CNs also pending             | 1,988 docs | TB (Cash/Bank, Sundry Debtors), BS, customer ledger         | 🔴 Critical |
| 2   | **No opening balances loaded** (`ledger_opening_balances` = 0). Customer master shows ₹22,28,652 of opening dues but they are nowhere on the books                                                  | 0 rows     | BS won't tie; TB won't reconcile to Tally's brought-forward | 🔴 Critical |
| 3   | **No Expense / Salary / Manual / Contra / RoundOff journals booked** (counts = 0 each). If real expenses occurred, P&L expense side is empty                                                        | 0 entries  | P&L (expense side), TB                                      | 🔴 Critical |
| 4   | **12 purchase bills with year typos** — bill_date = `0202-03-02` and `2028-01-03 … 2028-07-05`. Total ≈ ₹9.35 L sitting outside FY → silently dropped from period reports or pushed into wrong year | 12 bills   | P&L purchases, TB, stock value                              | 🔴 Critical |
| 5   | Sale journals (3,219) > active sales (3,155). Likely stale journals from cancelled/deleted sales not reversed                                                                                       | Δ 64       | TB sales total + Sundry Debtors slightly inflated           | 🟡 High     |
| 6   | CoA is only 25 ledgers. Tally master typically has separate bank accounts, individual expense heads (Rent, Salary, Electricity, Bank Charges, etc.), and per-payee ledgers                          | –          | TB groupings will look "thin" vs Tally                      | 🟡 Medium   |
| 7   | Books-closing lock (`books_closed_before_date`) not set                                                                                                                                             | –          | Accidental back-dated edits can move TB after sign-off      | 🟢 Hygiene  |


### Step 2–5 roadmap to reach Tally-exact reports

Each step is a separate, reviewable action. **No code or DB writes in this plan — just the proposed sequence.** I'll come back and ask for go-ahead before executing any one of them.

**Step 2 — Fix data-quality issues that will skew every report (no GL impact yet).**

- 2.1 Correct the 12 purchase bills with bad `bill_date` (`0202-03-02`, `2028-…`). I'll list each one with current date and ask you for the correct date — purchase entries, not auto-fix.
- 2.2 Identify the 64 surplus `Sale` journal entries (likely cancelled sales that weren't journal-reversed) and reverse them via the existing reversal path.
- 2.3 If real expenses/salary were paid in cash/bank in this FY, capture them via Accounts → Expense / Salary vouchers so they enter the GL. (You'll need to give me the list, or post them yourself in the app.)

**Step 3 — Load opening balances as of the chosen FY-start cut-over date.**

- 3.1 Confirm the cut-over date (likely 01-Apr-2026 for FY 2026-27, or earlier if you want a full year).
- 3.2 Enter Tally's closing trial balance as of the day before that cut-over into `ledger_opening_balances` (Accounts → Opening Balances UI). Capital, Reserves, Fixed Assets, Stock-in-Hand, Bank, Cash, Loans, OB customers, OB suppliers.
- 3.3 Verify Σ Dr opening = Σ Cr opening before proceeding.

**Step 4 — Historical GL backfill (one-click, already built).**

- 4.1 Run `Accounts → Pending GL Backfill → Historical Backfill` for Ella Noor only. This walks through all unjournaled sales/purchases/receipts/payments/returns and writes the missing `journal_entries` + `journal_lines` using the same posting rules new transactions already use.
- 4.2 Re-check `get_pending_gl_backfill_counts` — must return `total_pending = 0, total_failed = 0`.

**Step 5 — Reconcile against Tally and lock the books.**

- 5.1 Open `Accounting Reports → GL Trial Balance` for the cut-over → today. Compare group-by-group with Tally's TB.
- 5.2 Open `GL P&L` for the FY range. Compare Gross Profit, line-by-line indirect expenses.
- 5.3 Open `GL Balance Sheet` as-of today. Liabilities + Equity must equal Assets, and major heads must match Tally.
- 5.4 Tally drift checklist (predictable causes): rounding diff (use RoundOff journal), unbooked bank charges, unbooked TDS, depreciation not yet posted, inventory closing-stock valuation method difference.
- 5.5 Once matched, set `settings.books_closed_before_date = <cut-over date>` to prevent back-dated journals from breaking the locked TB.

### What I need from you to start Step 2

1. **Cut-over date** for the opening trial balance (default suggestion: **01-Apr-2026**).
2. Confirmation that **only Ella Noor** should be touched (the "Backfill All Organizations" button is the wrong one).
3. Permission to **list the 12 bad-date purchase bills** in chat and the **64 surplus sale journals** so you can give correct values / approve reversals.

After your answers I'll come back with the Step 2 action plan for approval before any write.

Calculate date from starting transaction 

Only ella noor touched 

Stay as original date we change to 2026 by mistake 2028 entry manual 