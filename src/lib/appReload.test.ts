/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SILENT_UPDATE_BANNER_FALLBACK_MS,
  SILENT_UPDATE_IDLE_MS,
  hasAnyPosCartItemsInSession,
  isBlockingUiOverlayOpen,
  isSilentReloadCartBusy,
  isSilentReloadSafe,
  startSilentUpdateWhenSafe,
} from "./appReload";

vi.mock("@/lib/electronShell", () => ({
  isElectronShell: () => false,
}));

describe("silent auto-update safety gates", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
  });

  afterEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects POS cart items in session", () => {
    expect(hasAnyPosCartItemsInSession()).toBe(false);
    sessionStorage.setItem(
      "pos_cart_org1",
      JSON.stringify({ items: [{ id: "1" }] }),
    );
    expect(hasAnyPosCartItemsInSession()).toBe(true);
    expect(isSilentReloadCartBusy("org1")).toBe(true);
  });

  it("treats empty cart snapshot as clear", () => {
    sessionStorage.setItem("pos_cart_org1", JSON.stringify({ items: [] }));
    expect(isSilentReloadCartBusy("org1")).toBe(false);
  });

  it("blocks when a dialog/sheet is open", () => {
    expect(isBlockingUiOverlayOpen()).toBe(false);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    expect(isBlockingUiOverlayOpen()).toBe(true);
    expect(isSilentReloadSafe(null)).toBe(false);
  });
});

describe("startSilentUpdateWhenSafe", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    sessionStorage.clear();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reloads silently after idle with empty cart and no dialog — no banner", async () => {
    const onFallbackBanner = vi.fn();
    const beforeReload = vi.fn().mockResolvedValue(undefined);

    startSilentUpdateWhenSafe({
      getOrganizationId: () => "org1",
      onFallbackBanner,
      beforeReload,
      idleMs: 1_000,
      bannerFallbackMs: 60_000,
      pollMs: 200,
    });

    await vi.advanceTimersByTimeAsync(1_200);

    expect(beforeReload).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalled();
    expect(onFallbackBanner).not.toHaveBeenCalled();
  });

  it("does not silent-reload while POS cart has items; banner after ceiling", async () => {
    sessionStorage.setItem(
      "pos_cart_org1",
      JSON.stringify({ items: [{ id: "sku" }] }),
    );
    const onFallbackBanner = vi.fn();

    startSilentUpdateWhenSafe({
      getOrganizationId: () => "org1",
      onFallbackBanner,
      idleMs: 500,
      bannerFallbackMs: 5_000,
      pollMs: 200,
    });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(onFallbackBanner).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(onFallbackBanner).toHaveBeenCalledTimes(1);
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it("reloads when tab becomes hidden with empty cart", async () => {
    const onFallbackBanner = vi.fn();
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });

    startSilentUpdateWhenSafe({
      getOrganizationId: () => null,
      onFallbackBanner,
      idleMs: 60_000,
      bannerFallbackMs: 120_000,
      pollMs: 10_000,
    });

    expect(window.location.reload).not.toHaveBeenCalled();

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(window.location.reload).toHaveBeenCalled();
    expect(onFallbackBanner).not.toHaveBeenCalled();
  });

  it("does not silent-reload while a dialog is open even if idle", async () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    const onFallbackBanner = vi.fn();

    startSilentUpdateWhenSafe({
      getOrganizationId: () => null,
      onFallbackBanner,
      idleMs: 500,
      bannerFallbackMs: 10_000,
      pollMs: 200,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(window.location.reload).not.toHaveBeenCalled();

    dialog.remove();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("restarts the 2h banner ceiling when a new session starts", async () => {
    const onFallbackBanner = vi.fn();

    startSilentUpdateWhenSafe({
      getOrganizationId: () => null,
      onFallbackBanner,
      idleMs: 60_000,
      bannerFallbackMs: 5_000,
      pollMs: 10_000,
    });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onFallbackBanner).not.toHaveBeenCalled();

    // Fresh update — must restart ceiling, not stack with the old timer.
    startSilentUpdateWhenSafe({
      getOrganizationId: () => null,
      onFallbackBanner,
      idleMs: 60_000,
      bannerFallbackMs: 5_000,
      pollMs: 10_000,
    });

    await vi.advanceTimersByTimeAsync(4_000);
    expect(onFallbackBanner).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(onFallbackBanner).toHaveBeenCalledTimes(1);
  });

  it("exports the production idle and banner timings", () => {
    expect(SILENT_UPDATE_IDLE_MS).toBe(45_000);
    expect(SILENT_UPDATE_BANNER_FALLBACK_MS).toBe(2 * 60 * 60 * 1000);
  });
});
