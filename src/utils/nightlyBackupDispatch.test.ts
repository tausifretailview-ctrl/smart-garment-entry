import { describe, expect, it } from "vitest";
import {
  NIGHTLY_DISPATCH_DEFAULT_RETRY_AFTER_MS,
  hashOrganizationId,
  isRateLimitFailure,
  isSuccessfulDispatchStatus,
  isWorkerResourceLimitStatus,
  orgDispatchOffsetMs,
  resolveRetryAfterMs,
  sortOrgsForStaggeredDispatch,
} from "../../supabase/functions/_shared/nightlyBackupDispatch";

describe("nightlyBackupDispatch stagger", () => {
  it("hashes organization ids deterministically", () => {
    expect(hashOrganizationId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      hashOrganizationId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    );
    expect(hashOrganizationId("org-a")).not.toBe(hashOrganizationId("org-b"));
  });

  it("spreads offsets across the window instead of clustering at 0", () => {
    const ids = Array.from({ length: 40 }, (_, i) => ({
      organization_id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
    }));
    const offsets = ids.map((o) => orgDispatchOffsetMs(o.organization_id, 90_000));
    expect(Math.min(...offsets)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...offsets)).toBeLessThan(90_000);
    expect(new Set(offsets).size).toBeGreaterThan(10);
  });

  it("sorts by stagger offset then org id", () => {
    const orgs = [
      { organization_id: "b" },
      { organization_id: "a" },
      { organization_id: "c" },
    ];
    const sorted = sortOrgsForStaggeredDispatch(orgs, 90_000);
    const offsets = sorted.map((o) => orgDispatchOffsetMs(o.organization_id, 90_000));
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
  });
});

describe("nightlyBackupDispatch status / rate-limit policy", () => {
  it("treats only 2xx as successful dispatch", () => {
    expect(isSuccessfulDispatchStatus(200)).toBe(true);
    expect(isSuccessfulDispatchStatus(204)).toBe(true);
    expect(isSuccessfulDispatchStatus(429)).toBe(false);
    expect(isSuccessfulDispatchStatus(546)).toBe(false);
    expect(isSuccessfulDispatchStatus(500)).toBe(false);
  });

  it("recognizes HTTP 546 as WORKER_RESOURCE_LIMIT", () => {
    expect(isWorkerResourceLimitStatus(546)).toBe(true);
    expect(isWorkerResourceLimitStatus(503)).toBe(false);
  });

  it("detects RateLimitError and retry-after message text", () => {
    expect(
      isRateLimitFailure({ name: "RateLimitError", message: "rate limited" }),
    ).toBe(true);
    expect(
      isRateLimitFailure(new Error("WorkerRequestFailed: retry after ~60 seconds")),
    ).toBe(true);
    expect(isRateLimitFailure(null, 429)).toBe(true);
    expect(isRateLimitFailure(null, 200)).toBe(false);
  });

  it("honors retryAfterMs / Retry-After / ~60s message (does not invent another interval)", () => {
    expect(resolveRetryAfterMs({ err: { retryAfterMs: 60_000 } })).toBe(60_000);
    expect(
      resolveRetryAfterMs({
        err: new Error("rate limited: retry after ~60 seconds"),
      }),
    ).toBe(60_000);
    expect(resolveRetryAfterMs({ retryAfterHeader: "60" })).toBe(60_000);
    expect(resolveRetryAfterMs({})).toBe(NIGHTLY_DISPATCH_DEFAULT_RETRY_AFTER_MS);
  });
});
