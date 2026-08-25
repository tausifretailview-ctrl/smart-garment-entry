# Customer / supplier balance — single source of truth

**Phase 0 inventory only.** Read-only / code-read-only. No shared-code change. No writes to customer or supplier records.

**Date:** 2026-08-25

**Branch intent:** Phase 0 accepted. Phase 1 step 1 shipped (`20261126120000`, live Farhaan C-PARTY = −Rs 100). Step 2 equality tests merged. Step 3 migrates org totals/exports/dashboards + payment picker (batch 1–2).

This month's three findings were the same gap:

1. Customer Ledger list read raw SQL party balance while Customer Balances read a JS-patched slice (Farhaan Fab: Rs 2,800 vs Rs 100).
2. Supplier Ledger PDF reconciliation footer independently recomputed a number that disagreed with its own transaction table (SANGAMN FASHION).
3. ELLA NOOR audit 7-sum disagreed with the live party RPC on 717 customers before the recompute hole was closed.

Nothing in the app forces every screen to agree. This file is the complete call-site list, not a patch list.

Live Farhaan C-PARTY was re-queried **after** `20261126120000` (export `farhaan-party-rpc-after-20261126120000-2026-08-25.csv`): **−Rs 100 Cr**. Unpatched C-PARTY was **−Rs 2,800 Cr**. Sangamn was not re-queried live.

| Case | Correct | Known wrong |
|---|---|---|
| Farhaan Fab (ELLA NOOR, phone 7977353244) | **-Rs 100 Cr** (`getCustomerAccountState` **and** live C-PARTY after `20261126120000`) | **-Rs 2,800 Cr** (unpatched party SQL before that migration) |
| SANGAMN FASHION (Gurukrupa ledger, 25-08-2026) | **Rs 1,54,648 Cr** (`computeSnapshotForSupplier`) | PDF footer previously **-Rs 1,16,008** (double-count of supplier-id payments + linked returns). Fixed in `supplierBalanceUtils` + PDF now prints `snap.balance`. |

Anything that still reads unpatched party SQL for a customer figure is **known wrong** for Farhaan (and the 72 ELLA NOOR Farhaan-shape CN leftovers). Anything that still independently recomputes supplier payable is not proven against Sangamn unless it calls `supplierBalanceUtils`.

---

## Headline (this is the sizing)

| | Count |
|---|---|
| Customer surfaces that display a party-balance-shaped number (screen, card, PDF, Excel, WhatsApp, AI) | **48** |
| Supplier surfaces that display a payable-shaped number | **17** |
| Distinct customer source families (not screens) | **10** |
| Distinct supplier source families | **5** |
| Customer surfaces that call the intended JS canonical (`getCustomerAccountState` / `useCustomerBalance`) | **11** |
| Customer surfaces still on unpatched party SQL (known Farhaan-wrong, including org totals that fold him in) | **14** |
| Customer surfaces on snapshot SQL (not the Farhaan -Rs 2,800 path; not the same function as canonical JS) | **16** |
| Independently recomputed local JS (own formula / running total) | **7 customer + 3 supplier table/PDF running totals** |

**Verdict:** this is not a two-day "patch the remaining screens" job. There are ten customer formulas and five supplier formulas. Phase 1 is a structural migration: one shared reader per party type, then delete the ability to skip it. Equality tests (Phase 2) must exist before that merge, not after.

Related (do not duplicate): `docs/ella-noor-customer-balance-audit-2026-08.md`, `docs/balance-card-divergence-2026-08.md`, `docs/supplier-balance-reconciliation-2026-07.md`.

---

## Source families (the real SSOT gap)

Intended canons today are conventions, not enforcement. Several files' comments claim to be "the" source of truth while other screens ignore them.

### Customer

