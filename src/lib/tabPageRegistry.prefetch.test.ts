import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TAB_PAGE_REGISTRY,
  prefetchTabPage,
  resolveTabCachePath,
  shouldAllowSpeculativeChunkPrefetch,
} from "./tabPageRegistry";

/** Mirrors TabCachedPages.resolveTabLoadShell — every registry route must map. */
function resolveTabLoadShell(path: string): "entry" | "dashboard" | "page" {
  const resolved = resolveTabCachePath(path);
  const def = TAB_PAGE_REGISTRY[resolved];
  if (resolved === "" || resolved === "dashboard") return "dashboard";
  if (!def) return "page";
  if (def.layout === "pos") return "entry";
  if (resolved === "sales-invoice" || resolved.endsWith("-entry")) return "entry";
  return "dashboard";
}

describe("tab load shell coverage", () => {
  it("maps every TAB_PAGE_REGISTRY key to entry or dashboard shell (no bare-spinner routes)", () => {
    const keys = Object.keys(TAB_PAGE_REGISTRY);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      const shell = resolveTabLoadShell(key);
      expect(shell === "entry" || shell === "dashboard").toBe(true);
    }
  });

  it("classifies bill-entry screens as entry shell", () => {
    expect(resolveTabLoadShell("pos-sales")).toBe("entry");
    expect(resolveTabLoadShell("purchase-entry")).toBe("entry");
    expect(resolveTabLoadShell("product-entry")).toBe("entry");
    expect(resolveTabLoadShell("sales-invoice")).toBe("entry");
  });

  it("maps settings and user-rights to dashboard shell", () => {
    expect(resolveTabLoadShell("settings")).toBe("dashboard");
    expect(resolveTabLoadShell("user-rights")).toBe("dashboard");
  });
});

describe("speculative vs intent prefetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWebNavigator(connection: { saveData?: boolean; effectiveType?: string }) {
    vi.stubGlobal("window", { electronAPI: undefined });
    vi.stubGlobal("navigator", { connection });
  }

  it("skips speculative prefetch on Save-Data", () => {
    stubWebNavigator({ saveData: true, effectiveType: "4g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(false);
  });

  it("skips speculative prefetch on 2g", () => {
    stubWebNavigator({ saveData: false, effectiveType: "2g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(false);
  });

  it("allows speculative prefetch on typical broadband", () => {
    stubWebNavigator({ saveData: false, effectiveType: "4g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(true);
  });

  it("intent prefetch still runs when Save-Data would block speculative", () => {
    stubWebNavigator({ saveData: true, effectiveType: "2g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(false);
    // Must not throw; silent catch on failure.
    expect(() => prefetchTabPage("user-rights", { intent: true })).not.toThrow();
    expect(() => prefetchTabPage("settings")).not.toThrow();
  });
});
