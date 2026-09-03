import { describe, expect, it } from "vitest";
import { destinationsWithNoWatchdog, uniqueRegistryPaths } from "./layoutCrossingAudit";
import { shouldSilentTabSuspenseFallback } from "./tabCacheReadiness";
import { resolveTabLoadShell, type TabLoadShell } from "./tabLoadShell";
import { tabLoadMessage } from "./tabLoadLabels";

const SHELLS: TabLoadShell[] = ["entry", "dashboard", "page"];

describe("resolveTabLoadShell", () => {
  it("maps every tab-cache path to a named shell", () => {
    const paths = uniqueRegistryPaths();
    expect(paths.length).toBeGreaterThan(70);
    for (const path of paths) {
      const shell = resolveTabLoadShell(path);
      expect(SHELLS, path).toContain(shell);
      expect(tabLoadMessage(path, shell).length, path).toBeGreaterThan(0);
    }
  });

  it("never silences Suspense on cold nav (no painted sibling)", () => {
    for (const path of uniqueRegistryPaths()) {
      const silent = shouldSilentTabSuspenseFallback(false, resolveTabLoadShell(path));
      expect(silent, path).toBe(false);
    }
  });

  it("never silences POS / bill-entry shells even when a sibling is painted", () => {
    const entry = uniqueRegistryPaths().filter((p) => resolveTabLoadShell(p) === "entry");
    expect(entry).toEqual(
      expect.arrayContaining([
        "pos-sales",
        "pos-delivery-challan",
        "sales-invoice",
        "purchase-entry",
        "sale-return-entry",
      ]),
    );
    for (const path of entry) {
      expect(shouldSilentTabSuspenseFallback(true, resolveTabLoadShell(path)), path).toBe(false);
    }
  });

  it("treats Insights (not in the tab registry) as a page shell, not empty", () => {
    expect(resolveTabLoadShell("insights")).toBe("page");
    expect(shouldSilentTabSuspenseFallback(false, "page")).toBe(false);
    expect(tabLoadMessage("insights", "page")).toBe("Loading page…");
  });

  it("leaves no registry destination without a watchdog rescue", () => {
    expect(destinationsWithNoWatchdog()).toEqual([]);
  });
});