| ID | Function | Kind | Farhaan |
|---|---|---|---|
| **C-JS** | `getCustomerAccountState` in `src/utils/customerBalanceCore.ts` (also `computeCustomerOutstanding` in `src/utils/customerBalanceUtils.ts`, which delegates here) | JS | **-Rs 100 known right** |
| **C-PARTY** | `get_customer_party_balances` -> `_get_customer_party_balances_rows` | SQL | **Live after `20261126120000`: −Rs 100** (Farhaan query 2026-08-25). Unpatched was −Rs 2,800. |
| **C-PARTY+JS** | C-PARTY list row, then `enrichPartyRowsWithCanonicalBalance` | SQL+JS-patched | **-Rs 100 only when the slice is <= 100 rows**. Cap: `PARTY_BALANCE_CANONICAL_ENRICH_MAX = 100`. Above that, or on Excel/PDF export of the full filter, it silently falls back to C-PARTY. |
| **C-SNAP** | `get_customer_financial_snapshot` / `_batch` / `_all` via `src/utils/customerFinancialSnapshot.ts` | SQL | Not the Farhaan -Rs 2,800 RPC. Facet comments say snapshot matches JS after migration `20260822183000`, but `useCustomerBalance` still displays C-JS and only warns if snapshot drifts. Treat as unverified vs Farhaan live; different from C-PARTY. `outstanding_dr` historically netted unused advance (Aafra class) — do not assume it equals C-JS outstanding. |
| **C-REC** | `reconcile_customer_balance` / `reconcile_customer_balances` via `src/utils/organizationReceivables.ts` | SQL | Same family as `get_customer_true_outstanding` per comments. Unverified vs Farhaan live. Used for org AR cards and salesman list. |
| **C-TRUE** | `get_customer_true_outstanding` | SQL | Wrapper `fetchCustomerTrueOutstandingMap` has **zero UI callers**. Dead for display. |
| **C-RECON-LEDGER** | `src/utils/customerLedgerReconciliation.ts` from rendered ledger transactions | JS independent | **−Rs 100 locked** in `balanceSsotEquality.lock.test.ts` (same Farhaan fixture). |
| **C-STMT** | `get_customer_ledger_statement` plus client merge of sales / returns / vouchers / advances / adjustments (`CustomerLedgerPage.tsx`) | SQL+JS independent | Own running balance. |
| **C-AUDIT** | `computeCustomerOutstanding` in `src/utils/customerAuditMath.ts` | JS (delegates to core with a drift warning) | **−Rs 100 locked** with `ledgerAlignedApplicationReceipts: true`. |
| **C-OB-SALES** | `opening_balance + totalSales - totalPaid` | JS naive | **Known wrong** for any CN / advance / SRA customer. |
| **C-OB** | `customers.opening_balance` only | Master field | Not current AR. |

`src/utils/customerBalanceVerificationGate.ts` compares C-SNAP vs C-PARTY vs C-JS. Named-party equality for Farhaan / Sana / Aafra / Sangamn lives in `test/money/balanceSsotEquality.lock.test.ts`.

### Supplier

| ID | Function | Kind | Sangamn |
|---|---|---|---|
| **S-JS** | `computeSnapshotForSupplier` / `fetchSupplierBalanceSnapshot` in `src/utils/supplierBalanceUtils.ts` | JS canonical | **Rs 1,54,648 Cr known right** (`src/utils/supplierBalanceUtils.test.ts`) |
| **S-PARTY** | `get_supplier_party_balances` via `fetchAllSupplierPartyBalances` | SQL | Repo migration `20261102120000_supplier_party_balances_paid_matches_ledger.sql` aims to align this RPC with S-JS. The Supplier Balances page still does not call `supplierBalanceUtils`. Treat as unverified vs Sangamn until a live equality check. |
| **S-ORG** | `get_organization_supplier_payable_summary` | SQL org total | Unverified vs sum of S-JS. Owner Dashboard KPI uses this; Accounts Outstanding payable card uses sum of S-JS instead. |
| **S-TXN** | Running balance from Supplier Ledger transaction rows | JS independent | Table close is this. PDF table total is this. PDF footer now uses S-JS (the Sangamn fix). If transaction construction drifts from S-JS, table and footer disagree again. |
| **S-OB** | `suppliers.opening_balance` only | Master field | **Known wrong** as "outstanding" (Owner Purchase Dashboard, AI assistant fallback). |

---

## Customer inventory

"Agrees?" is vs Farhaan (-Rs 100 right / -Rs 2,800 wrong). Org-level cards cannot show Farhaan's line; they are marked **org-wrong** if they sum unpatched party signed.

