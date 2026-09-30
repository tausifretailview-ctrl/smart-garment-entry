// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsPanel, SLOW_SETTINGS_PANEL_MS } from "./lazySettingsPanel";

vi.mock("@/lib/appReload", () => ({ reloadAppWithUpdateCheck: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("createSettingsPanel", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    vi.useRealTimers();
    host.remove();
  });

  it("preload starts the import once per call and swallows failures", async () => {
    const loader = vi.fn(() => Promise.reject(new Error("network down")));
    const { preload } = createSettingsPanel(loader);
    expect(() => preload()).not.toThrow();
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
  });

  it("renders the panel once the chunk resolves", async () => {
    const { Panel } = createSettingsPanel(() =>
      Promise.resolve({ default: () => createElement("p", null, "whatsapp ready") }),
    );
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(Panel));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(host.textContent).toContain("whatsapp ready");
    expect(host.textContent).not.toContain("taking longer");
    await act(async () => root.unmount());
  });

  it("offers Retry and Refresh app when the chunk stays pending", async () => {
    const { Panel } = createSettingsPanel(() => new Promise(() => {}));
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(Panel));
    });
    expect(host.querySelector('[aria-label="Loading form"]')).not.toBeNull();
    expect(host.textContent).not.toContain("taking longer");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SLOW_SETTINGS_PANEL_MS + 100);
    });
    expect(host.textContent).toContain("taking longer than expected");
    const labels = [...host.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Refresh app", "Retry"]);
    await act(async () => root.unmount());
  });
});
