import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  USER_ROLES_FRESH_MS,
  USER_ROLES_MAX_AGE_MS,
  clearUserRolesCacheForTests,
  dedupeUserRolesLoad,
  isUserRolesEntryFresh,
  readCachedUserRoles,
  userRolesCacheKey,
  writeCachedUserRoles,
  type CachedAppRole,
} from "./userRolesCache";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("userRolesCache", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
    clearUserRolesCacheForTests();
  });

  afterEach(() => {
    clearUserRolesCacheForTests();
    vi.unstubAllGlobals();
  });

  it("keys by user and org", () => {
    expect(userRolesCacheKey("u1", "o1")).not.toBe(userRolesCacheKey("u1", "o2"));
    expect(userRolesCacheKey("u1", null)).toBe(userRolesCacheKey("u1", undefined));
  });

  it("returns what was written and survives a reload via storage", () => {
    const key = userRolesCacheKey("u1", "o1");
    writeCachedUserRoles(key, ["admin"], 1_000);
    expect(readCachedUserRoles(key, 2_000)?.roles).toEqual(["admin"]);

    // Simulate a page reload: memory gone, storage kept.
    const storage = (globalThis as unknown as { window: { localStorage: Storage } }).window
      .localStorage;
    const saved = storage.getItem(`ezzy:userRoles:${key}`);
    clearUserRolesCacheForTests();
    storage.setItem(`ezzy:userRoles:${key}`, saved!);
    expect(readCachedUserRoles(key, 2_000)?.roles).toEqual(["admin"]);
  });

  it("does not leak roles across orgs or users", () => {
    writeCachedUserRoles(userRolesCacheKey("u1", "o1"), ["admin"]);
    expect(readCachedUserRoles(userRolesCacheKey("u1", "o2"))).toBeNull();
    expect(readCachedUserRoles(userRolesCacheKey("u2", "o1"))).toBeNull();
  });

  it("drops unknown roles and very old entries", () => {
    const key = userRolesCacheKey("u1", "o1");
    writeCachedUserRoles(key, ["admin", "owner" as CachedAppRole], 0);
    expect(readCachedUserRoles(key, 10)?.roles).toEqual(["admin"]);
    expect(readCachedUserRoles(key, USER_ROLES_MAX_AGE_MS + 1)).toBeNull();
  });

  it("marks an entry fresh only within the fresh window", () => {
    const entry = writeCachedUserRoles(userRolesCacheKey("u1", "o1"), ["manager"], 0);
    expect(isUserRolesEntryFresh(entry, USER_ROLES_FRESH_MS - 1)).toBe(true);
    expect(isUserRolesEntryFresh(entry, USER_ROLES_FRESH_MS)).toBe(false);
    expect(isUserRolesEntryFresh(null, 0)).toBe(false);
  });

  it("shares one in-flight load per key", async () => {
    let calls = 0;
    let resolve!: (r: CachedAppRole[]) => void;
    const load = () => {
      calls++;
      return new Promise<CachedAppRole[]>((r) => {
        resolve = r;
      });
    };
    const a = dedupeUserRolesLoad("k", load);
    const b = dedupeUserRolesLoad("k", load);
    expect(calls).toBe(1);
    resolve(["admin"]);
    await expect(a).resolves.toEqual(["admin"]);
    await expect(b).resolves.toEqual(["admin"]);

    // After it settles a new call loads again.
    const c = dedupeUserRolesLoad("k", load);
    expect(calls).toBe(2);
    resolve(["user"]);
    await expect(c).resolves.toEqual(["user"]);
  });

  it("clears the in-flight slot when a load fails", async () => {
    await expect(
      dedupeUserRolesLoad("k", () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
    await expect(dedupeUserRolesLoad("k", () => Promise.resolve(["user"]))).resolves.toEqual([
      "user",
    ]);
  });
});
