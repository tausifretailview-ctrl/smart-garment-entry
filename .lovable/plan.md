

# Plan: Fix HSN Summary Report Blank Data

## Problem Identified
The HSN Summary report shows blank or default values ("00000000" for HSN Code) because the `fetchAllSaleItems` function in `src/utils/fetchAllRows.ts` does not include the `hsn_code` field in its database query.

The database **does contain** HSN codes (e.g., "64029990" for footwear), but they are never fetched, causing the report to display incorrect aggregations.

## Root Cause
In `src/utils/fetchAllRows.ts` line 294:
```typescript
.select("variant_id, quantity, line_total, gst_percent, product_id, product_name, sale_id")
```

The `hsn_code` column is **missing** from the select statement.

## Solution

### Step 1: Update fetchAllSaleItems Function
Add `hsn_code` to the select statement in `src/utils/fetchAllRows.ts`:

| Location | Current | Change To |
|----------|---------|-----------|
| Line 294 | `"variant_id, quantity, line_total, gst_percent, product_id, product_name, sale_id"` | `"variant_id, quantity, line_total, gst_percent, product_id, product_name, sale_id, hsn_code"` |

### Step 2: Verify Usage in GSTReports.tsx
The HSN Summary generation code (line 469) already correctly accesses `item.hsn_code`:
```typescript
const hsnCode = item.hsn_code || "00000000";
```

Once the field is included in the fetch, this will work correctly.

## Files to Modify
| File | Change |
|------|--------|
| `src/utils/fetchAllRows.ts` | Add `hsn_code` to the select fields in `fetchAllSaleItems` function (line 294) |

## Expected Result
After this fix:
- HSN Summary will display actual HSN codes from sale items (e.g., "64029990")
- Products will be grouped by their real HSN codes instead of all being grouped under "00000000"
- GST calculations will remain accurate as they already work correctly

