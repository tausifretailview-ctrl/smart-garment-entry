import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKUP_RETENTION_DAYS,
  MIN_BACKUP_RETENTION_DAYS,
  normalizeBackupRetentionDays,
} from "./backupRetention";

describe("normalizeBackupRetentionDays", () => {
  it("defaults 0 / empty so purge cannot wipe every backup", () => {
    expect(normalizeBackupRetentionDays(0)).toBe(DEFAULT_BACKUP_RETENTION_DAYS);
    expect(normalizeBackupRetentionDays("0")).toBe(DEFAULT_BACKUP_RETENTION_DAYS);
    expect(normalizeBackupRetentionDays(null)).toBe(DEFAULT_BACKUP_RETENTION_DAYS);
    expect(normalizeBackupRetentionDays("")).toBe(DEFAULT_BACKUP_RETENTION_DAYS);
  });

  it("floors below the minimum", () => {
    expect(normalizeBackupRetentionDays(1)).toBe(MIN_BACKUP_RETENTION_DAYS);
    expect(normalizeBackupRetentionDays(2)).toBe(MIN_BACKUP_RETENTION_DAYS);
  });

  it("keeps valid windows", () => {
    expect(MIN_BACKUP_RETENTION_DAYS).toBe(3);
    expect(DEFAULT_BACKUP_RETENTION_DAYS).toBe(3);
    expect(normalizeBackupRetentionDays(3)).toBe(3);
    expect(normalizeBackupRetentionDays(7)).toBe(7);
    expect(normalizeBackupRetentionDays(30)).toBe(30);
    expect(normalizeBackupRetentionDays("90")).toBe(90);
  });
});
