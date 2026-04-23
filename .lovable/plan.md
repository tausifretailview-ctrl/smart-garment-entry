

## Investigation: Duplicate March Purchase Bills

### What's Actually Happening

I queried the database to find duplicates. **There is no auto-import process creating purchase bills.** The duplication is human re-entry, but the system isn't preventing it. Two distinct patterns:

**Pattern A — VELVET EXCLUSIVE (the real bug visible in your screenshot)**
- 3 bills `PUR/26-27/26`, `/27`, `/28`, supplier `OPENING STOCK`, all dated `01-Mar-2026`
- All 3 created on `11-Apr-2026` between `09:52` and `10:19` (27-minute window)
- Same barcodes (`150007516`–`150007522`), same quantities, same `sku_id`
- Stock for barcode `150007516` = **15** (5 added 3 times) instead of expected **5**
- Cause: user opened the Purchase Entry screen and clicked Save 3 times (or re-imported the same Excel) — every save inserts new rows and the `purchase_items_after_insert` trigger adds stock again. Nothing stops it.

**Pattern B — BOMBAY COLDCHAIN (legitimate, do NOT block)**
- Same SKUs (COW MILK, CURD, etc.) appear in 8–16 different bills across March
- Different days, different `supplier_invoice_no`, different bill_dates → daily restock business. Correct.

### Root Cause
Purchase Entry has **no duplicate-bill guard**. A user can save the same supplier + supplier_invoice_no + date twice (or any number of times) and the trigger will inflate stock every time.

### The Fix

**1. Pre-save duplicate detection (Purchase Entry)**
Before inserting a new `purchase_bills` row, query existing non-deleted, non-cancelled bills with the same `(organization_id, supplier_id OR supplier_name, supplier_invoice_no, bill_date)`. If found, show a blocking dialog:

> "A bill from this supplier with invoice no. **{X}** dated **{date}** already exists (Bill: {software_bill_no}, Total: ₹{amount}). Saving again will double-count stock. Choose: **Open Existing**, **Save Anyway** (requires Cancel Invoice permission), or **Cancel**."

This catches the VELVET case (supplier_invoice_no 56/57/58 with same date) and any double-click / accidental re-save.

**2. Identical-content detection (cart hash)**
After items are added, compute a hash of `(supplier, date, sorted [barcode|qty|price] list)`. Compare against bills saved in the last 24 hours. If identical, warn the same way. This catches re-imports of the same Excel file.

**3. Save-button debounce / lock**
Disable the Save button immediately on click and keep it disabled until the response returns. Prevents double-click from creating two bills with consecutive numbers.

**4. Cleanup tool for VELVET (and any other affected org)**
Add a one-time admin action in Settings → "Reconcile Duplicate Purchase Bills":
- Lists candidate duplicate groups (same org + supplier + invoice_no + date OR same org + supplier + date + identical item-set saved within 60 minutes)
- For each group, show all 3 bills side-by-side with totals
- "Cancel Duplicates" button uses the existing `cancel_purchase_bill` RPC (which already reverses stock and validates that nothing was sold) to cancel all but the earliest bill
- Result for VELVET: PUR/26-27/27 and /28 get cancelled with strikethrough tag; stock for barcode `150007516` drops from 15 → 5; ledger and GST stay clean.

### Technical Details
- **Files**: `src/pages/PurchaseEntry.tsx` (duplicate check before insert + button lock), `src/pages/Settings.tsx` (new admin tab), one new dialog component `DuplicatePurchaseBillDialog.tsx`
- **DB**: no schema change. New read-only RPC `find_duplicate_purchase_bills(org_id)` for the cleanup tool. Existing `cancel_purchase_bill` RPC handles the reversal.
- **Permissions**: "Save Anyway" override gated on `cancel_invoice` special permission so cashiers can't bypass.
- **No impact on legitimate daily restocks** (BOMBAY COLDCHAIN) — they have different `supplier_invoice_no` and/or different `bill_date`, so the guard never triggers.

### What Will NOT Be Done
- No automatic background job — this is operator error, not auto-generation.
- No hard-deletion of the 3 VELVET bills — they'll be soft-cancelled (with strikethrough tag) so the audit trail stays intact, matching the project's soft-delete policy.

