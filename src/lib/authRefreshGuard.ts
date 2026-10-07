/**
 * Balaji Creation (and any shop with several tabs open) was logged out because
 * token refresh ran from every tab. The auth server answered 429, and
 * supabase-js treats that as a dead session and clears the login.
 *
 * This guard runs before the Supabase client is created:
 * - one refresh at a time, including across tabs
 * - a tab that lost the race adopts the rotated session instead of replaying
 *   the old refresh token (replay revokes every browser)
 * - 429 / 502 / 503 / 504 are retried so a rate limit does not sign the user out
 */

export const PROACTIVE_REFRESH_WITHIN_SEC = 120;

const LATEST_REFRESH_KEY = "ezzy-auth-refresh-latest";
const LOCK_NAME = "ezzy-auth-refresh";
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

export type AuthTokenBody = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
};

export function isAuthRateLimitError(
  error: { status?: number; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.status === 429) return true;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests");
}

export function isAuthTokenRefreshUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://placeholder.local");
    return parsed.pathname.endsWith("/token") && parsed.searchParams.get("grant_type") === "refresh_token";
  } catch {
    return url.includes("/token") && url.includes("grant_type=refresh_token");
  }
}

export function readRequestRefreshToken(body: BodyInit | null | undefined): string | undefined {
  if (typeof body !== "string" || !body) return undefined;
  try {
    const parsed = JSON.parse(body) as { refresh_token?: unknown };
    return typeof parsed.refresh_token === "string" ? parsed.refresh_token : undefined;
  } catch {
    return undefined;
  }
}

export function parseAuthTokenBody(raw: string | null | undefined): AuthTokenBody | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthTokenBody;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Replay a rotated session. The token endpoint requires expires_in. */
export function tokenBodyForClient(body: AuthTokenBody, nowSec = Math.floor(Date.now() / 1000)): AuthTokenBody {
  const expiresIn =
    typeof body.expires_in === "number" && body.expires_in > 0
      ? body.expires_in
      : typeof body.expires_at === "number"
        ? Math.max(1, body.expires_at - nowSec)
        : 3600;
  return {
    ...body,
    expires_in: expiresIn,
    token_type: body.token_type || "bearer",
  };
}

/**
 * Another tab already rotated this refresh token. Replaying it revokes the
 * whole login, including other browsers. Adopt the new session instead.
 */
export function decideAuthRefresh(input: {
  requestRefreshToken?: string;
  latest?: AuthTokenBody | null;
}): { adopt: AuthTokenBody } | { fetch: true } {
  const latestToken = input.latest?.refresh_token;
  const requestToken = input.requestRefreshToken;
  if (
    latestToken &&
    requestToken &&
    latestToken !== requestToken &&
    typeof input.latest?.access_token === "string"
  ) {
    return { adopt: tokenBodyForClient(input.latest) };
  }
  return { fetch: true };
}

export async function fetchWithAuthRateLimitRetry(
  run: () => Promise<Response>,
  options?: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> },
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: Response | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(700 * 2 ** (attempt - 1));
    }
    last = await run();
    const retry = RETRYABLE_STATUS.has(last.status) && attempt < maxAttempts - 1;
    if (!retry) return last;
    try {
      await last.body?.cancel();
    } catch {
      // already consumed or not supported
    }
  }
  return last as Response;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = init?.method;
  if (fromInit) return fromInit.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

let installed = false;
let memoryQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = memoryQueue.then(fn, fn);
  memoryQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request(LOCK_NAME, { mode: "exclusive" }, fn);
  }
  return enqueue(fn);
}

function readLatest(): AuthTokenBody | null {
  try {
    return parseAuthTokenBody(localStorage.getItem(LATEST_REFRESH_KEY));
  } catch {
    return null;
  }
}

function writeLatest(body: AuthTokenBody): void {
  try {
    localStorage.setItem(LATEST_REFRESH_KEY, JSON.stringify(body));
  } catch {
    // private mode / quota
  }
}

/** Install once. Import this module before the Supabase client is created. */
export function installAuthRefreshGuard(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (requestMethod(input, init) !== "POST" || !isAuthTokenRefreshUrl(url)) {
      return original(input, init);
    }

    return withRefreshLock(async () => {
      const requestToken = readRequestRefreshToken(init?.body);
      const decision = decideAuthRefresh({ requestRefreshToken: requestToken, latest: readLatest() });
      if ("adopt" in decision) {
        return new Response(JSON.stringify(decision.adopt), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const response = await fetchWithAuthRateLimitRetry(() => original(input, init));
      if (response.ok) {
        try {
          const body = parseAuthTokenBody(await response.clone().text());
          if (body) writeLatest(body);
        } catch {
          // keep the original response either way
        }
      }
      return response;
    });
  };
}

installAuthRefreshGuard();
