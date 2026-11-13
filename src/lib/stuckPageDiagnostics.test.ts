/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn(() => Promise.resolve()) }));

import { logError } from "@/lib/errorLogger";
import { getInFlightRouteLoads, loadRouteChunk, routeChunkLabel } from "@/lib/chunkLoadRetry";
import {
  STUCK_PAGE_OPERATION,
  buildStuckPageReport,
  claimStuckPageReport,
  noteLongTask,
  noteTimerGap,
  noteVisibility,
  reportStuckPage,
  slowAssetsSince,
  startStuckPageWatch,
} from "./stuckPageDiagnostics";

afterEach(() => vi.clearAllMocks());

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("stuck page watch", () => {
  it("adds up hidden time, long tasks and the largest timer gap", () => {
    const w = startStuckPageWatch("whatsapp-logs", 1_000, false);
    noteVisibility(w, true, 2_000);
    noteVisibility(w, true, 2_500); // already hidden
    noteVisibility(w, false, 7_000);
    noteLongTask(w, 120.4);
    noteLongTask(w, 80);
    noteTimerGap(w, 300);
    noteTimerGap(w, 9_000);
    noteTimerGap(w, 50);
    expect(w).toMatchObject({ hiddenMs: 5_000, longTaskCount: 2, longTaskMs: 200, maxTimerGapMs: 9_000 });
  });

  it("report closes an open hidden span and carries the outcome and wait", () => {
    const w = startStuckPageWatch("settings", 10_000, true);
    const r = buildStuckPageReport(w, "still-loading", 70_000);
    expect(r).toMatchObject({ path: "settings", outcome: "still-loading", waitedMs: 60_000, hiddenMs: 60_000 });
    expect(r.serviceWorker).toHaveProperty("controlled");
  });
});

describe("slowAssetsSince", () => {
  it("keeps page files over 2 s fetched while waiting, slowest first", () => {
    const entries = [
      { name: "https://x/assets/WhatsAppLogs-ab12.js", startTime: 500, duration: 9_000, transferSize: 27_000 },
      { name: "https://x/assets/fast-ab12.js", startTime: 600, duration: 300 },
      { name: "https://x/assets/old-ab12.js", startTime: -5_000, duration: 9_000 }, // before the wait
      { name: "https://x/assets/style-ab12.css", startTime: 700, duration: 9_000 },
      { name: "https://x/assets/parse-ab12.js?v=1", startTime: 800, duration: 4_000, transferSize: 0 },
    ];
    expect(slowAssetsSince(100_000, entries, 99_800)).toEqual([
      { file: "WhatsAppLogs-ab12.js", ms: 9_000, kb: 26 },
      { file: "parse-ab12.js", ms: 4_000, kb: 0 },
    ]);
  });
});

describe("claimStuckPageReport", () => {
  it("one report per page, three per session", () => {
    const s = memoryStorage();
    expect(claimStuckPageReport("a", s)).toBe(true);
    expect(claimStuckPageReport("a", s)).toBe(false);
    expect(claimStuckPageReport("b", s)).toBe(true);
    expect(claimStuckPageReport("c", s)).toBe(true);
    expect(claimStuckPageReport("d", s)).toBe(false);
  });
});

describe("reportStuckPage", () => {
  it("writes one app_error_logs row through logError with the report as context", () => {
    const w = startStuckPageWatch("customer-notifications", 0, false);
    const report = buildStuckPageReport(w, "loaded", 14_000);
    reportStuckPage(report, "org-1");
    expect(logError).toHaveBeenCalledTimes(1);
    const [ctx, err] = vi.mocked(logError).mock.calls[0];
    expect(ctx).toMatchObject({ operation: STUCK_PAGE_OPERATION, page: "customer-notifications", organizationId: "org-1" });
    expect(ctx.additionalContext).toMatchObject({ outcome: "loaded", waitedMs: 14_000 });
    expect((err as Error).message).toBe("Page loaded after 14s (slow-load hint shown)");
  });
});

describe("in-flight page files (chunkLoadRetry)", () => {
  it("names the imported file from the loader source", () => {
    // Dev server form and built form of the App.tsx loaders.
    expect(routeChunkLabel(new Function('return import("./pages/WhatsAppLogs")') as () => unknown)).toBe("WhatsAppLogs");
    expect(routeChunkLabel(new Function('return xe(()=>import("./WhatsAppLogs-DgPzkS0Q.js"),[])') as () => unknown)).toBe(
      "WhatsAppLogs-DgPzkS0Q.js",
    );
    expect(routeChunkLabel(() => Promise.resolve(1))).toBe("unknown");
  });

  it("lists a page file while it loads and drops it when done", async () => {
    let resolve!: (v: { default: () => null }) => void;
    const pending = loadRouteChunk(() => new Promise<{ default: () => null }>((r) => (resolve = r)));
    const loads = getInFlightRouteLoads();
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ failedAttempts: 0, lastError: null });
    resolve({ default: () => null });
    await pending;
    expect(getInFlightRouteLoads()).toHaveLength(0);
  });
});
