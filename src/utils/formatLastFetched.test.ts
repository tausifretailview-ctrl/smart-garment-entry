import { describe, expect, it } from "vitest";
import { formatLastFetchedLabel } from "./formatLastFetched";

describe("formatLastFetchedLabel", () => {
  it("returns Updating… while a fetch is in flight", () => {
    expect(formatLastFetchedLabel(1_000, { fetching: true })).toBe("Updating…");
  });

  it("returns empty when never fetched", () => {
    expect(formatLastFetchedLabel(0)).toBe("");
  });

  it("shows IST wall-clock time (not a fake Synced badge)", () => {
    // 16 Sep 2026 17:35 UTC = 11:05 PM IST
    const label = formatLastFetchedLabel(Date.UTC(2026, 8, 16, 17, 35, 0));
    expect(label).toMatch(/^Updated /);
    expect(label.toLowerCase()).toContain("11:05");
    expect(label.toLowerCase()).toContain("pm");
  });
});
