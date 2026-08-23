import { describe, expect, it } from "vitest";
import {
  CRITICAL_SCHEMA_MIGRATIONS,
  diffSchemaMigrationVersions,
  missingCritical,
  parseMigrationVersion,
} from "../../scripts/lib/schema-migration-versions.mjs";

describe("parseMigrationVersion", () => {
  it("reads the 14-digit prefix", () => {
    expect(parseMigrationVersion("20261001140000_purchase_stock_floor_on_qty_decrease.sql")).toBe(
      "20261001140000",
    );
    expect(
      parseMigrationVersion("20251108190807_78431a49-b029-4b99-a831-234dfdd4aa87.sql"),
    ).toBe("20251108190807");
  });

  it("rejects files that are not timestamped migrations", () => {
    expect(parseMigrationVersion("README.md")).toBeNull();
    expect(parseMigrationVersion("fix_stock.sql")).toBeNull();
  });
});

describe("diffSchemaMigrationVersions", () => {
  it("reports both directions", () => {
    const diff = diffSchemaMigrationVersions(
      ["20261001140000", "20261002120000"],
      ["20261001140000", "20260901000000"],
    );
    expect(diff.inRepoNotLive).toEqual(["20261002120000"]);
    expect(diff.inLiveNotRepo).toEqual(["20260901000000"]);
    expect(diff.repoCount).toBe(2);
    expect(diff.liveCount).toBe(2);
  });

  it("is empty when both sides match", () => {
    const diff = diffSchemaMigrationVersions(["20260101000000"], ["20260101000000"]);
    expect(diff.inRepoNotLive).toEqual([]);
    expect(diff.inLiveNotRepo).toEqual([]);
  });
});

describe("missingCritical", () => {
  it("flags the purchase-stock floor when live is missing it", () => {
    const missing = missingCritical([]);
    expect(missing.some((row) => row.version === "20261001140000")).toBe(true);
  });

  it("is empty when every critical version is live", () => {
    const live = CRITICAL_SCHEMA_MIGRATIONS.map((row) => row.version);
    expect(missingCritical(live)).toEqual([]);
  });
});