| # | Screen / surface | File | Source | Kind | Agrees? |
|---|---|---|---|---|---|
| C01 | Customer Balances — visible table row | `src/pages/CustomerPartyBalancesPage.tsx` | C-PARTY+JS (`enrichPartyRowsWithCanonicalBalance` on filtered slice if <=100, else visible page) | SQL+JS-patched | **Right on the visible page** (Farhaan search / current page). Full-org unfiltered list is not enriched. |
| C02 | Customer Balances — org cards (Outstanding / Credit / Net) | same | C-PARTY (`fetchCustomerPartyBalancesAligned` then `summarizeAccountFacets(rows)` — **not** the enriched slice) | SQL-only | **Right post `20261126120000`** (Farhaan −Rs 100 is in credit pool, not Dr outstanding) |
| C03 | Customer Balances — Excel export | same `exportToExcel` | C-PARTY (`filteredRows`, never enriched) | SQL-only | **Right post `20261126120000`** |
| C04 | Customer Balances — PDF export | same `exportToPdf` | C-PARTY (`filteredRows`) | SQL-only | **Right post `20261126120000`** |
| C05 | Customer Ledger — list (Accounts tab + `/customer-ledger-report`) | `src/components/CustomerLedger.tsx` + `src/utils/customerLedgerListFromPartyBalances.ts` | C-PARTY+JS on filtered <=100 or paginated slice; seed is C-PARTY | SQL+JS-patched | **Right on visible slice**; search "Farhaan" (1 row) is patched. Unfiltered Excel of all filtered is not. |
| C06 | Customer Ledger — list Excel | `CustomerLedger.tsx` `handleExportCustomerListExcel` | C-PARTY (`filteredCustomers` without enrich when >100) | SQL-only when filter >100 | **Wrong** on ELLA NOOR unfiltered export |
| C07 | Customer Ledger — list PDF | `CustomerLedger.tsx` | same as C06 | same | same |
| C08 | Customer Ledger — detail headline / unused advance | `useCustomerBalance` in `CustomerLedger.tsx` | C-JS | JS | **Right** |
| C09 | Customer Ledger — on-screen Balance Reconciliation | `CustomerLedger.tsx` + `customerLedgerReconciliation.ts` | C-RECON-LEDGER | JS independent | Unverified (must match table; Phase 2 vs C-JS) |
| C10 | Customer Ledger — PDF recon footer | `CustomerLedger.tsx` `handleExportToPDF` | C-RECON-LEDGER | JS independent | Unverified (same class as the old Sangamn footer bug) |
| C11 | Customer Ledger — PDF table closing | same | last transaction running balance | JS independent | Unverified |
| C12 | Main Dashboard — Net Receivable card | `src/pages/Index.tsx` via `useCustomerPartyBalanceOrgWindow` | C-PARTY window `net_receivable` | SQL-only | **Right post `20261126120000`** |
| C13 | Owner Dashboard (mobile) — Net Receivable | `src/components/mobile/OwnerDashboard.tsx` | C-PARTY window | SQL-only | **Right post `20261126120000`** |
| C14 | Accounts Outstanding — receivable headline | `src/pages/Accounts.tsx` via `useOrganizationReceivablesSummary` | C-REC | SQL | Unverified vs Farhaan; **different family from C12** (dashboard vs Accounts can already disagree) |
| C15 | Accounts Outstanding — customer list | `src/components/accounts/OutstandingDashboardTab.tsx` | C-SNAP (`outstandingDr`) for headline; invoice aging is a separate client sum | SQL + JS aging | Snapshot path, not -Rs 2,800. Aging buckets still recompute invoice leftover independently. |
| C16 | Outstanding dashboard Excel | same | C-SNAP | SQL | Snapshot path |
| C17 | Accounts Customer Payment — picker amounts | `src/utils/customerPaymentPickerList.ts` + `CustomerPaymentTab.tsx` | C-PARTY aligned (`fetchCustomerPartyBalancesAligned`, `net_position`) | SQL-only | **Right post step 3** — matches C-JS banner for debtors |
| C18 | Customer Payment — selected customer banner | `CustomerPaymentTab.tsx` | C-JS (`useCustomerBalance`) | JS | **Right** |
| C19 | Floating Payments — customer outstanding | `src/components/FloatingPayments.tsx` | C-JS (`useCustomerBalance`) then aligned picker | JS + SQL | **Right post step 3** |
| C20 | POS — selected customer chip | `src/pages/POSSales.tsx` | C-JS (`useCustomerBalance`) | JS | **Right** |
| C21 | POS — customer search dropdown | `useCustomerBalances` in `src/hooks/useCustomerSearch.tsx` | C-SNAP (`outstandingDr`, first 20 ids) | SQL | Snapshot path |
| C22 | POS — WhatsApp invoice caption Outstanding Balance | `POSSales.tsx` (opening + sales - paid) | C-OB-SALES | JS independent | **Known wrong** |
| C23 | POS Dashboard — WhatsApp outstanding | `src/pages/POSDashboard.tsx` | C-OB-SALES | JS independent | **Known wrong** |
| C24 | Sales Invoice — header due/credit | `src/pages/SalesInvoice.tsx` | C-JS | JS | **Right** |
| C25 | Sales Invoice — customer picker | `useCustomerBalances` | C-SNAP | SQL | Snapshot path |
| C26 | Payments Dashboard — org receivable cards | `src/pages/PaymentsDashboard.tsx` | C-REC | SQL | Unverified; same family as C14 |
| C27 | Payments Dashboard — WhatsApp | same | C-SNAP | SQL | Snapshot path |
| C28 | Sales Invoice Dashboard — WhatsApp | `src/pages/SalesInvoiceDashboard.tsx` | C-SNAP | SQL | Snapshot path |
| C29 | Salesman Outstanding | `src/pages/salesman/SalesmanOutstanding.tsx` | C-SNAP | SQL | Snapshot path |
| C30 | Salesman Customers list | `src/utils/salesmanCustomerList.ts` | C-REC primary; fallback invoice leftover | SQL (+ JS fallback) | Unverified / fallback **wrong** |
| C31 | Salesman Customer Account — Outstanding card | `src/pages/salesman/SalesmanCustomerAccount.tsx` | **C-SNAP** (`useCustomerFinancialSnapshot.outstandingDr`) while opening/sales/paid come from C-JS | SQL | Snapshot path. Comment says "same RPC as Customer Ledger" — false: Ledger detail is C-JS. |
| C32 | Salesman Customer Account — WhatsApp | same | C-SNAP | SQL | Snapshot path |
| C33 | Salesman Order Entry | `src/pages/salesman/SalesmanOrderEntry.tsx` | C-SNAP | SQL | Snapshot path |
| C34 | Command palette customer row | `src/utils/commandPaletteSearch.ts` + `CommandPalette.tsx` | C-SNAP | SQL | Snapshot path |
| C35 | Customer Statement floating dialog (mobile accounts) | `src/components/CustomerStatementFloatingDialog.tsx` | list C-SNAP; selected detail C-JS | SQL + JS | List snapshot / detail **right** |
| C36 | Customer Account History (dialog / POS history) | `src/hooks/useCustomerAccountHistoryData.ts` | C-JS | JS | **Right** |
| C37 | Account Statement (`/customer-account-statement`) | `src/pages/CustomerLedgerPage.tsx` | C-STMT | SQL+JS independent | Unverified |
| C38 | Statement Audit | `src/pages/CustomerAccountStatementAuditPage.tsx` | C-AUDIT + C-JS snapshot fetch | JS | Should match C-JS if lifetime + ledger-aligned flag |
| C39 | Customer Audit Report | `src/pages/CustomerAuditReport.tsx` | C-REC per customer + C-AUDIT + C-SNAP compare | SQL+JS | Diagnostic; can disagree with C-PARTY by design |
| C40 | Customer Reconciliation page | `src/pages/CustomerReconciliation.tsx` | C-REC list + C-AUDIT per row | SQL+JS | Diagnostic |
| C41 | Customer Balance Activity | `src/pages/CustomerBalanceActivityPage.tsx` | C-SNAP vs legacy `fetchCustomerBalanceSnapshot` (C-JS) | SQL vs JS | Diagnostic |
| C42 | Customer Balance Adjustment dialog | `src/components/CustomerBalanceAdjustmentDialog.tsx` | C-SNAP list + C-JS `fetchCustomerBalanceSnapshot` | SQL+JS | Mixed |
| C43 | Bulk Advance Adjust | `src/components/BulkAdvanceAdjustDialog.tsx` | C-SNAP | SQL | Snapshot path |
| C44 | Settle Customer Account | `src/components/SettleCustomerAccountDialog.tsx` | C-SNAP | SQL | Snapshot path |
| C45 | Mobile Owner — customer balance report | `src/components/mobile/MobileOwnerBalanceReports.tsx` | C-SNAP | SQL | Snapshot path |
| C46 | Accounting Reports / Balance Sheet — Accounts Receivable | `src/utils/accountingReportUtils.ts` and `src/pages/AccountingReports.tsx` | C-REC `grossReceivableDr` | SQL | Unverified; org-level |
| C47 | AI assistant — outstanding / due / balance | `supabase/functions/ai-assistant/index.ts` | C-PARTY; fallback C-OB | SQL-only | **Wrong** (Farhaan-shape). Fallback **wrong**. |
| C48 | Invoice dashboard — Khata FIFO ledger net | `src/utils/invoiceDashboardData.ts` `applyDisplayFifoForKhataCustomers` | C-PARTY `signed_balance` (no enricher) | SQL-only | **Wrong** for Farhaan-shape debtors (changes which invoices look pending) |

