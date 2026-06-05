import { supabase } from "@/integrations/supabase/client";

/** Backoff between permission-verify retries (after session refresh). */
export const PERMISSION_VERIFY_BACKOFF_MS = [500, 1500, 3000] as const;

/** Per-attempt fetch timeout before counting as a failed try. */
export const PERMISSION_VERIFY_ATTEMPT_TIMEOUT_MS = 10_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Best-effort JWT refresh before re-querying roles/permissions.
 * Common fix when a backgrounded tab returns with a stale access token.
 */
export async function refreshAuthSessionQuietly(): Promise<void> {
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error && import.meta.env.DEV) {
      console.warn("[resilientPermissionVerify] refreshSession:", error.message);
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[resilientPermissionVerify] refreshSession threw:", e);
    }
  }
  try {
    await supabase.auth.getSession();
  } catch {
    // revalidate only — ignore
  }
}

export function isTransientPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const anyErr = err as {
    message?: string;
    code?: string;
    status?: number;
    name?: string;
  };
  const msg = (anyErr.message ?? "").toLowerCase();
  const code = (anyErr.code ?? "").toUpperCase();

  if (anyErr.name === "AbortError") return true;
  if (msg.includes("permission check timed out")) return true;
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
    return true;
  }
  if (
    msg.includes("jwt") ||
    msg.includes("token") ||
    msg.includes("session") ||
    msg.includes("not authenticated") ||
    msg.includes("unauthorized")
  ) {
    return true;
  }
  if (code === "NETWORK_ERROR" || code === "PGRST301" || code === "42501") return true;
  if (anyErr.status === 401 || anyErr.status === 403 || anyErr.status === 408 || anyErr.status === 429) {
    return true;
  }

  return true;
}

export async function withAttemptTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = PERMISSION_VERIFY_ATTEMPT_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error("Permission check timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
