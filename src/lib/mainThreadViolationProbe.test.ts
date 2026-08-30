import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMainThreadReport,
  classifyChromeMessageViolation,
  classifyForcedReflowSite,
  getMainThreadLongTasks,
  getPersistRestoreProbe,
  hrefLooksLikeStaleDevToolsTarget,
  markPersistRestoreComplete,
  recordMainThreadLongTask,
  resetMainThreadViolationProbeForTests,
} from "./mainThreadViolationProbe";
import { isVolatileOrSensitiveKey } from "./queryPersister";

afterEach(() => {
  resetMainThreadViolationProbeForTests();
});

describe("main-thread violation probe", () => {
  it("classifies Chrome 'message' handler as React's scheduler without a stack", () => {
    expect(classifyChromeMessageViolation()).toBe("react-scheduler-messagechannel");
  });

  it("classifies an expanded React scheduler stack, not previewAuthStorage", () => {
    expect(
      classifyChromeMessageViolation(
        "at performWorkUntilDeadline (scheduler.development.js:12)\n at MessageChannel.port1.onmessage",
      ),
    ).toBe("react-scheduler-messagechannel");
    expect(
      classifyChromeMessageViolation("at onMessage (previewAuthStorage.ts:51)"),
    ).toBe("app-preview-auth-message");
    expect(classifyChromeMessageViolation("at someOtherListener (foo.ts:1)")).toBe(
      "unknown-message-handler",
    );
  });

  it("refuses to name a reflow site without an expanded stack", () => {
    expect(classifyForcedReflowSite()).toBe("need-expanded-stack");
    expect(classifyForcedReflowSite("at nudgePaneScrollLayout (TabCachedPages.tsx:135)")).toBe(
      "tab-cache-nudge",
    );
    expect(
      classifyForcedReflowSite("at hasPaintedWorkspaceContent (tabCacheReadiness.ts:176)"),
    ).toBe("blank-frame-watchdog");
  });

  it("flags organization-setup href as a stale DevTools target", () => {
    expect(
      hrefLooksLikeStaleDevToolsTarget("https://app.inventoryshop.in/organization-setup"),
    ).toBe(true);
    expect(hrefLooksLikeStaleDevToolsTarget("https://app.inventoryshop.in/ella-noor")).toBe(
      false,
    );
    expect(hrefLooksLikeStaleDevToolsTarget("https://app.inventoryshop.in/demo")).toBe(false);
  });

  it("records duration, href, and stale-DevTools hint so a mismatched window is visible", () => {
    recordMainThreadLongTask({
      durationMs: 532,
      startTime: 100,
      name: "self",
      href: "https://app.example/organization-setup",
      title: "Organization setup",
    });
    const rows = getMainThreadLongTasks();
    expect(rows).toHaveLength(1);
    expect(rows[0].durationMs).toBe(532);
    expect(rows[0].staleDevToolsHint).toBe(true);
    expect(buildMainThreadReport()).toContain("STALE_DEVTOOLS_HREF");
    expect(buildMainThreadReport()).toContain("532ms");
  });

  it("records persist restore timing for volume correlation", () => {
    markPersistRestoreComplete(1_250_000);
    expect(getPersistRestoreProbe().persistCacheChars).toBe(1_250_000);
    expect(buildMainThreadReport()).toContain("persistCacheChars=1250000");
  });
});

describe("persist volume vs dashboard aggregates", () => {
  it("persists product-catalog (not volatile) — restore cost can scale with catalog size", () => {
    expect(isVolatileOrSensitiveKey(["product-catalog", "org-ella"])).toBe(false);
    expect(isVolatileOrSensitiveKey(["dashboard-stats", "org-ella"])).toBe(false);
  });

  it("does not persist live POS/search keys", () => {
    expect(isVolatileOrSensitiveKey(["pos-products", "org"])).toBe(true);
    expect(isVolatileOrSensitiveKey(["product-search", "q"])).toBe(true);
  });
});

describe("known load-time reflow sites still present", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("TabCachedPages still forces layout via offsetHeight on tab return", () => {
    const src = readFileSync(join(here, "../components/TabCachedPages.tsx"), "utf8");
    expect(src).toContain("void el.offsetHeight");
  });

  it("blank-frame watchdog still measures painted panes with getBoundingClientRect", () => {
    const src = readFileSync(join(here, "./tabCacheReadiness.ts"), "utf8");
    expect(src).toContain("getBoundingClientRect");
  });
});
