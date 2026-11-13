/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/appReload", () => ({
  confirmReloadIfPosCartBusy: vi.fn(() => true),
  isSilentReloadCartBusy: vi.fn(() => false),
  reloadAppWithUpdateCheck: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/appBuildCheck", () => ({
  newerServerEntryScript: vi.fn(() => Promise.resolve(null)),
  claimNewerBuildReload: vi.fn(() => false),
}));

import { logError } from "@/lib/errorLogger";
import { reloadAppWithUpdateCheck } from "@/lib/appReload";
import { OutletLoadFallback, SLOW_OUTLET_LOAD_MS } from "./OutletLoadFallback";
import { STUCK_PAGE_REPORT_AFTER_MS } from "@/lib/stuckPageDiagnostics";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  window.history.pushState({}, "", "/demo/whatsapp-logs");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const render = () => act(() => root.render(<OutletLoadFallback path="whatsapp-logs" />));
const hintShown = () => (host.textContent || "").includes("taking longer than expected");

describe("OutletLoadFallback stuck-page diagnostics", () => {
  it("a quick load reports nothing", () => {
    render();
    act(() => void vi.advanceTimersByTime(3_000));
    act(() => root.render(<div />)); // page arrived
    expect(hintShown()).toBe(false);
    expect(logError).not.toHaveBeenCalled();
  });

  it("hint shown, then the page loads: one 'loaded' report with the wait", async () => {
    render();
    await act(async () => void vi.advanceTimersByTime(SLOW_OUTLET_LOAD_MS + 2_000));
    expect(hintShown()).toBe(true);
    act(() => root.render(<div />));
    expect(logError).toHaveBeenCalledTimes(1);
    const [ctx] = vi.mocked(logError).mock.calls[0];
    expect(ctx).toMatchObject({ operation: "page_load_stalled", page: "whatsapp-logs" });
    expect(ctx.additionalContext).toMatchObject({ outcome: "loaded", newerBuildOnServer: false });
    expect((ctx.additionalContext as { waitedMs: number }).waitedMs).toBeGreaterThanOrEqual(SLOW_OUTLET_LOAD_MS);
  });

  it("still stuck after 60 s: one 'still-loading' report, nothing more on unmount", async () => {
    render();
    await act(async () => void vi.advanceTimersByTime(SLOW_OUTLET_LOAD_MS + 500));
    expect(logError).not.toHaveBeenCalled();
    await act(async () => void vi.advanceTimersByTime(STUCK_PAGE_REPORT_AFTER_MS));
    expect(logError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError).mock.calls[0][0].additionalContext).toMatchObject({ outcome: "still-loading" });
    act(() => root.render(<div />));
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("user went to another page while it was stuck: 'left-page'", async () => {
    render();
    await act(async () => void vi.advanceTimersByTime(SLOW_OUTLET_LOAD_MS + 500));
    window.history.pushState({}, "", "/demo/pos-sales");
    act(() => root.render(<div />));
    expect(vi.mocked(logError).mock.calls[0][0].additionalContext).toMatchObject({ outcome: "left-page" });
  });

  it("a PC that slept through the timers still reports once it wakes", async () => {
    render();
    await act(async () => void vi.advanceTimersByTime(STUCK_PAGE_REPORT_AFTER_MS + 1_000)); // one jump
    expect(logError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError).mock.calls[0][0].additionalContext).toMatchObject({ outcome: "still-loading" });
  });

  it("Reload app writes the row first, then reloads", async () => {
    render();
    await act(async () => void vi.advanceTimersByTime(SLOW_OUTLET_LOAD_MS + 500));
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Reload app")!;
    await act(async () => {
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError).mock.calls[0][0].additionalContext).toMatchObject({ outcome: "reload-pressed" });
    expect(reloadAppWithUpdateCheck).toHaveBeenCalledTimes(1);
  });
});
