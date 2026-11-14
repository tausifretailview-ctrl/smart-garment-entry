import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { toast } from "@/hooks/use-toast";
import { createAppQueryClient, appPersistOptions } from "@/app/appQueryClient";
import { cleanupCorruptedAuthTokens } from "@/app/appStartup";

/** The app shell pieces moved out of App.tsx (Plan Phase 4, S3) keep their behaviour. */
describe("createAppQueryClient", () => {
  const timeout = { code: "57014", message: "canceling statement due to statement timeout" };

  it("keeps the shared defaults", () => {
    const q = createAppQueryClient().getDefaultOptions().queries!;
    expect(q.staleTime).toBe(60_000);
    expect(q.gcTime).toBe(86_400_000);
    expect(q.refetchOnWindowFocus).toBe(false);
    expect(q.notifyOnChangeProps).toEqual(["data", "error"]);
    const retry = q.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, new Error("network"))).toBe(true); // one retry
    expect(retry(1, new Error("network"))).toBe(false);
    expect(retry(0, timeout)).toBe(false); // timeouts are not retried
  });

  it("shows one toast for a write timeout, throttled", async () => {
    vi.mocked(toast).mockClear();
    const client = createAppQueryClient();
    const fail = () => client.getMutationCache().build(client, { mutationFn: () => Promise.reject(timeout) }).execute(undefined);
    await fail().catch(() => {});
    await fail().catch(() => {});
    expect(toast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({ variant: "destructive" });
  });

  it("never persists failed or sensitive queries", () => {
    const keep = appPersistOptions.dehydrateOptions.shouldDehydrateQuery;
    expect(keep({ state: { status: "error", data: undefined }, queryKey: ["products"] })).toBe(false);
    expect(keep({ state: { status: "success", data: new Map() }, queryKey: ["products"] })).toBe(false);
  });
});

describe("cleanupCorruptedAuthTokens", () => {
  // A browser lists stored keys with Object.keys(localStorage); the test DOM does not.
  function browserLikeStorage() {
    const store: Record<string, string> = {};
    for (const [name, value] of Object.entries({
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => void (store[k] = String(v)),
      removeItem: (k: string) => void delete store[k],
    })) {
      Object.defineProperty(store, name, { value, enumerable: false });
    }
    return store as unknown as Storage;
  }
  afterEach(() => vi.unstubAllGlobals());

  it("removes broken auth tokens and keeps valid ones", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("localStorage", browserLikeStorage());
    localStorage.setItem("sb-a-auth-token", JSON.stringify({ access_token: "x", refresh_token: "y" }));
    localStorage.setItem("sb-b-auth-token", "{not json");
    localStorage.setItem("sb-c-auth-token", JSON.stringify({ access_token: "x" }));
    localStorage.setItem("other", "{not json");
    cleanupCorruptedAuthTokens();
    expect(localStorage.getItem("sb-a-auth-token")).not.toBeNull();
    expect(localStorage.getItem("sb-b-auth-token")).toBeNull();
    expect(localStorage.getItem("sb-c-auth-token")).toBeNull();
    expect(localStorage.getItem("other")).not.toBeNull();
    warn.mockRestore();
  });
});