### Customer known-wrong list (Farhaan / unpatched party)

Must not be treated as "already fixed by the Balances-page enricher":

- C06, C07 when filter > 100 (Ledger list exports)
- C47 (AI)
- C48 (invoice Khata FIFO)
- C05 seed rows that are not on the visible/enriched slice

Naive independent (also wrong, different formula): **C22, C23**, salesman list fallback, AI opening-balance fallback.

---

## Supplier inventory

| # | Screen / surface | File | Source | Kind | Sangamn |
|---|---|---|---|---|---|
| S01 | Supplier Ledger — list balance | `src/components/SupplierLedger.tsx` | S-JS (`loadSupplierBalanceMapForOrg` / snapshot map) | JS | **Right** |
| S02 | Supplier Ledger — table closing | same `transactionTotals.closingBalance` | S-TXN | JS independent | Should match S-JS if rows include the same events; this is the number that was **correct** on 25-08-2026 |
| S03 | Supplier Ledger — PDF table TOTAL | same `handleExportToPDF` | S-TXN | JS independent | Same as S02 |
| S04 | Supplier Ledger — PDF Balance Reconciliation footer | same, `snap.balance` | S-JS | JS | **Right (fixed this month).** Previously independent recon double-counted supplier-id payments + linked returns (-Rs 1,16,008). |
| S05 | Supplier Ledger — Excel | same | S-TXN | JS independent | Table numbers, not S-JS directly |
| S06 | Supplier Ledger — on-screen recon block | same | S-JS | JS | **Right** |
| S07 | Floating Supplier Ledger | `src/components/FloatingSupplierLedger.tsx` | S-JS | JS | **Right** |
| S08 | Accounts Supplier Payment | `src/components/accounts/SupplierPaymentTab.tsx` | S-JS | JS | **Right** |
| S09 | Adjust Credit Note dialog | `src/components/AdjustCreditNoteDialog.tsx` | S-JS | JS | **Right** |
| S10 | Supplier History dialog | `src/components/SupplierHistoryDialog.tsx` | S-JS | JS | **Right** |
| S11 | Accounts Outstanding — payable headline | `src/pages/Accounts.tsx` `sumOrgSupplierPayableFromSnapshots` | S-JS (sum of positive snapshot balances) | JS | **Right** (same function as S01) |
| S12 | Owner Dashboard — supplier payable KPI | `OwnerDashboard.tsx` via `fetchOrganizationSupplierPayableSummary` | S-ORG | SQL | Unverified. Can disagree with S11. |
| S13 | Supplier Balances page (`/supplier-party-balances`) | `src/pages/SupplierPartyBalancesPage.tsx` | S-PARTY | SQL-only | Unverified vs Sangamn. SQL rewrite exists in-repo to match S-JS paid/CN rules, but this page still never calls `supplierBalanceUtils`. Highest remaining recurrence risk until Phase 2 equality. |
| S14 | Supplier Balances Excel / PDF | same | S-PARTY | SQL-only | Same as S13 |
| S15 | Mobile Owner — supplier balance report | `MobileOwnerBalanceReports.tsx` | S-JS | JS | **Right** |
| S16 | Owner Purchase Dashboard — supplier outstanding list | `src/components/mobile/OwnerPurchaseDashboard.tsx` | S-OB (`opening_balance > 0`) | Master field | **Known wrong** as outstanding (not the Sangamn double-count; a different lie) |
| S17 | AI assistant — supplier outstanding | `ai-assistant/index.ts` | S-OB | Master field | **Known wrong** |

