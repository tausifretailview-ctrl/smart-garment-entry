import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOREGROUND_MAX_STEP_MS,
  foregroundStepMs,
  startForegroundTimer,
} from "@/lib/foregroundTimer";

describe("foregroundStepMs", () => {
  it("caps a long gap to one step", () => {
    expect(foregroundStepMs(20_000, false)).toBe(FOREGROUND_MAX_STEP_MS);
    expect(foregroundStepMs(250, false)).toBe(250);
  });

  it("adds nothing while hidden or for bad deltas", () => {
    expect(foregroundStepMs(5_000, true)).toBe(0);
    expect(foregroundStepMs(-5, false)).toBe(0);
    expect(foregroundStepMs(Number.NaN, false)).toBe(0);
  });
});

describe("startForegroundTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fires after the budget of normal ticks", () => {
    const onFire = vi.fn();
    startForegroundTimer(4_000, onFire);
    vi.advanceTimersByTime(3_750);
    expect(onFire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it("does not fire right after a 20s main-thread freeze", () => {
    const onFire = vi.fn();
    startForegroundTimer(4_000, onFire);
    vi.advanceTimersByTime(250);
    // Freeze: the clock jumps 20s while no tick runs.
    vi.setSystemTime(Date.now() + 20_000);
    vi.advanceTimersByTime(250);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("cancel stops the timer", () => {
    const onFire = vi.fn();
    const cancel = startForegroundTimer(1_000, onFire);
    cancel();
    cancel();
    vi.advanceTimersByTime(5_000);
    expect(onFire).not.toHaveBeenCalled();
  });
});
