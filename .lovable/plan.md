

## Audit Report: Cancel Invoice Feature — Gaps Found

### What the `cancel_invoice` RPC Does (Correctly)
1. **Deletes `sale_items`** → triggers `handle_sale_item_delete` → stock is restored ✅
2. **Sets `payment_status = 'cancelled'`** and `is_cancelled = true` ✅
3. **Neutralizes vouchers** → sets `reference_type = 'cancelled_invoice'` for linked receipt vouchers ✅

### Stock Reversal: CORRECT ✅
Stock is properly restored because `sale_items` are hard-deleted, firing the existing stock triggers. Verified — no issues here.

### Payment/Voucher Adjustment: PARTIAL ⚠️
- Receipt vouchers linked to the sale are neutralized (reference_type changed) ✅
- **BUT**: The `paid_amount` on the sale stays at its old value (cosmetic, since `payment_status` is `cancelled` — low risk)
- **Customer balance**: The `reconcile_customer_balances` RPC filters `payment_status NOT IN ('cancelled')` ✅ — so customer balances are correct
- **Customer Ledger** (`CustomerLedger.tsx` line 596): Filters `.neq("payment_status", "hold")` but does **NOT filter `cancelled`** ❌ — cancelled invoices still appear in the customer ledger as active debits

---

### CRITICAL GAPS: Reports Including Cancelled Invoices

**The following pages/functions query `sales` with only `deleted_at IS NULL` but do NOT filter `is_cancelled = true`:**

| # | File | Impact | Severity |
|---|------|--------|----------|
| 1 | **GSTReports.tsx** (line 214) | Cancelled invoices included in GSTR-1, GSTR-3B, HSN summary | **HIGH** |
| 2 | **GSTSalePurchaseRegister.tsx** (lines 142, 157) | Cancelled invoices in GST Sale Register | **HIGH** |
| 3 | **generate-gstr1/index.ts** (line 85) | Edge function includes cancelled invoices in GSTR-1 JSON export | **HIGH** |
| 4 | **SalesAnalyticsDashboard.tsx** (lines 87, 129) | Cancelled sales inflate analytics totals | **MEDIUM** |
| 5 | **SalesReportByCustomer.tsx** (line 60) | Cancelled invoices in customer-wise sales report | **MEDIUM** |
| 6 | **HourlySalesAnalysis.tsx** (line 84) | Cancelled sales inflate hourly analysis | **MEDIUM** |
| 7 | **NetProfitAnalysis.tsx** (lines 155, 282) | Cancelled sale IDs included → but sale_items are deleted so net effect is zero (self-correcting) | **LOW** |
| 8 | **ItemWiseSalesReport.tsx** | Uses `sale_items` join → self-correcting since items are deleted | **LOW** |
| 9 | **DailyTally.tsx** via `fetchAllSalesWithFilters` (line 534) | Cancelled sales inflate daily tally cash/card/UPI totals | **HIGH** |
| 10 | **DailyCashierReport.tsx** | Likely same issue via shared fetch utilities | **MEDIUM** |
| 11 | **CustomerLedger.tsx** (line 596) | Cancelled invoices appear as active debits in ledger | **HIGH** |
| 12 | **POSDashboard.tsx** (line 341) | Cancelled POS sales shown without cancel indicator (no `is_cancelled` filter) | **MEDIUM** |

**Already correct (no fix needed):**
- `get_accounts_dashboard_metrics` RPC — filters `payment_status NOT IN ('cancelled')` ✅
- `reconcile_customer_balances` RPC — filters `payment_status NOT IN ('cancelled')` ✅
- `OwnerReportDetail.tsx` — explicitly filters `.eq("is_cancelled", false)` ✅
- `SalesInvoiceDashboard.tsx` — shows cancelled invoices but marks them visually ✅

---

### Fix Plan (Prioritized by Impact)

**Fix 1 — Add `is_cancelled` filter to all sales queries (8 files)**
Add `.eq("is_cancelled", false)` to every sales query in:
- `GSTReports.tsx` (line 214)
- `GSTSalePurchaseRegister.tsx` (lines 142, 157)
- `generate-gstr1/index.ts` (line 85)
- `SalesAnalyticsDashboard.tsx` (lines 87, 129, 148)
- `SalesReportByCustomer.tsx` (line 60)
- `HourlySalesAnalysis.tsx` (line 84)
- `fetchAllRows.ts → fetchAllSalesWithFilters` (line 534) — this fixes DailyTally and any other consumer

**Fix 2 — Filter cancelled invoices in Customer Ledger**
Add `.neq("payment_status", "cancelled")` or `.eq("is_cancelled", false)` to the sales query in `CustomerLedger.tsx` (lines 592-596) and the payment history query (line 1142).

**Fix 3 — Add cancelled indicator to POSDashboard**
Fetch `is_cancelled` in the POS Dashboard query and show a visual indicator (similar to SalesInvoiceDashboard).

**Fix 4 — Filter cancelled in NetProfitAnalysis (optional)**
Already self-correcting since sale_items are deleted, but adding the filter is cleaner.

### Summary
- **36 cancelled invoices** across 3 organizations are currently leaking into GST reports, daily tally, customer ledger, and analytics
- All fixes are single-line filter additions — low risk, high impact
- No database changes needed

