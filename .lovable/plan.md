

# Performance Optimization: POS Billing and Sales Invoice

## Problem
Users running POS in 2-3 browser tabs experience severe slowness: customers not showing after selection, products not appearing after barcode scan, and overall lag. Root causes are heavy polling, oversized query payloads, and unnecessary re-searching after customer selection.

## Changes

### File 1: `src/pages/POSSales.tsx`

**1a. Remove `batch_stock` from POS product query (line ~728)**
Remove the nested `batch_stock (bill_number, quantity, purchase_date)` from the product variants select. This data is only needed for stock reports, not for billing. This significantly reduces payload size.

**1b. Trim today's sales query payload (line ~636)**
Replace `*, sale_items (*)` with only the header columns needed for the sales navigation sidebar:
`id, sale_number, sale_date, net_amount, paid_amount, payment_status, customer_name, customer_phone, payment_method, created_at, sale_type, customer_id, round_off, flat_discount_percent, flat_discount_amount, sale_return_adjust, salesman, notes`
Remove the `sale_items` join entirely.

**1c. Increase caching intervals**
- POS products query: `staleTime` from 60s to 300s (5 min), add `refetchOnWindowFocus: false`
- Today's sales query: `staleTime` from 30s to 120s (2 min), add `refetchOnWindowFocus: false`
- Change `posRefetchInterval` base from 60s to 300s (5 min)

**1d. Fix customer search UI freeze**
- Add a `customerJustSelected` useRef
- Set it to `true` when a customer is picked from the dropdown
- Pass `enabled: !customerJustSelected.current` option to `useCustomerSearch` so the hook skips querying when the name was just populated from a selection (not typed)
- Reset the ref after 500ms

### File 2: `src/hooks/useCustomerSearch.tsx`

No changes needed -- the hook already accepts `options.enabled` which can be used to suppress queries.

## Technical Summary

| Area | Before | After |
|------|--------|-------|
| Product payload | Includes `batch_stock` nested data | Removed -- only variant billing fields |
| Sales payload | `*, sale_items (*)` (all columns + all line items) | Header columns only, no line items |
| Product staleTime | 60s | 5 min |
| Sales staleTime | 30s | 2 min |
| Polling interval | 60s per tab | 5 min per tab |
| Window focus refetch | Yes (default) | Disabled |
| Customer re-search | Fires on every name change (including selection) | Skipped for 500ms after dropdown selection |

## Expected Outcome
- 5x fewer background queries per tab (3 tabs = 15x reduction total)
- Dramatically smaller payloads (no batch_stock, no sale_items)
- Customer appears instantly after selection without triggering a re-search
- Multi-tab POS usage becomes smooth

