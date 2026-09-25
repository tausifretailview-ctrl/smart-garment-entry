import { describe, expect, it } from "vitest";
import { resolveTabCachePath } from "@/lib/tabPageRegistry";
import {
  getTabLoadTimeoutMs,
  HEAVY_TAB_LOAD_TIMEOUT_MS,
  shouldShowTabLoadTimeout,
  shouldSoftRetryChunk,
  SOFT_LOADING_HINT_MS,
  STALE_IN_FLIGHT_MS,
  TAB_LOAD_TIMEOUT_MS,
} from "@/lib/tabLoadTimeout";

describe("tab load timeout", () => {
  it("gives heavy tabs the stale window plus a full default budget, not 45s", () => {
    expect(HEAVY_TAB_LOAD_TIMEOUT_MS).toBe(STALE_IN_FLIGHT_MS + TAB_LOAD_TIMEOUT_MS);
    expect(HEAVY_TAB_LOAD_TIMEOUT_MS).toBe(10_000);
    expect(HEAVY_TAB_LOAD_TIMEOUT_MS).toBeGreaterThan(TAB_LOAD_TIMEOUT_MS);
    expect(HEAVY_TAB_LOAD_TIMEOUT_MS).toBeLessThan(15_000);
  });

  it("resolves purchase entry and purchase bills to the heavy budget", () => {
    expect(resolveTabCachePath("purchase-entry")).toBe("purchase-entry");
    expect(resolveTabCachePath("/purchase-entry")).toBe("purchase-entry");
    expect(resolveTabCachePath("purchase-bills")).toBe("purchase-bills");
    expect(resolveTabCachePath("purchase-bill-dashboard")).toBe("purchase-bills");

    for (const path of [
      "purchase-entry",
      "/purchase-entry",
      "purchase-bills",
      "/purchase-bills",
      "purchase-bill-dashboard",
    ]) {
      expect(getTabLoadTimeoutMs(path)).toBe(HEAVY_TAB_LOAD_TIMEOUT_MS);
    }
  });

  it("keeps a normal tab on the 6s card", () => {
    expect(getTabLoadTimeoutMs("customers")).toBe(TAB_LOAD_TIMEOUT_MS);
    expect(shouldShowTabLoadTimeout(6_000, "customers")).toBe(true);
    expect(shouldShowTabLoadTimeout(6_000, "purchase-entry")).toBe(false);
    expect(shouldShowTabLoadTimeout(10_000, "purchase-bills")).toBe(true);
  });

  it("still soft-retries at 3s on heavy paths", () => {
    expect(SOFT_LOADING_HINT_MS).toBe(3_000);
    expect(shouldSoftRetryChunk(2_999)).toBe(false);
    expect(shouldSoftRetryChunk(3_000)).toBe(true);
    expect(shouldShowTabLoadTimeout(3_000, "purchase-entry")).toBe(false);
    expect(shouldShowTabLoadTimeout(3_000, "purchase-bills")).toBe(false);
  });
});
