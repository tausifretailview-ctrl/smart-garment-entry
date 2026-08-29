export const MIN_BACKUP_RETENTION_DAYS = 3;
export const MAX_BACKUP_RETENTION_DAYS = 3650;
export const DEFAULT_BACKUP_RETENTION_DAYS = 3;
export const BACKUP_RETENTION_OPTIONS = [3, 7, 14, 30, 60, 90] as const;

/** Clamp an untrusted retention value. 0 / invalid → default (never "delete everything"). */
export function normalizeBackupRetentionDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BACKUP_RETENTION_DAYS;
  return Math.min(MAX_BACKUP_RETENTION_DAYS, Math.max(MIN_BACKUP_RETENTION_DAYS, Math.floor(n)));
}