No other supplier-facing screen still contains the Sangamn PDF footer formula (adding generic `reference_id = supplier` payments on top of bill `paid_amount`). That specific double-count lives only in history; the remaining supplier split is **S-JS vs S-PARTY vs S-ORG vs S-OB**.

Bill-level `src/utils/supplierBillOutstanding.ts` is FIFO allocation onto bills (payment tab line due). Not a party total; listed under adjacent.

---

## Adjacent (not party AR/AP, listed so they are not missed)

| Surface | Why excluded from the 48/17 |
|---|---|
| Per-invoice remaining (`sales.paid_amount`, Sales dashboard, POS bill due) | Invoice leftover, not customer net |
| School Student Ledger / `schoolFeeYearBalances.ts` | Fee liability, different domain |
| Customer Master `opening_balance` column | Master field, not current AR |
| Tally export ledger masters | Writes `opening_balance`, not live AR/AP |
| Third-party GL balances (`src/utils/accounting/thirdPartyBalances.ts`) | `journal_lines` only; not party RPC |
| Chart of accounts Ledger Opening Balances | GL openings |
| `supplierOverpaymentGuard` / `invoiceOverpaymentGuard` | Guards, not display |
| Daily Cashier Report | Cash drawer, not party AR |

---

## What independently computed means here

