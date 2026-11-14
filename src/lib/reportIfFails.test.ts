import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn(() => Promise.resolve()) }));

import { toast } from "sonner";
import { logError } from "@/lib/errorLogger";
import { claimFailureLog, reportIfFails, resetFailureLogClaims } from "./reportIfFails";

afterEach(() => vi.clearAllMocks());
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("reportIfFails", () => {
  it("a failing task shows an error toast and is logged", async () => {
    reportIfFails(Promise.reject(new Error("network down")), "save the bill");
    await flush();
    expect(toast.error).toHaveBeenCalledWith("Could not save the bill", { description: "network down" });
    expect(logError).toHaveBeenCalledWith({ operation: "unhandled:save the bill" }, expect.any(Error));
  });

  it("a task that succeeds, or a non-promise, does nothing", async () => {
    reportIfFails(Promise.resolve(1), "save the bill");
    reportIfFails(undefined, "x");
    reportIfFails(42, "x");
    await flush();
    expect(toast.error).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("silent: logged without a toast (background work the user did not ask for)", async () => {
    reportIfFails(Promise.reject("boom"), "refresh the preview", { silent: true });
    await flush();
    expect(toast.error).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("no unhandled rejection escapes", async () => {
    const seen: unknown[] = [];
    const onRej = (r: unknown) => seen.push(r);
    process.on("unhandledRejection", onRej);
    reportIfFails(Promise.reject(new Error("x")), "y");
    await flush();
    await flush();
    process.off("unhandledRejection", onRej);
    expect(seen).toEqual([]);
  });
});

describe("failure log rate limit", () => {
  afterEach(() => resetFailureLogClaims());

  it("logs the same failure once a minute, different failures separately", () => {
    resetFailureLogClaims();
    expect(claimFailureLog("save the bill", "timeout", 0)).toBe(true);
    expect(claimFailureLog("save the bill", "timeout", 30_000)).toBe(false);
    expect(claimFailureLog("save the bill", "denied", 30_000)).toBe(true);
    expect(claimFailureLog("save the bill", "timeout", 61_000)).toBe(true);
  });

  it("stops at 30 log rows per page load", () => {
    resetFailureLogClaims();
    let written = 0;
    for (let i = 0; i < 50; i += 1) if (claimFailureLog("print", `error ${i}`, i)) written += 1;
    expect(written).toBe(30);
  });
});
