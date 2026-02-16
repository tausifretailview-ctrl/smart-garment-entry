
# Fix: ROLEX (KIDS) Product Missing from Field Sales Search

## Problem
When searching "Rolex" in the Field Sales app, only 3 of 4 products appear. The **ROLEX (KIDS category)** product with 8 in-stock variants is missing.

## Root Cause
The variant query in `SalesmanOrderEntry.tsx` (line 328) has `.limit(30)`, but the 4 matching ROLEX products have a combined **41 variants** with stock. The database returns the first 30 variants (covering ROLEX 36 x2 and ROLEX MN), and the KIDS variants get cut off.

## Fix

### File: `src/pages/salesman/SalesmanOrderEntry.tsx`

**1. Increase variant fetch limit from 30 to 100**
Line 328: Change `.limit(30)` to `.limit(100)` so all variants for matching products are returned.

**2. Increase barcode variant limit from 20 to 50**
Line 313: Change `.limit(20)` to `.limit(50)` for the barcode/color search query.

**3. Increase product limit from 20 to 50**
Line 293: Change `.limit(20)` to `.limit(50)` to handle cases where many products share similar names.

These are safe increases -- the queries are already filtered by organization, active status, and search term, so the result set is inherently small.
