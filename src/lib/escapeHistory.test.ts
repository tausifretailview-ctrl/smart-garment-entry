/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ESC_HISTORY_MAX,
  consumeSteppingBack,
  entryHref,
  pagePathAfterSlug,
  previousEntry,
  readEscHistory,
  recordVisit,
  takeEscBackTarget,
  writeEscHistory,
  type EscHistoryEntry,
} from "./escapeHistory";

const e = (path: string, search = ""): EscHistoryEntry => ({ path, search });
const visit = (stack: EscHistoryEntry[], path: string, back = false, search = "") => recordVisit(stack, e(path, search), back);

describe("Esc steps back through the pages visited", () => {
  beforeEach(() => {
    sessionStorage.clear();
    consumeSteppingBack();
  });

  it("reads the page path after the shop slug", () => {
    expect(pagePathAfterSlug("/krishna/sales-invoice", "krishna")).toBe("sales-invoice");
    expect(pagePathAfterSlug("/krishna/accounting/customer", "krishna")).toBe("accounting/customer");
    expect(pagePathAfterSlug("/krishna", "krishna")).toBe("");
  });

  it("Purchase Bill → Sale Bill → Payments, Esc → Sale Bill, Esc → Purchase Bill", () => {
    let s: EscHistoryEntry[] = [];
    s = visit(s, "purchase-entry");
    s = visit(s, "sales-invoice");
    s = visit(s, "payments-dashboard");
    expect(previousEntry(s, "payments-dashboard")).toEqual(e("sales-invoice"));
    s = visit(s, "sales-invoice", true); // Esc arrives here
    expect(s.map((x) => x.path)).toEqual(["purchase-entry", "sales-invoice"]);
    expect(previousEntry(s, "sales-invoice")).toEqual(e("purchase-entry"));
    s = visit(s, "purchase-entry", true);
    expect(s.map((x) => x.path)).toEqual(["purchase-entry"]);
    // Nothing earlier: the caller uses the page's usual parent.
    expect(previousEntry(s, "purchase-entry")).toBeNull();
  });

  it("clicking back to an earlier page is a new visit, not a step back", () => {
    let s: EscHistoryEntry[] = [];
    for (const p of ["purchase-entry", "sales-invoice", "purchase-entry"]) s = visit(s, p);
    expect(s.map((x) => x.path)).toEqual(["purchase-entry", "sales-invoice", "purchase-entry"]);
    expect(previousEntry(s, "purchase-entry")).toEqual(e("sales-invoice"));
  });

  it("filters on the same page update it instead of adding steps, and keep its query", () => {
    let s = visit([], "sales-invoice-dashboard");
    s = visit(s, "sales-invoice-dashboard", false, "?page=2");
    s = visit(s, "sales-invoice", false, "?id=abc");
    expect(s).toEqual([e("sales-invoice-dashboard", "?page=2"), e("sales-invoice", "?id=abc")]);
    expect(entryHref(previousEntry(s, "sales-invoice")!)).toBe("/sales-invoice-dashboard?page=2");
    expect(entryHref(e(""))).toBe("/");
  });

  it("keeps only the newest pages and ignores a list that is not for this page", () => {
    let s: EscHistoryEntry[] = [];
    for (let i = 0; i < ESC_HISTORY_MAX + 10; i += 1) s = visit(s, `p${i}`);
    expect(s).toHaveLength(ESC_HISTORY_MAX);
    expect(s[0].path).toBe("p10");
    expect(previousEntry(s, "somewhere-else")).toBeNull();
  });

  it("stores the list per shop for this browser tab and marks the step", () => {
    writeEscHistory("krishna", [e("purchase-entry"), e("sales-invoice", "?id=1")]);
    expect(readEscHistory("other")).toEqual([]);
    expect(takeEscBackTarget("krishna", "/krishna/sales-invoice")).toBe("/purchase-entry");
    expect(consumeSteppingBack()).toBe(true);
    expect(consumeSteppingBack()).toBe(false);
    expect(takeEscBackTarget("krishna", "/krishna/purchase-entry")).toBeNull();
    sessionStorage.setItem("ezzy-esc-history-v1:krishna", "{broken");
    expect(readEscHistory("krishna")).toEqual([]);
  });

  it("the global Esc and POS use it before the fixed map", () => {
    const hook = readFileSync(join(process.cwd(), "src/hooks/useEscapeBack.ts"), "utf8");
    expect(hook.indexOf("takeEscBackTarget(orgSlug, location.pathname)")).toBeLessThan(hook.indexOf("BACK_MAP[currentPage]"));
    expect(readFileSync(join(process.cwd(), "src/pages/POSSales.tsx"), "utf8")).toContain(
      "orgNavigatePOS(takeEscBackTarget(slug, window.location.pathname) ?? '/pos-dashboard');",
    );
  });
});