A surface is independent when it does not call `getCustomerAccountState` / `useCustomerBalance` (customer) or `fetchSupplierBalanceSnapshot` / `computeSnapshotForSupplier` (supplier), and instead:

- hits another SQL RPC, or
- sums sales/receipts/CN/advances itself, or
- prints the last running-balance cell of a locally built table.

Truly local JS recomputes: C09, C10, C11, C22, C23, C37, salesman list fallback (7). Supplier local running totals: S02, S03, S05.

The enricher (`C-PARTY+JS`) is a temporary patch, not SSOT. It:

1. no-ops when `rows.length > 100`;
2. is not used by payment pickers, dashboards, AI, invoice FIFO, or exports;
3. will be unnecessary only after C-PARTY CN handling matches `_is_settlement_memo_receipt` (Phase 1 item 1) **and** a drift check shows zero patched rows.

---

## Phase 1 sequencing (signed off 2026-08-25)

Each step is its own PR, its own `npm run test:money` run, and reports back before the next starts. Do **not** migrate all 48+17 surfaces in one pass.

1. **Root SQL (shipped, applied live):** `_get_customer_party_balances_rows` calls `_is_settlement_memo_receipt`; remaining sale-return credit restored. Farhaan live C-PARTY = −Rs 100. Enricher stays.
2. **Equality tests (this step):** `test/money/balanceSsotEquality.lock.test.ts` — Farhaan (C-JS = C-PARTY = C-AUDIT = C-RECON = live −Rs 100), Sana Nasir (advance-heavy facets), Aafra (C-SNAP), Sangamn S-JS vs S-ORG third SQL. No screen migration.
3. **Migrate in risk order (step 3 — batch 1–2 shipped):** org-wide totals and exports (post-fix C-PARTY — no code change needed beyond verification), Customer Payment picker + Floating Payments onto aligned C-PARTY / C-JS. Remaining surfaces in a follow-up.
4. **Supplier track (not this PR):** `/supplier-party-balances` onto `supplierBalanceUtils`, then reconcile `get_organization_supplier_payable_summary` (S-ORG currently double-counts Sangamn paid_amount + vouchers: −Rs 55,680 vs S-JS Rs 1,54,648).
5. **Enforcement last (not this PR):** one shared hook plus lint/review rule, only after 1–4 agree.

Do not delete `enrichPartyRowsWithCanonicalBalance` in step 1 or 2.

## Phase 2 (after sign-off, not this PR)

1. Cross-screen equality in `npm run test:money` for Sana Nasir, Farhaan Fab, Shumama Baireli, Sangamn Fashion — every inventory row, same number.
2. Lint/review: new files that query `sales` / `voucher_entries` / `customer_advances` / `sale_returns` to produce a balance-shaped number without the shared function.
3. Invariant digest: canonical vs leftover party RPC (while both exist), then vs periodic independent spot-recompute.

---

## Lock tests added with this inventory

`test/money/balanceSsotInventory.lock.test.ts` freezes:

- enricher cap = 100 and no-op above cap;
- payment picker uses aligned `net_position` (post step 3);
- Sangamn snapshot fixture still equals **154648**.

`test/money/balanceSsotMigrateStep3.lock.test.ts` (step 3) freezes:

- org card / export / dashboard facet paths on post-fix Farhaan + Shumama fixtures;
- payment picker excludes Cr customers and maps debtor `net_position`.

`test/money/balanceSsotEquality.lock.test.ts` (step 2) freezes:

- Farhaan C-JS / C-UTILS / C-AUDIT / C-RECON / post-fix C-PARTY / live RPC export = **−Rs 100**;
- Sana Nasir C-JS netPosition = C-PARTY signed **−Rs 20,000**;
- Aafra C-SNAP = C-JS = C-PARTY facets (Rs 14,800 / 10,000 / 4,800);
- Sangamn S-JS = **154648**, S-ORG third SQL = **−55680** on the same bills (do not treat as equal until step 4).

