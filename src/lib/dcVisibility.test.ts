import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DC_VISIBILITY_IDLE_MS,
  canFlipDcVisibility,
  dcVisibilityStorageKey,
  effectiveDcVisibilityMode,
  expireDcVisibility,
  isDcVisibilityFlipped,
  resolveDcVisibilityMode,
  setDcVisibilityFlipped,
  shouldHideDc,
  subscribeDcVisibility,
  touchDcVisibility,
} from "./dcVisibility";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("dcVisibility", () => {
  const key = dcVisibilityStorageKey("user-1", "org-1");

  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: memoryStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to Show DC unless the shop chose Hide", () => {
    expect(resolveDcVisibilityMode(null)).toBe("show");
    expect(resolveDcVisibilityMode({})).toBe("show");
    expect(resolveDcVisibilityMode({ dc_visibility_mode: "hide" })).toBe("hide");
    expect(resolveDcVisibilityMode({ dc_visibility_mode: "junk" })).toBe("show");
  });

  it("an Always show DC login works in Show mode", () => {
    expect(effectiveDcVisibilityMode("hide", true)).toBe("show");
    expect(effectiveDcVisibilityMode("hide", false)).toBe("hide");
    expect(effectiveDcVisibilityMode("show", true)).toBe("show");
    expect(effectiveDcVisibilityMode("show", false)).toBe("show");
  });

  it("Ctrl+Shift+H flips the shop's mode", () => {
    expect(shouldHideDc("show", false)).toBe(false);
    expect(shouldHideDc("show", true)).toBe(true);
    expect(shouldHideDc("hide", false)).toBe(true);
    expect(shouldHideDc("hide", true)).toBe(false);
  });

  it("lets anyone hide in Show mode, only admins and managers show in Hide mode", () => {
    expect(canFlipDcVisibility("show", "user")).toBe(true);
    expect(canFlipDcVisibility("hide", "user")).toBe(false);
    expect(canFlipDcVisibility("hide", "manager")).toBe(true);
    expect(canFlipDcVisibility("hide", "admin")).toBe(true);
  });

  it("keeps the flip per tab and tells screens", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDcVisibility(listener);
    expect(isDcVisibilityFlipped(key)).toBe(false);
    setDcVisibilityFlipped(key, true, 1_000);
    expect(isDcVisibilityFlipped(key, 2_000)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setDcVisibilityFlipped(key, false);
    expect(isDcVisibilityFlipped(key)).toBe(false);
    unsubscribe();
  });

  it("goes back to the shop's mode after 15 minutes idle", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDcVisibility(listener);
    setDcVisibilityFlipped(key, true, 0);
    touchDcVisibility(key, 10 * 60 * 1000);
    expect(isDcVisibilityFlipped(key, 20 * 60 * 1000)).toBe(true);
    listener.mockClear();
    expireDcVisibility(key, 10 * 60 * 1000 + DC_VISIBILITY_IDLE_MS + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isDcVisibilityFlipped(key)).toBe(false);
    unsubscribe();
  });

  it("does not flip when there is no user or org", () => {
    expect(isDcVisibilityFlipped(null)).toBe(false);
  });
});
