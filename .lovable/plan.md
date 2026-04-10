

## Audit Results: Purchase Bill Edit & Stock Mismatch

### Root Cause Found

**Two distinct bugs cause phantom stock additions when modifying purchase bills:**

### Bug 1: Duplicate Bills Create Double Stock (CRITICAL)

Evidence from org `3fdca631` (12 drifted variants):
- Bills B0226007 and B0226008: same supplier ("AA Production"), same date, same ₹36,650 amount, created 1 hour apart
- Both contain identical items pointing to the **same variant IDs** (e.g., barcode `0090001094`)
- Each bill's INSERT trigger added +1 stock, so variant shows stock=1 after being sold once (should be 0)

**Why it happens:** No duplicate detection when saving a new bill. Users can navigate to an old bill, then create a new bill with the same items — or simply double-click Save — and the system creates a second bill with the same `sku_id` references. Each INSERT into `purchase_items` fires the stock trigger independently.

### Bug 2: Update Trigger Ignores `sku_id` Changes (LATENT)

The `handle_purchase_item_update` trigger (line 175) only checks:
```sql
IF OLD.qty = NEW.qty THEN RETURN NEW;
```
If someone edits a purchase item and changes its variant (e.g., wrong size selected), the trigger would:
- Add the qty difference to the **NEW** sku_id
- Never deduct from the **OLD** sku_id

However, the app code currently doesn't send `sku_id` in updates (line 2292-2305), so this is latent.

### Current Impact Across All Organizations

| Orgs with drift | Total drifted variants |
|-----------------|----------------------|
| 11 organizations | 34 variants total |

Most drift is small (+1 per variant), from duplicate bill creation.

### Fix Plan

**Step 1: Database migration — Fix the update trigger to handle sku_id changes**

Update `handle_purchase_item_update()` to:
- If `OLD.sku_id != NEW.sku_id`: deduct OLD.qty from OLD.sku_id, add NEW.qty to NEW.sku_id
- If `OLD.qty != NEW.qty` (same sku_id): apply difference as before

**Step 2: Add duplicate bill prevention in PurchaseEntry.tsx**

Before saving a new bill, check if a bill with the same supplier + same date + similar amount already exists for this organization. If found, warn the user with a confirmation dialog.

**Step 3: Add sku_id to the update payload (PurchaseEntry.tsx)**

In the edit save flow (~line 2292), include `sku_id` and `size` in the update payload so variant changes during edits are properly tracked by the trigger.

**Step 4: Fix the 34 drifted variants**

Run the existing `reset_stock_from_transactions` RPC or a targeted fix query to correct the 34 variants with stock drift. This is a one-time data cleanup.

### Files Modified

- `src/pages/PurchaseEntry.tsx` — duplicate bill warning + sku_id in update payload
- Database migration — update trigger fix + data cleanup for 34 variants

### What Won't Change
- Insert trigger logic (working correctly)
- Delete trigger logic (working correctly)
- Size grid, barcode generation, Excel import flows

