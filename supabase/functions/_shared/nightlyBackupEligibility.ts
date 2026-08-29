/** Shared rules for the nightly cloud backup dispatcher. Keep in sync with
 * `src/utils/backupRetention.ts` (3-day floor / default). */

export const DEFAULT_NIGHTLY_RETENTION_DAYS = 3;
export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isOrgEligibleForNightlyBackup(org: {
  is_suspended?: boolean | null;
}): boolean {
  return org.is_suspended !== true;
}

export function isDueForNightlyBackup(
  lastAutoBackupAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastAutoBackupAt) return true;
  const t = new Date(lastAutoBackupAt).getTime();
  if (!Number.isFinite(t)) return true;
  return now - t >= AUTO_BACKUP_INTERVAL_MS;
}

export function resolveNightlyRetentionDays(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_NIGHTLY_RETENTION_DAYS;
}
