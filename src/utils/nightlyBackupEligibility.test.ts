import { describe, expect, it } from "vitest";
import {
  AUTO_BACKUP_INTERVAL_MS,
  DEFAULT_NIGHTLY_RETENTION_DAYS,
  isDueForNightlyBackup,
  isOrgEligibleForNightlyBackup,
  resolveNightlyRetentionDays,
} from "../../supabase/functions/_shared/nightlyBackupEligibility";

describe("nightly backup eligibility", () => {
  it("backs up every non-suspended organization", () => {
    expect(isOrgEligibleForNightlyBackup({})).toBe(true);
    expect(isOrgEligibleForNightlyBackup({ is_suspended: false })).toBe(true);
    expect(isOrgEligibleForNightlyBackup({ is_suspended: null })).toBe(true);
    expect(isOrgEligibleForNightlyBackup({ is_suspended: true })).toBe(false);
  });

  it("treats a missing or invalid last-run as due", () => {
    expect(isDueForNightlyBackup(null)).toBe(true);
    expect(isDueForNightlyBackup(undefined)).toBe(true);
    expect(isDueForNightlyBackup("not-a-date")).toBe(true);
  });

  it("skips an org backed up within the last 24 hours", () => {
    const now = Date.parse("2026-08-29T18:00:00.000Z");
    expect(isDueForNightlyBackup("2026-08-29T10:00:00.000Z", now)).toBe(false);
    expect(
      isDueForNightlyBackup(
        new Date(now - AUTO_BACKUP_INTERVAL_MS).toISOString(),
        now,
      ),
    ).toBe(true);
    expect(
      isDueForNightlyBackup("2026-08-17T17:03:00.000Z", now),
    ).toBe(true);
  });

  it("defaults retention to 3 days", () => {
    expect(DEFAULT_NIGHTLY_RETENTION_DAYS).toBe(3);
    expect(resolveNightlyRetentionDays(null)).toBe(3);
    expect(resolveNightlyRetentionDays(0)).toBe(3);
    expect(resolveNightlyRetentionDays(7)).toBe(7);
  });
});
