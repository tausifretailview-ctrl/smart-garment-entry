import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/errorLogger", () => ({ logError: vi.fn(() => Promise.resolve()) }));

import { logError } from "@/lib/errorLogger";
import {
  claimRejectionReport,
  rejectionMessage,
  reportUnhandledRejection,
  resetUnhandledRejectionReports,
} from "./unhandledRejectionReport";

afterEach(() => {
  resetUnhandledRejectionReports();
  vi.clearAllMocks();
});

describe("unhandled rejection reports", () => {
  it("reads a message from errors, strings and PostgREST-style objects", () => {
    expect(rejectionMessage(new Error("boom"))).toBe("boom");
    expect(rejectionMessage("plain")).toBe("plain");
    expect(rejectionMessage({ message: "duplicate key", code: "23505" })).toBe("duplicate key");
    expect(rejectionMessage(42)).toBe("42");
  });

  it("writes one row per distinct message, at most 5 per page load", () => {
    reportUnhandledRejection(new Error("save failed"));
    reportUnhandledRejection(new Error("save failed"));
    expect(logError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logError).mock.calls[0][0]).toMatchObject({ operation: "unhandled_rejection" });
    for (let i = 0; i < 10; i++) reportUnhandledRejection(new Error(`other ${i}`));
    expect(logError).toHaveBeenCalledTimes(5);
  });

  it("skips page-file load errors and aborted fetches", () => {
    expect(claimRejectionReport(new TypeError("Failed to fetch dynamically imported module: https://x/assets/A-1.js"))).toBe(false);
    expect(claimRejectionReport(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(claimRejectionReport(new Error("real failure"))).toBe(true);
  });
});
