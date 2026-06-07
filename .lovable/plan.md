## Diagnosis

The hosted backend is currently healthy. The screenshots match the app’s own startup timeout screen, not a confirmed backend outage.

The app shows this screen when `AuthContext` does not resolve `supabase.auth.getSession()` within 10 seconds after refresh/reload. On slower networks, Windows/desktop WebView, browser profile issues, token refresh delays, or temporary auth/network stalls, this creates a false “Connection Problem” even if the backend is up.

A second related issue exists in `OrganizationContext`: organization loading times out after 6 seconds and can also produce a connection-style failure during reload.

## Plan

1. **Make startup auth more tolerant**
   - Replace the fixed 10-second hard failure with a staged startup:
     - keep showing the boot/loading state longer during initial reload
     - only show the full “Connection Problem” after a stronger timeout
     - avoid immediately failing while the browser is still restoring local session data

2. **Improve Retry behavior**
   - Make the Retry button attempt `getSession()` and, if needed, `refreshSession()` with retry/backoff.
   - Clear stale auth refresh locks before retrying.
   - Keep the selected organization slug intact so users return to the right shop after recovery.

3. **Reduce false organization fetch failures**
   - Increase the organization fetch timeout from 6 seconds to a safer value.
   - Use cached organization data as a temporary fallback when the network is slow, instead of blanking the app immediately.
   - Keep the existing secure backend query as the source of truth once it succeeds.

4. **Add lightweight diagnostics**
   - Log whether the failure was session timeout, refresh timeout, org fetch timeout, or true network offline.
   - This helps identify whether future reports are browser/network/auth-token related instead of guessing.

5. **Do not change database or backend rules**
   - No schema changes are needed.
   - The issue is in frontend startup resilience and timeout handling.