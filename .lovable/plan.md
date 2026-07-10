
## What the user is seeing

Video from RealTaste Catering shows the POS bill save failing with a red toast:

> **Error saving sale — JWT expired**

Cart had service products and a ₹25,596 net amount. The user attributed it to service items, but the actual server response is `JWT expired` (auth token timed out while the tab was left open). Nothing about service products triggers this — any cart type would fail the same way once the token expires.

## Root cause

The POS save path (`src/hooks/useSaveSale.tsx`) does **not** wrap its Supabase inserts in the existing `withJwtRetry` helper. When Supabase returns `JWT expired` (code `PGRST301` / 401), the error bubbles straight to the catch block and shows the toast. The auto-refresh interval failed to fire (tab likely backgrounded on the POS terminal), so the access token was stale by the time the user clicked Save.

We already have `src/lib/jwtRetry.ts` with `withJwtRetry` and `isJwtExpiredError`, but it is only used in one component (`SizeGroupManagement.tsx`).

## Fix

1. **Wrap the critical writes in the sale save flow** (`useSaveSale.tsx`) with `withJwtRetry`, so a single expired-JWT failure triggers `supabase.auth.refreshSession()` and one retry before showing an error:
   - `sales` insert (new sale) and update (edit sale)
   - `sale_items` chunk inserts (via `insertSaleItemsInChunks` — add an optional retry wrapper or call `refreshSession` before the loop if any chunk errors with JWT expired)
   - Receipt voucher / ledger writes that run inside the same save

2. **Detect JWT-expired in the outer `catch`** and, instead of showing `"Error saving sale"`, show a clearer message like `"Session expired — please try Save again"` and proactively call `supabase.auth.refreshSession()` so the next click succeeds without a page reload.

3. **Same treatment for the two sibling save paths** in the file (edit sale, POS-return-adjust) that also emit `Error saving sale`.

4. **Optional hardening (small):** in `AuthContext`, on `visibilitychange → visible`, call `supabase.auth.getSession()` to force an early refresh when the POS tab regains focus, so long-idle POS terminals don't reach save with a dead token.

Out of scope: no schema change, no change to service-product handling (it was a red herring), no change to unrelated pages.

## Files touched

- `src/hooks/useSaveSale.tsx` — wrap sale insert / update / sale_items writes with `withJwtRetry`; friendlier JWT-expired toast.
- `src/utils/insertSaleItemsInChunks.ts` — accept an optional `refreshSession` hook / detect JWT expired per chunk and retry once.
- `src/contexts/AuthContext.tsx` — (optional) refresh session on tab focus.

## Verification

- Manually expire the session in devtools (`localStorage` sb-*-auth-token → set `expires_at` to past), open POS, add a service item, click Save → save should succeed after a silent refresh instead of showing the red toast.
- Existing money tests (`test/money/saleSettlement.test.ts`) continue to pass — logic is unchanged, only retry wrapping is added.
