

## Issue Confirmed: Lucky Sales Barcode Series is Wrong

**What you're seeing**: Barcodes 00000001, 00000002 ... 00000011 (just sequential 8-digit numbers).

**What it should be**: Per the system's organization-prefixed barcode rule, Lucky Sales (organization_number = 25) should generate barcodes starting from **250001001** — i.e., `(25 × 10,000,000) + 1001`.

### Root Cause

The `barcode_sequence` row for Lucky Sales currently holds `next_barcode = 12`. It was seeded incorrectly (started from 1 instead of 250001001), so the `generate_next_barcode` RPC just keeps producing 00000001, 00000002, ... padded to 8 digits.

This likely happened because barcodes were inserted manually (Excel import / trial data) before the org-prefixed sequence was initialized, or the sequence row was reset to 1 during the earlier reset attempt.

### Fix Plan (1 migration)

**Step 1** – Soft-delete the existing trial barcodes in Lucky Sales (00000001 → 00000011) so they don't conflict with the new series. These are clearly trial entries based on your earlier "delete all trial data" request.

**Step 2** – Reset the `barcode_sequence.next_barcode` for Lucky Sales to **250001001** (the correct org-prefixed starting value).

**Step 3** – Verify by calling `generate_next_barcode('<lucky-sales-id>')` once — it should return `250001001`, with the sequence advancing to 250001002.

### After the Fix

Every new product variant created in Lucky Sales (via Product Entry, Purchase Entry, or Excel import) will get a barcode in the **2500010xx** series, matching how every other organization in your system works (e.g., org 1 → 100010xx, org 5 → 500010xx).

### Notes

- No code changes — this is purely a data/sequence reset.
- The `generate_next_barcode` RPC itself is correct; it computes the right starting value, but only on the *first* INSERT into `barcode_sequence`. Since the row already exists with value 12, the org-prefix logic is bypassed. The migration will overwrite that row.
- If you want to **keep** any of the 11 existing barcodes (00000001–00000011), tell me which ones and I'll exclude them from the soft-delete step.

