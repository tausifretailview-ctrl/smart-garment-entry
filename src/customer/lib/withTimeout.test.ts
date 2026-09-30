import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the value when the step finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("token"), 1000, "get_token")).resolves.toBe("token");
  });

  it("passes the step's own error through", async () => {
    const err = Object.assign(new Error("denied"), { code: "messaging/permission-blocked" });
    await expect(withTimeout(Promise.reject(err), 1000, "get_token")).rejects.toBe(err);
  });

  it("rejects with timeout:<stage> when the step never settles", async () => {
    const stuck = new Promise<string>(() => undefined);
    const result = withTimeout(stuck, 25_000, "get_token");
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout:get_token" });
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it("does not fire the timeout after the step finished", async () => {
    let resolveStep: (v: string) => void = () => undefined;
    const step = new Promise<string>((res) => {
      resolveStep = res;
    });
    const result = withTimeout(step, 1000, "sw_active");
    resolveStep("ok");
    await expect(result).resolves.toBe("ok");
    await vi.advanceTimersByTimeAsync(5000);
  });
});
