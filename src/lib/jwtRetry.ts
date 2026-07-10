import { supabase } from "@/integrations/supabase/client";

/**
 * Detects whether a Supabase/Postgrest error indicates an expired JWT.
 * Covers all known shapes: PGRST301, status 401, message contains "JWT expired".
 */
export const isJwtExpiredError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err?.message || err?.error_description || "").toString().toLowerCase();
  const code = err?.code || err?.error_code;
  const status = err?.status || err?.statusCode;
  return (
    msg.includes("jwt expired") ||
    msg.includes("jwt is expired") ||
    msg.includes("invalid jwt") ||
    code === "PGRST301" ||
    code === "401" ||
    status === 401
  );
};

/**
 * Proactively refresh the Supabase session if it will expire within `withinSeconds`.
 * Safe to call before any critical write (POS save, invoice save, etc.) — long-idle
 * tabs (POS terminals left visible for hours) can miss the auto-refresh timer, so
 * this catches that gap without waiting for the server to return "JWT expired".
 *
 * Never throws — refresh failures are logged and the caller proceeds; the write
 * will then either succeed on its own or fail with the usual error path.
 */
export async function ensureFreshSupabaseSession(withinSeconds = 120): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.expires_at) return;
    const nowSec = Math.floor(Date.now() / 1000);
    if (session.expires_at - nowSec > withinSeconds) return;
    console.log("[auth] Session near expiry — refreshing before critical write");
    await supabase.auth.refreshSession();
  } catch (err) {
    console.warn("[auth] Proactive session refresh failed (non-blocking):", err);
  }
}

/**
 * Wraps a Supabase call so that, if it fails with a JWT-expired error,
 * the session is refreshed once and the operation is retried.
 *
 * Usage:
 *   const { data, error } = await withJwtRetry(() =>
 *     supabase.from("table").insert(row).select().single()
 *   );
 */
export async function withJwtRetry<T>(
  fn: () => PromiseLike<T>
): Promise<T> {
  const result: any = await fn();
  if (result && isJwtExpiredError(result.error)) {
    console.warn("JWT expired during operation — refreshing session and retrying once");
    try {
      await supabase.auth.refreshSession();
    } catch (refreshErr) {
      console.error("Session refresh failed during JWT retry:", refreshErr);
      return result;
    }
    return await fn();
  }
  return result;
}