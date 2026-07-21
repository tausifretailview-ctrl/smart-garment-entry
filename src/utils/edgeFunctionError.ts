/**
 * Extract a useful message from supabase.functions.invoke failures.
 * Non-2xx responses often only surface as "Edge Function returned a non-2xx status code"
 * while the real `{ error: "..." }` body is on `error.context` or sometimes in `data`.
 */
export async function getEdgeFunctionErrorMessage(
  error: unknown,
  data?: unknown,
  fallback = "Request failed",
): Promise<string> {
  if (data && typeof data === "object" && data !== null) {
    const bodyError = (data as { error?: unknown }).error;
    if (typeof bodyError === "string" && bodyError.trim()) {
      return bodyError.trim();
    }
  }

  if (error && typeof error === "object") {
    const err = error as { message?: string; context?: Response };
    if (err.context && typeof err.context.json === "function") {
      try {
        const body = await err.context.json();
        if (typeof body?.error === "string" && body.error.trim()) {
          return body.error.trim();
        }
        if (typeof body?.message === "string" && body.message.trim()) {
          return body.message.trim();
        }
      } catch {
        /* ignore parse errors */
      }
    }

    // Clone-safe: some clients expose context as already-parsed body
    const ctx = err.context as unknown;
    if (ctx && typeof ctx === "object" && !("json" in (ctx as object))) {
      const bodyError = (ctx as { error?: unknown }).error;
      if (typeof bodyError === "string" && bodyError.trim()) {
        return bodyError.trim();
      }
    }

    if (typeof err.message === "string" && err.message.trim()) {
      const msg = err.message.trim();
      if (!/edge function returned a non-2xx/i.test(msg)) {
        return msg;
      }
    }
  }

  return fallback;
}
