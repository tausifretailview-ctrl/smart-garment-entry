# Settings, Payments, Product, Account Ledger — fast load (2026-08)

Client-side perf pass for four slow pages. No new SQL migrations required for the table/list wins; `get_product_filter_options` RPC must already be deployed (migration `20260912130000_get_product_filter_options.sql`).

## Product dashboard

- Filter dropdowns call `get_product_filter_options` (one RPC) instead of two full `products` table scans.
- `size_groups` query scoped by `organization_id`.

## Payments dashboard

- Invoice table: server pagination + server search (`fetchPaymentsDashboardPage`).
- Period KPI strip: separate stats query on the filtered window (`fetchPaymentsDashboardStats`).
- Default date range: current calendar month on first open.
- Ledger headline cards: `useOrganizationReceivablesSummary` (set-based RPC). CN card deferred via `useOrganizationCustomerAccountTotals` after first paint.

## Settings

- Hydrates from shared `useSettings()` cache (no duplicate `settings` fetch on mount).
- `barcode_label_settings` load deferred to Bill tab via `BillTabSheetPresetOptions`.

## Account ledger

- **CustomerLedger** business org list: `get_customer_party_balances` via `buildCustomerLedgerListFromPartyBalances` (replaces full-org sales + voucher crawl for the customer grid).
- **Accounts** page: no longer preloads full-org sales summary when only the Customer Ledger tab is open (`needsSales` excludes `customer-ledger`).

## Verify

1. Product Master — filters populate quickly; catalog page unchanged.
2. Payments — table paints one page; month filter applied; record payment still refreshes list.
3. Settings — Company tab loads without barcode_label_settings request until Bill tab opened.
4. Accounts → Customer Ledger — customer list loads faster; selecting a customer still loads full transaction detail.
