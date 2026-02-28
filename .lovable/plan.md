

# Fix: Customer Search Not Finding Results

## Problem

The "Ella Noor" organization reports that customer search is not finding customers. There are two issues:

1. **Query limit of 101 rows**: The search query uses `.limit(101)`, meaning if the search term matches more than 100 customers, results are truncated and the specific customer may not appear.

2. **Special characters in search terms break PostgREST filters**: If a customer name or phone contains special characters (like `.`, `,`, `(`, `)`), the `.or()` filter string can break silently and return 0 results instead of throwing an error.

3. **No sanitization of search input**: The search term is directly interpolated into the PostgREST filter string without escaping special characters.

## Solution

### 1. Increase limit and add proper input sanitization (src/hooks/useCustomerSearch.tsx)

- Increase the query limit from 101 to 201 (show up to 200 results)
- Sanitize the search term to escape PostgREST special characters (commas, parentheses, dots in filter context)
- Add a fallback: if the `.or()` filter returns 0 results, retry with just `customer_name.ilike` to catch cases where the combined filter breaks

### 2. Improve search ordering for relevance

- Order results so exact matches and "starts with" matches appear first, before "contains" matches
- This ensures the most relevant customer appears in the top results even with the limit

## Technical Details

### File: `src/hooks/useCustomerSearch.tsx`

Changes:
- Sanitize search term by escaping characters that are special in PostgREST filter syntax (commas become encoded, parentheses escaped)
- Increase `.limit(101)` to `.limit(201)` and adjust `hasMore` threshold from 100 to 200
- Add proper error handling so if the `.or()` query fails, fallback to a simpler `customer_name.ilike` only query

### Files affected
| File | Change |
|------|--------|
| `src/hooks/useCustomerSearch.tsx` | Sanitize search input, increase limit to 200, add fallback query |

## Expected Outcome
- Customers will be found even in organizations with 2000+ customers
- Search terms with special characters will not break the query
- Users see up to 200 matching results instead of 100
