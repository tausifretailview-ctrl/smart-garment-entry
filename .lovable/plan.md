# Stop intermittent “Lookup failed — JWT expired” in POS

## Confirmed cause

The message in the Ranawat Bling screenshot comes from the POS product/barcode lookup error handler in `POSSales.tsx`. When a billing screen has remained open long enough for its login token to expire, a product query can return `JWT expired`; that error is shown directly as “Lookup failed”.

The app already contains a shared session-refresh-and-retry utility, and bill saving already refreshes the session before writing. The POS lookup path does not currently use that protection.

## What will change

1. **Recover automatically during product lookup.** Route the POS barcode, product-search, unavailable-stock, legacy IMEI and quick-service lookup requests through the existing one-time JWT refresh/retry protection.
2. **Keep cart behavior safe.** Retry only read-only product lookups, not cart mutations or bill saves, so a refresh cannot add an item twice.
3. **Handle both error forms.** Extend the shared retry helper to recover whether an expired-token response is returned normally or thrown by a lookup helper.
4. **Give a useful fallback.** If refresh fails, show a clear session-expired message asking the cashier to sign in again, instead of exposing “JWT expired”. Other lookup errors retain the normal lookup-failed message.
5. **Add focused tests.** Cover returned and thrown JWT-expiry errors, successful one-time retry, non-auth errors without retry, and failed refresh without repeated requests.

## Validation

- Run the focused session-retry tests and the project type check.
- Verify the POS lookup still adds one product only after a simulated expired first request and successful refreshed retry.
- Confirm non-session lookup failures still use the existing error path.

No billing totals, stock rules, product data, or organization settings will change.
