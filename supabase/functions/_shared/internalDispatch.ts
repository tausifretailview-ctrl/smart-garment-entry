// Shared verification for internal (cron/dispatcher) invocations of edge functions.
//
// Background: `auto-backup` previously trusted an `internalDispatch: true` flag in the
// REQUEST BODY to skip authentication entirely. Since the body is attacker-controlled and
// the function runs with `verify_jwt = false`, any anonymous caller could bypass the
// membership and admin-role checks. This module replaces that flag with a shared secret
// that only the dispatcher (and the cron scheduler) can present.
//
// FAIL-CLOSED: if BACKUP_DISPATCH_SECRET is not configured, this returns false. Internal
// callers then fall through to normal user authentication and fail loudly, rather than
// silently leaving the function open.

export const DISPATCH_SECRET_HEADER = "x-internal-dispatch-secret";

/** Constant-time string comparison. Length is not secret here. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/**
 * True only when the caller presented the configured dispatch secret.
 * Never derive this from the request body.
 */
export function isInternalDispatch(req: Request): boolean {
  const configured = Deno.env.get("BACKUP_DISPATCH_SECRET") ?? "";
  if (configured.length < 32) {
    // Unset, or too weak to be meaningful. Treat as "not internal".
    if (configured.length > 0) {
      console.error(
        "BACKUP_DISPATCH_SECRET is set but shorter than 32 chars - refusing to honour it",
      );
    }
    return false;
  }
  const presented = req.headers.get(DISPATCH_SECRET_HEADER) ?? "";
  if (!presented) return false;
  return timingSafeEqual(presented, configured);
}

/** Headers an internal caller must send. Throws if the secret is not configured. */
export function internalDispatchHeaders(): Record<string, string> {
  const configured = Deno.env.get("BACKUP_DISPATCH_SECRET") ?? "";
  if (configured.length < 32) {
    throw new Error(
      "BACKUP_DISPATCH_SECRET is not configured (min 32 chars) - cannot dispatch internally",
    );
  }
  return { [DISPATCH_SECRET_HEADER]: configured };
}
