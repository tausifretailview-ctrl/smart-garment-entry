import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn(() => Promise.resolve()) }));

import { toast } from "sonner";
import { logError } from "@/lib/errorLogger";
import { reportIfFails } from "./reportIfFails";

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
