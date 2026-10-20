/**
 * Last verified roles per user + organization.
 *
 * Every RoleProtectedRoute (all Settings pages, Accounts, Purchase, …) and ~20
 * components call useUserRoles on mount. Without a cache each one waited for two
 * sequential Supabase reads before the page could show, so every page open sat on
 * a spinner, and on a slow line or right after the app reloaded itself the spinner
 * could last many seconds. With this cache a known user + org renders at once and
 * the roles are re-checked quietly in the background.
 *
 * The route gate is a UX guard only: RLS still decides what data comes back, so
 * briefly trusting a cached role is safe. A revoked role is corrected by the
 * background re-check, which then redirects as before.
 */

export type CachedAppRole = "admin" | "manager" | "user" | "platform_admin";

export interface UserRolesCacheEntry {
  roles: CachedAppRole[];
  verifiedAt: number;
}

/** Re-use a verification this recent without asking the database again. */
export const USER_ROLES_FRESH_MS = 60_000;

/** Ignore stored roles older than this (e.g. a laptop left signed in for weeks). */
export const USER_ROLES_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const STORAGE_PREFIX = "ezzy:userRoles:";
const VALID_ROLES = new Set<CachedAppRole>(["admin", "manager", "user", "platform_admin"]);

const memoryCache = new Map<string, UserRolesCacheEntry>();
const inflight = new Map<string, Promise<CachedAppRole[]>>();

export function userRolesCacheKey(userId: string, orgId: string | null | undefined): string {
  return `${userId}|${orgId || "-"}`;
}

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function parseEntry(raw: string | null): UserRolesCacheEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserRolesCacheEntry>;
    if (!Array.isArray(parsed.roles) || typeof parsed.verifiedAt !== "number") return null;
    const roles = parsed.roles.filter((r): r is CachedAppRole =>
      VALID_ROLES.has(r as CachedAppRole),
    );
    return { roles, verifiedAt: parsed.verifiedAt };
  } catch {
    return null;
  }
}

export function readCachedUserRoles(
  key: string,
  now: number = Date.now(),
): UserRolesCacheEntry | null {
  let entry = memoryCache.get(key) ?? null;
  if (!entry) {
    try {
      entry = parseEntry(getStorage()?.getItem(STORAGE_PREFIX + key) ?? null);
    } catch {
      entry = null;
    }
    if (entry) memoryCache.set(key, entry);
  }
  if (!entry) return null;
  if (now - entry.verifiedAt > USER_ROLES_MAX_AGE_MS) return null;
  return entry;
}

export function writeCachedUserRoles(
  key: string,
  roles: CachedAppRole[],
  now: number = Date.now(),
): UserRolesCacheEntry {
  const entry: UserRolesCacheEntry = {
    roles: roles.filter((r) => VALID_ROLES.has(r)),
    verifiedAt: now,
  };
  memoryCache.set(key, entry);
  try {
    getStorage()?.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // storage full / blocked — memory cache still serves this session
  }
  return entry;
}

export function isUserRolesEntryFresh(
  entry: UserRolesCacheEntry | null,
  now: number = Date.now(),
): boolean {
  return !!entry && now - entry.verifiedAt < USER_ROLES_FRESH_MS;
}

/**
 * Share one in-flight verification per key, so ten panes mounting together make
 * one pair of reads instead of ten.
 */
export function dedupeUserRolesLoad(
  key: string,
  load: () => Promise<CachedAppRole[]>,
): Promise<CachedAppRole[]> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = load().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

/** Test helper. */
export function clearUserRolesCacheForTests(): void {
  memoryCache.clear();
  inflight.clear();
  const storage = getStorage();
  if (!storage) return;
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) storage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
