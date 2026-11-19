/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initialSelection, lastUsedLabel, orderByRecent, stepIndex, touchRecent, windowDetail, withCurrentFirst } from "./windowSwitcher";
import { sketchKind } from "@/components/window-switcher/WindowSwitcher";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Window switcher (Alt+W)", () => {
  it("keeps windows most recently used first", () => {
    let order: string[] = [];
    for (const p of ["purchase-entry", "sales-invoice", "customers", "sales-invoice"]) order = touchRecent(order, p);
    expect(order).toEqual(["sales-invoice", "customers", "purchase-entry"]);
    const windows = [{ path: "" }, { path: "purchase-entry" }, { path: "customers" }, { path: "sales-invoice" }];
    expect(orderByRecent(windows, order).map((w) => w.path)).toEqual(["sales-invoice", "customers", "purchase-entry", ""]);
    expect(touchRecent(Array.from({ length: 25 }, (_, i) => `p${i}`), "x")).toHaveLength(20);
  });

  it("always lists the page on screen first, even if the recent list lags behind", () => {
    const w = [{ path: "customers" }, { path: "sales-invoice" }, { path: "purchase-entry" }];
    expect(withCurrentFirst(w, "purchase-entry").map((x) => x.path)).toEqual(["purchase-entry", "customers", "sales-invoice"]);
    expect(withCurrentFirst(w, "customers")).toBe(w);
    expect(withCurrentFirst(w, "not-open")).toBe(w);
  });

  it("starts on the window used before this one and wraps around", () => {
    expect(initialSelection(3)).toBe(1);
    expect(initialSelection(1)).toBe(0);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  it("says when a window was last used and what it was showing", () => {
    const now = 10_000_000;
    expect(lastUsedLabel(now - 10_000, now)).toBe("Just now");
    expect(lastUsedLabel(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(lastUsedLabel(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(lastUsedLabel(now - 30 * 3_600_000, now)).toBe("Yesterday");
    expect(lastUsedLabel(undefined, now)).toBe("");
    expect(windowDetail("sales-invoice", "?id=abc")).toBe("Editing a saved entry");
    expect(windowDetail("accounts", "?tab=customer-ledger")).toBe("Customer ledger");
    expect(windowDetail("products", "")).toBe("");
  });

  it("draws a bill, chart or list sketch for the kind of page", () => {
    expect(sketchKind("sales-invoice")).toBe("bill");
    expect(sketchKind("purchase-entry")).toBe("bill");
    expect(sketchKind("pos-sales")).toBe("bill");
    expect(sketchKind("")).toBe("chart");
    expect(sketchKind("stock-report")).toBe("chart");
    expect(sketchKind("customers")).toBe("list");
  });

  it("is mounted app-wide, listed in shortcuts help, and opens from the tab strip", () => {
    expect(read("src/components/GlobalShortcuts.tsx")).toContain("<WindowSwitcher />");
    expect(read("src/components/KeyboardShortcutsModal.tsx")).toContain('keys: ["Alt", "W"]');
    expect(read("src/components/WindowTabsBar.tsx")).toContain("onClick={() => setSwitcherOpen(true)}");
    // Ctrl+Tab no longer jumps blindly; the switcher handles it.
    expect(read("src/contexts/WindowTabsContext.tsx")).not.toContain('e.ctrlKey && e.key === "Tab"');
  });
});
