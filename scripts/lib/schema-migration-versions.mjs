/**
 * Repo ↔ live schema_migrations helpers.
 * Versions are the 14-digit timestamp prefix of supabase/migrations/*.sql.
 */

export const MIGRATION_VERSION_RE = /^(\d{14})_/;

/** Critical fixes that must be applied live — called out first in drift reports. */
export const CRITICAL_SCHEMA_MIGRATIONS = [
  {
    version: "20261001140000",
    reason: "Purchase line-qty edit sold-qty floor (negative stock)",
  },
  {
    version: "20260824120000",
    reason: "Sale settlement / payment_status normalizer",
  },
  {
    version: "20260628120000",
    reason: "Reconcile gross invoiced CN receipts (ledger KPI)",
  },
];

export function parseMigrationVersion(filename) {
  const base = String(filename || "").split(/[/\\]/).pop() || "";
  const m = MIGRATION_VERSION_RE.exec(base);
  return m ? m[1] : null;
}

/**
 * @param {string[]} repoVersions
 * @param {string[]} liveVersions
 */
export function diffSchemaMigrationVersions(repoVersions, liveVersions) {
  const repo = uniqueSorted(repoVersions);
  const live = uniqueSorted(liveVersions);
  const liveSet = new Set(live);
  const repoSet = new Set(repo);
  return {
    inRepoNotLive: repo.filter((v) => !liveSet.has(v)),
    inLiveNotRepo: live.filter((v) => !repoSet.has(v)),
    repoCount: repo.length,
    liveCount: live.length,
  };
}

export function uniqueSorted(versions) {
  return [...new Set((versions || []).filter(Boolean))].sort();
}

export function missingCritical(liveVersions) {
  const liveSet = new Set(liveVersions || []);
  return CRITICAL_SCHEMA_MIGRATIONS.filter((row) => !liveSet.has(row.version));
}
