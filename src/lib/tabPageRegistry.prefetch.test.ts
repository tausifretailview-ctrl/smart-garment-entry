import { describe, expect, it } from "vitest";
import { TAB_PAGE_REGISTRY, resolveTabCachePath } from "./tabPageRegistry";

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
});
