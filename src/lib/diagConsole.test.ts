/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagConsoleInfo, isDiagConsoleEnabled } from "./diagConsole";

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("isDiagConsoleEnabled", () => {
  it("is off by default so production stays quiet", () => {
    expect(isDiagConsoleEnabled("ezzy_main_thread", "mainthread")).toBe(false);
  });

  it("turns on from localStorage flag", () => {
    window.localStorage.setItem("ezzy_main_thread", "1");
    expect(isDiagConsoleEnabled("ezzy_main_thread", "mainthread")).toBe(true);
  });

  it("turns on from query token", () => {
    window.history.replaceState({}, "", "/shop?mainthread=1");
    expect(isDiagConsoleEnabled("ezzy_main_thread", "mainthread")).toBe(true);
  });

  it("ignores a different flag", () => {
    window.localStorage.setItem("ezzy_nav_perf", "1");
    expect(isDiagConsoleEnabled("ezzy_main_thread", "mainthread")).toBe(false);
  });
});

describe("diagConsoleInfo", () => {
  it("does not call console.info when the flag is off", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    diagConsoleInfo("ezzy_main_thread", "mainthread", "[MainThread]", { ms: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls console.info when the flag is on", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    window.localStorage.setItem("ezzy_pwa_cold_open", "1");
    diagConsoleInfo("ezzy_pwa_cold_open", "pwacold", "[PWAColdOpen]", "chunk");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
