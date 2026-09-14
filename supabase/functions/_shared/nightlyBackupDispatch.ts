/** Pure helpers for staggered nightly backup fan-out + rate-limit retry.
 * Kept free of Deno/Supabase I/O so Vitest can cover the policy. */

/** Spread org starts across this window (ms). Kept under typical edge wall-clock. */
export const NIGHTLY_DISPATCH_STAGGER_WINDOW_MS = 90_000;

/** Minimum gap between org dispatch attempts once their stagger slot is due. */
export const NIGHTLY_DISPATCH_MIN_GAP_MS = 2_000;

/** Soft deadline so a long rate-limit wait still leaves room for catch-up crons. */
export const NIGHTLY_DISPATCH_SOFT_DEADLINE_MS = 120_000;

/** Default when the platform says "retry after ~60 seconds" without a precise ms. */
export const NIGHTLY_DISPATCH_DEFAULT_RETRY_AFTER_MS = 60_000;

export const NIGHTLY_DISPATCH_MAX_RATE_LIMIT_RETRIES = 2;

export type NightlyDispatchResult = {
  orgId: string;
  dispatched: boolean;
  status?: number;
  error?: string;
  attempts?: number;
  deferred?: boolean;
};

/** FNV-1a 32-bit — stable, fast, no crypto dependency. */
export function hashOrganizationId(orgId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < orgId.length; i++) {
    h ^= orgId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic offset inside the stagger window for one org. */
export function orgDispatchOffsetMs(
  orgId: string,
  windowMs = NIGHTLY_DISPATCH_STAGGER_WINDOW_MS,
): number {
  if (windowMs <= 0) return 0;
  return hashOrganizationId(orgId) % windowMs;
}

/** Sort by stagger offset, then org id — stable nightly order. */
export function sortOrgsForStaggeredDispatch<T extends { organization_id: string }>(
  orgs: T[],
  windowMs = NIGHTLY_DISPATCH_STAGGER_WINDOW_MS,
): T[] {
  return [...orgs].sort((a, b) => {
    const da = orgDispatchOffsetMs(a.organization_id, windowMs);
    const db = orgDispatchOffsetMs(b.organization_id, windowMs);
    if (da !== db) return da - db;
    return a.organization_id.localeCompare(b.organization_id);
  });
}

export function isSuccessfulDispatchStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** HTTP 546 = Supabase Edge WORKER_RESOURCE_LIMIT (CPU/memory), not a CDN invent. */
export function isWorkerResourceLimitStatus(status: number): boolean {
  return status === 546;
}

export function isRateLimitStatus(status: number): boolean {
  return status === 429;
}

/**
 * Detect Supabase nested-function RateLimitError (thrown on fetch) and HTTP 429.
 * Message text often includes "retry after ~60 seconds".
 */
export function isRateLimitFailure(
  err: unknown,
  status?: number,
  bodyText?: string | null,
): boolean {
  if (typeof status === "number" && isRateLimitStatus(status)) return true;

  if (err && typeof err === "object") {
    const e = err as { name?: string; message?: string; retryAfterMs?: number };
    if (e.name === "RateLimitError") return true;
    if (typeof e.retryAfterMs === "number" && e.retryAfterMs > 0) return true;
    if (typeof e.message === "string" && /rate.?limit/i.test(e.message)) return true;
    if (typeof e.message === "string" && /retry after/i.test(e.message)) return true;
  }

  if (typeof bodyText === "string" && /rate.?limit|retry after/i.test(bodyText)) {
    return true;
  }

  return false;
}

/**
 * Honor the platform's retry hint. Prefer `retryAfterMs` on the error, then
 * Retry-After header, then "retry after ~N seconds" in the message/body,
 * else the documented ~60s default.
 */
export function resolveRetryAfterMs(opts: {
  err?: unknown;
  retryAfterHeader?: string | null;
  bodyText?: string | null;
  fallbackMs?: number;
}): number {
  const fallback = opts.fallbackMs ?? NIGHTLY_DISPATCH_DEFAULT_RETRY_AFTER_MS;

  if (opts.err && typeof opts.err === "object") {
    const retryAfterMs = (opts.err as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      return Math.ceil(retryAfterMs);
    }
    const msg = (opts.err as { message?: unknown }).message;
    if (typeof msg === "string") {
      const fromMsg = parseRetryAfterSeconds(msg);
      if (fromMsg != null) return fromMsg;
    }
  }

  if (opts.retryAfterHeader) {
    const header = opts.retryAfterHeader.trim();
    if (/^\d+$/.test(header)) {
      return Math.max(1, parseInt(header, 10)) * 1000;
    }
    const asDate = Date.parse(header);
    if (Number.isFinite(asDate)) {
      return Math.max(1, asDate - Date.now());
    }
  }

  if (opts.bodyText) {
    const fromBody = parseRetryAfterSeconds(opts.bodyText);
    if (fromBody != null) return fromBody;
  }

  return fallback;
}

function parseRetryAfterSeconds(text: string): number | null {
  const m = /retry after\s*~?\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|ms|milliseconds?)?/i.exec(
    text,
  );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? "seconds").toLowerCase();
  if (unit.startsWith("ms") || unit.startsWith("millisecond")) return Math.ceil(n);
  return Math.ceil(n * 1000);
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
