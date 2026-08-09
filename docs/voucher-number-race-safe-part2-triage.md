# Part 2 triage — document / number generators

**Date:** 2026-08-09  
**Status:** Triage only — no generator migrations in this doc.  
**Depends on:** [Part 1](./voucher-number-race-safe-part1.md) (`generate_voucher_number` + `uq_voucher_entries_number_active`).

## Already safe (skip)

| Area | Why |
|------|-----|
| `generate_voucher_number` (RCP/PAY/EXP/JV/CNT/RF/ARF) | Part 1 — adv lock + EXISTS + unique. App TOCTOU mitigated by `createReceiptVoucher` retry. |
| `generate_sale_number_atomic` / `generate_pos_number_atomic` / custom sale·POS | Adv lock + `uq_sales_org_number_active`. |
| `generate_purchase_bill_number_atomic` | `bill_number_sequences` upsert. |
| `generate_hold_number_atomic` | Sequence + sales unique. |
| `generate_fee_receipt_number` | `fee_receipt_sequence` upsert (RCT series; voucher unique also applies). |
| `generate_next_barcode` | Sequence + EXISTS; org uniqueness is **app**-enforced (DB unique is composite on variant). |

## Pattern for unsafe rows

Almost all remaining RPCs are:

1. Compute IST FY `YY-YY`
2. `SELECT MAX(trailing digits)+1` filtered by `organization_id` + prefix
3. Return string — **no** `pg_advisory_xact_lock`, **no** EXISTS loop
4. App INSERTs in a second round-trip → classic TOCTOU

**Series scope decision for Part 2 implementations:** keep **per-org** numbering (these RPCs already take `p_organization_id`). Lock key should be `hashtext(org_id || ':' || prefix || ':' || fy)` — do **not** silently globalise (would renumber relative to other tenants).

## Inventory

| Function (latest shape) | Prefix | Scope | Lock / EXISTS? | UNIQUE on target | App sites (≈) | Risk | Part 2 action |
|---|---|---|---|---|---|---|---|
| `generate_advance_number` (`20260331191141`) | `ADV/YY-YY/N` | per-org MAX on `customer_advances` | No / No | **None** | ~4 (`useCustomerAdvances`, balance adj/import, RecentBalanceAdjustments) | **HIGH** — money; silent dups | Race-safe RPC + unique `(organization_id, advance_number)` + cleanup |
| `generate_challan_number` (`20260426064822`) | `DC/YY-YY/N` | per-org MAX over `delivery_challans` **and** `sales.sale_number` (POS DC) | No / No | **None** on `delivery_challans.challan_number` (POS side covered by sales unique) | ~3 (DC entry, POS DC, DcSaleTransfer) | **HIGH** | Race-safe RPC + unique on DC `(org, challan_number) WHERE deleted_at IS NULL` |
| `generate_delivery_challan_number` (`20260331191141`) | `DC/YY-YY/N` | per-org MAX on `delivery_challans` only (**stale** vs dual-table) | No / No | none on DC | **0** app callers | **MED** | Alias to `generate_challan_number` or drop |
| `generate_credit_note_number` (`20260331191141`) | `CN/YY-YY/N` | per-org MAX | No / No | `credit_notes_org_number_unique` (org, number) | ~3 (useCreditNotes, FloatingSaleReturn, ensureCreditNote…) | **HIGH** — unique fails save under race | Race-safe RPC + app 23505 retry |
| `generate_sale_return_number` (`20260331191141`) | `SR/YY-YY/N` | per-org MAX | No / No | `sale_returns_organization_return_number_key` | ~2 (SaleReturnEntry, FloatingSaleReturn) | **HIGH** — returns + stock | Race-safe RPC + app retry |
| `generate_purchase_return_number` (`20260331191141`) | `PR/YY-YY/N` | per-org MAX | No / No | `purchase_returns_organization_return_number_key` | ~1 (PurchaseReturnEntry) | **MED** | Race-safe RPC |
| `generate_quotation_number` (`20260331191141`) | `QT/YY-YY/N` | per-org MAX | No / No | `quotations_organization_quotation_number_key` | ~1 (QuotationEntry) | **MED** | Race-safe RPC or unique+retry |
| `generate_sale_order_number` (`20260331191141`) | `SO/YY-YY/N` | per-org MAX | No / No | `sale_orders_organization_order_number_key` | ~1 (SaleOrderEntry — **already 23505 retry**) | **MED** | Race-safe RPC (prefer over app-only) |
| `generate_purchase_order_number` (`20260331191141`) | `PO/YY-YY/N` | per-org MAX | No / No | full UNIQUE(org, order_number) — not soft-delete partial | ~1 (PurchaseOrderEntry) | **MED** | Race-safe RPC; consider partial unique |
| `generate_purchase_bill_number` (non-atomic overloads) | `PUR/YY-YY/N` | per-org MAX | No / No | `purchase_bills_organization_software_bill_no_key` | **0** (app uses atomic) | **LOW** | Wire to atomic or deprecate |
| `generate_receipt_number` | `RCT/YY-YY/N` | per-org MAX on vouchers | No / No | Part 1 unique if used | **0** app | **LOW** | Deprecate — live receipts use `RCP/` via Part 1 |

## Recommended implementation order

1. **`generate_advance_number`** — money path, **no unique**, silent duplicates possible (same class as pre–Part 1 vouchers).
2. **`generate_challan_number`** (+ alias/fix `generate_delivery_challan_number`) — concurrent POS/DC; DC table unprotected.
3. **`generate_credit_note_number`** — money/CN; unique only fails the save today.
4. **`generate_sale_return_number`** — returns + stock; unique only.
5. **`generate_sale_order_number`** — then batch PR / QT / PO.

## Live forensic (run before each generator fix)

```sql
-- scripts/part2-number-series-dup-forensic.sql
-- Paste result sets before writing cleanup+unique migrations.
```

See that script for ADV / DC / CN / SR / … group-by-number queries.

## Implementation template (each HIGH item)

Copy Part 1 pattern, but **per-org**:

1. Preflight: count active duplicate groups for that series.
2. Cleanup: rename extras `#d` + short id (must not match trailing-`(\d+)$` MAX extractor).
3. `CREATE UNIQUE INDEX … (organization_id, <number_col>) WHERE deleted_at IS NULL` (or table-appropriate filter).
4. Replace RPC: `pg_advisory_xact_lock(hashtext(org || ':' || prefix || ':' || fy))` + MAX+1 + EXISTS loop.
5. App: 23505 retry on insert where TOCTOU remains (allocate RPC then separate INSERT) — same lesson as Part 1 receipts.
6. Smoke: two parallel sessions / cashiers allocate distinct numbers; forced collision hits unique.

## Explicit non-goals for Part 2.0

- Changing ADV/DC/… to a **global** series.
- Barcode org uniqueness in DB (composite index + app `checkBarcodeExists` stays).
- Rewriting historical `#d` labels in ledgers.
