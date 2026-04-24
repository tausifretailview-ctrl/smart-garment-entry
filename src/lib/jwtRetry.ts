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