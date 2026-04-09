

# Plan: Fix Drifted Billing Sequences & Prevent Future Drift

## Problem

The old POS preview code called `generate_pos_number` (which **incremented** the counter) on every page load. This has been fixed to a read-only peek, but **12 organizations still have inflated sequence counters** from the old bug. These need a one-time data correction.

## Affected Organizations (POS/26-27 series only — no INV drift detected)

| Organization | Sequence Counter | Actual Last Invoice | Over by |
|---|---|---|---|
| AJMERA TRADERS | 19 | 7 | +12 |
| AL NISA COUTURE | 37 | 36 | +1 |
| DEMO | 31 | 23 | +8 |
| GLAMARIZE | 67 | 65 | +2 |
| Gurukrupa Silk Sarees | 168 | 166 | +2 |
| PRIYA COLLECTION | 2 | 20 | -18 (under!) |
| SAAJ SILK | 126 | 121 | +5 |
| SACCHI FASHION | 127 | 116 | +11 |
| SM HAIR REPLACEMENT | 321 | 318 | +3 |
| VELVET EXCLUSIVE | 192 | 184 | +8 |
| YOJAK | 199 | 197 | +2 |
| Adtech-Accounts (POS/25-26) | 1 | 19 | -18 (under!) |

## Step 1: One-time data fix — Reset all drifted sequences

Run UPDATE statements to set each organization's `last_number` to match the actual max invoice number from the `sales` table. For "under" cases (Adtech, PRIYA), set to the actual max to prevent duplicates.

## Step 2: Add a safety check in the atomic DB functions

Modify both `generate_pos_number_atomic` and `generate_sale_number_atomic` database functions to add a **self-healing guard**: after incrementing, cross-check against the actual max in `sales` table. If the generated number already exists, skip ahead. This prevents any future drift from causing duplicate numbers.

```sql
-- Inside generate_pos_number_atomic, after incrementing:
-- Check actual max and ensure we're ahead of it
SELECT COALESCE(MAX(CAST(regexp_replace(sale_number, '.*/', '') AS INTEGER)), 0)
INTO actual_max
FROM sales
WHERE organization_id = p_organization_id
AND sale_number LIKE v_series || '/%';

IF v_next_number <= actual_max THEN
  v_next_number := actual_max + 1;
  UPDATE bill_number_sequences SET last_number = v_next_number WHERE ...;
END IF;
```

## Step 3: No frontend code changes needed

The preview logic in `POSSales.tsx` and `SalesInvoice.tsx` already uses read-only peeks. The `generate_*_atomic` functions are only called at save time. No code changes required.

## What will NOT change
- No frontend/UI code modifications
- Purchase bill sequences (no drift detected, different mechanism)
- Any existing invoice numbers or sale records
- The save flow in `useSaveSale.tsx`

