// Shared verification for internal (cron/dispatcher) invocations of edge functions.
//
// Background: `auto-backup` previously trusted an `internalDispatch: true` flag in the
// REQUEST BODY to skip authentication entirely. Since the body is attacker-controlled and
// the function runs with `verify_jwt = false`, any anonymous caller could bypass the
// membership and admin-role checks. This module replaces that flag with a shared secret
// that only the dispatcher (and the cron scheduler) can present.
//
// FAIL-CLOSED: if BACKUP_DISPATCH_SECRET is not configured, this returns false. Internal
// callers then fall through to ticket / service-role / user authentication rather than
// silently leaving the function open.
//
// Additional internal callers (no Edge secret required):
// - pg_cron via a one-time DB ticket header (x-backup-dispatch-ticket)
// - scheduled-backup fan-out presenting the service_role bearer token

export const DISPATCH_SECRET_HEADER = "x-internal-dispatch-secret";
export const DISPATCH_TICKET_HEADER = "x-backup-dispatch-ticket";

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

/**
 * True when Authorization is exactly the project's service_role key.
 * The service role is already full DB access; this only identifies the caller
 * so verify_jwt=false functions do not treat the anon key as internal.
 */
export function isServiceRoleRequest(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (key.length < 32) return false;
  const presented = req.headers.get("Authorization") ?? "";
  return timingSafeEqual(presented, `Bearer ${key}`);
}

/** uuid:64-hex-token from pg_cron dispatch_nightly_backups(). */
export function parseDispatchTicket(value: string): { id: string; token: string } | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{64})$/i
    .exec(value.trim());
  if (!m) return null;
  return { id: m[1], token: m[2] };
}

export function parseDispatchTicketHeader(req: Request): { id: string; token: string } | null {
  return parseDispatchTicket(req.headers.get(DISPATCH_TICKET_HEADER) ?? "");
}

/** pg_net has dropped custom headers in the past — cron also sends `ticket` in the body. */
export function parseDispatchTicketFromBody(body: unknown): { id: string; token: string } | null {
  if (!body || typeof body !== "object") return null;
  const ticket = (body as { ticket?: unknown }).ticket;
  if (typeof ticket !== "string") return null;
  return parseDispatchTicket(ticket);
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

/** Same as internalDispatchHeaders, but empty when the secret is unset (fan-out uses service_role). */
export function optionalInternalDispatchHeaders(): Record<string, string> {
  const configured = Deno.env.get("BACKUP_DISPATCH_SECRET") ?? "";
  if (configured.length < 32) return {};
  return { [DISPATCH_SECRET_HEADER]: configured };
}
