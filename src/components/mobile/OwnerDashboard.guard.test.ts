import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("OwnerDashboard last-fetched badge", () => {
  it("does not claim Synced without a fetch timestamp", () => {
    const dash = readFileSync(join(here, "OwnerDashboard.tsx"), "utf8");
    expect(dash).toContain("formatLastFetchedLabel");
    expect(dash).toContain("dataUpdatedAt");
    expect(dash).not.toMatch(/isRefreshing \? "Syncing" : "Synced"/);
  });
});
