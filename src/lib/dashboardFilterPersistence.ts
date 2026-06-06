const STORAGE_PREFIX = "dashboard_filters_v1";
const RESTORE_GUARD_MS = 600;
let restoreGuardUntil = 0;

/** True briefly after filters are restored — skip automatic page resets in dashboard effects. */
export function isDashboardFilterRestoring(): boolean {
  return Date.now() < restoreGuardUntil;
}

export function markDashboardFilterRestoring(): void {
  restoreGuardUntil = Date.now() + RESTORE_GUARD_MS;
}

export function dashboardFilterStorageKey(orgId: string, dashboardId: string): string {
  return `${STORAGE_PREFIX}:${orgId}:${dashboardId}`;
}

export function readDashboardFilters(
  orgId: string,
  dashboardId: string,
): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(dashboardFilterStorageKey(orgId, dashboardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function writeDashboardFilters(
  orgId: string,
  dashboardId: string,
  filters: Record<string, unknown>,
): void {
  try {
    sessionStorage.setItem(dashboardFilterStorageKey(orgId, dashboardId), JSON.stringify(filters));
  } catch {
    // Private mode / quota — ignore
  }
}

export function serializeDashboardFilters(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parsePersistedDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function pickPersistedString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function pickPersistedNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function pickPersistedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

export type DashboardFilterRestoreConfig = {
  strings?: Array<[string, (value: string) => void]>;
  numbers?: Array<[string, (value: number) => void]>;
  optionalDates?: Array<[string, (value: Date | undefined) => void]>;
  requiredDates?: Array<[string, (value: Date) => void]>;
  stringArrays?: Array<[string, (value: string[]) => void]>;
  nullableStrings?: Array<[string, (value: string | null) => void]>;
};

export function restoreDashboardFilters(
  saved: Record<string, unknown>,
  config: DashboardFilterRestoreConfig,
): void {
  for (const [key, setter] of config.strings ?? []) {
    const value = pickPersistedString(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.numbers ?? []) {
    const value = pickPersistedNumber(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.optionalDates ?? []) {
    if (!(key in saved)) continue;
    setter(parsePersistedDate(saved[key]));
  }

  for (const [key, setter] of config.requiredDates ?? []) {
    const value = parsePersistedDate(saved[key]);
    if (value) setter(value);
  }

  for (const [key, setter] of config.stringArrays ?? []) {
    const value = pickPersistedStringArray(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.nullableStrings ?? []) {
    if (!(key in saved)) continue;
    const raw = saved[key];
    setter(raw === null ? null : pickPersistedString(raw) ?? null);
  }
}
