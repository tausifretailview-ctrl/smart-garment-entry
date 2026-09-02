#!/usr/bin/env node
/**
 * Bidirectional schema-migration drift check.
 *
 * Always:
 *   - Lists repo versions from supabase/migrations/*.sql
 *   - Keeps scripts/schema-migrations-manifest.json in sync (`--write`)
 *     or fails if the committed manifest is stale (`--check`, CI default)
 *
 * When live credentials are present (SUPABASE_DRIFT_URL +
 * SUPABASE_DRIFT_SERVICE_ROLE_KEY, or SUPABASE_TEST_URL +
 * SUPABASE_TEST_SERVICE_ROLE_KEY):
 *   - Reads supabase_migrations.schema_migrations
 *   - Fails on repo-not-live OR live-not-repo
 *   - Calls out CRITICAL_SCHEMA_MIGRATIONS first
 *
 * Without live credentials the live compare is skipped (exit 0) unless
 * --require-live is passed.
 *
 * Production URL is refused unless --allow-production (or
 * ALLOW_PRODUCTION_DRIFT_CHECK=1) is set. Do not treat a green CI
 * --check as "live is in sync" — that only proves the repo manifest
 * matches the migration files on disk.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CRITICAL_SCHEMA_MIGRATIONS,
  diffSchemaMigrationVersions,
  missingCritical,
  parseMigrationVersion,
  uniqueSorted,
} from "./lib/schema-migration-versions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase/migrations");
const MANIFEST_PATH = path.join(ROOT, "scripts/schema-migrations-manifest.json");
const PRODUCTION_PROJECT_REF = "lkbbrqcsbhqjvsxiorvp";

export function stripQuotes(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function env(name) {
  return stripQuotes(process.env[name] || "");
}

export async function listRepoMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const versions = [];
  const unparsed = [];
  for (const file of files) {
    const version = parseMigrationVersion(file);
    if (version) versions.push({ version, file });
    else unparsed.push(file);
  }
  return { versions, unparsed, files };
}

export function duplicateVersionGroups(rows) {
  const byVersion = new Map();
  for (const row of rows) {
    const list = byVersion.get(row.version) || [];
    list.push(row.file);
    byVersion.set(row.version, list);
  }
  return [...byVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files: files.sort() }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** Leftover `<<<<<<<` / `=======` / `>>>>>>>` or branch-name lines from a bad merge. */
export function hasMergeConflictRemnants(text) {
  return /^(?:<<<<<<< |>>>>>>> |=======\s*$|cursor\/\S+\s*$)/m.test(text);
}

export function manifestPayload(rows, generatedAt = new Date().toISOString().slice(0, 10)) {
  const versions = uniqueSorted(rows.map((r) => r.version));
  const files = rows.map((r) => r.file).sort();
  return {
    generatedBy: "scripts/check-schema-migrations-drift.mjs",
    generatedAt,
    count: versions.length,
    fileCount: files.length,
    versions,
    files,
    duplicateVersions: duplicateVersionGroups(rows),
    critical: CRITICAL_SCHEMA_MIGRATIONS,
  };
}

export async function fetchLiveVersions(url, serviceRoleKey) {
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/schema_migrations?select=version`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Accept-Profile": "supabase_migrations",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Live schema_migrations read failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw new Error("Live schema_migrations response was not an array");
  }
  return uniqueSorted(rows.map((r) => String(r.version || "")));
}

export function resolveLiveCredentials(envMap = process.env, argv = []) {
  const args = new Set(argv);
  const url = stripQuotes(envMap.SUPABASE_DRIFT_URL || envMap.SUPABASE_TEST_URL || "");
  const key = stripQuotes(
    envMap.SUPABASE_DRIFT_SERVICE_ROLE_KEY || envMap.SUPABASE_TEST_SERVICE_ROLE_KEY || "",
  );
  const allowProduction =
    args.has("--allow-production") ||
    stripQuotes(envMap.ALLOW_PRODUCTION_DRIFT_CHECK) === "1";
  return { url, key, allowProduction };
}

export function assertLiveUrlAllowed(url, allowProduction) {
  if (url.includes(PRODUCTION_PROJECT_REF) && !allowProduction) {
    throw new Error(
      "Refusing to use the production Supabase URL without --allow-production.\n" +
        "Point SUPABASE_DRIFT_URL at a staging project, or pass --allow-production for a deliberate live check.",
    );
  }
}

function printList(title, items, extra = {}, log = console.log) {
  log(`\n${title} (${items.length})`);
  if (items.length === 0) {
    log("  (none)");
    return;
  }
  for (const item of items) {
    const reason = extra[item];
    log(reason ? `  - ${item}  ${reason}` : `  - ${item}`);
  }
}

export async function runSchemaMigrationsDriftCheck({
  argv = process.argv.slice(2),
  envMap = process.env,
  writeFileFn = writeFile,
  readFileFn = readFile,
  fetchLive = fetchLiveVersions,
  now = () => new Date().toISOString().slice(0, 10),
  log = console.log,
  error = console.error,
} = {}) {
  const args = new Set(argv);
  const writeManifest = args.has("--write");
  const checkManifest = args.has("--check") || !writeManifest;
  const requireLive = args.has("--require-live");

  const { versions, unparsed } = await listRepoMigrationFiles();
  const repoVersions = versions.map((r) => r.version);

  if (unparsed.length > 0) {
    error("Unparseable migration filenames (need 14-digit prefix):");
    for (const f of unparsed) error(`  - ${f}`);
    return 1;
  }

  const nextManifest = manifestPayload(versions, now());

  if (writeManifest) {
    await writeFileFn(MANIFEST_PATH, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
    log(`Wrote ${MANIFEST_PATH} (${nextManifest.count} versions)`);
  } else if (checkManifest) {
    let current;
    let raw;
    try {
      raw = await readFileFn(MANIFEST_PATH, "utf8");
    } catch (err) {
      const why =
        err && typeof err === "object" && "code" in err && err.code === "ENOENT"
          ? "is missing"
          : `could not be read (${err instanceof Error ? err.message : err})`;
      error(
        `${path.relative(ROOT, MANIFEST_PATH)} ${why}. Run:\n  node scripts/check-schema-migrations-drift.mjs --write`,
      );
      return 1;
    }
    if (hasMergeConflictRemnants(raw)) {
      error(
        `${path.relative(ROOT, MANIFEST_PATH)} still has merge-conflict remnants. Run:\n  node scripts/check-schema-migrations-drift.mjs --write`,
      );
      return 1;
    }
    try {
      current = JSON.parse(raw);
    } catch (err) {
      error(
        `${path.relative(ROOT, MANIFEST_PATH)} is not valid JSON (${err instanceof Error ? err.message : err}). Run:\n  node scripts/check-schema-migrations-drift.mjs --write`,
      );
      return 1;
    }
    const currentVersions = uniqueSorted(current.versions || []);
    const expected = uniqueSorted(nextManifest.versions);
    const stale = diffSchemaMigrationVersions(expected, currentVersions);
    const currentFiles = [...(current.files || [])].sort();
    const expectedFiles = [...nextManifest.files].sort();
    const filesDrift =
      currentFiles.length !== expectedFiles.length ||
      currentFiles.some((file, i) => file !== expectedFiles[i]);
    if (stale.inRepoNotLive.length || stale.inLiveNotRepo.length || filesDrift) {
      printList("Manifest missing repo versions", stale.inRepoNotLive, {}, log);
      printList("Manifest has versions not in repo", stale.inLiveNotRepo, {}, log);
      if (filesDrift) {
        const currentSet = new Set(currentFiles);
        const expectedSet = new Set(expectedFiles);
        printList(
          "Manifest missing repo files",
          expectedFiles.filter((f) => !currentSet.has(f)),
          {},
          log,
        );
        printList(
          "Manifest has files not in repo",
          currentFiles.filter((f) => !expectedSet.has(f)),
          {},
          log,
        );
      }
      error("\nRegenerate with: node scripts/check-schema-migrations-drift.mjs --write");
      return 1;
    }
    const dupCount = nextManifest.duplicateVersions.length;
    log(
      `Manifest OK — ${expected.length} unique versions, ${expectedFiles.length} files` +
        (dupCount ? ` (${dupCount} shared timestamps)` : "") +
        ".",
    );
  }

  const { url: liveUrl, key: liveKey, allowProduction } = resolveLiveCredentials(envMap, argv);

  if (!liveUrl || !liveKey) {
    const msg =
      "Live compare skipped — set SUPABASE_DRIFT_URL + SUPABASE_DRIFT_SERVICE_ROLE_KEY (or SUPABASE_TEST_*).";
    if (requireLive) {
      error(msg);
      return 1;
    }
    log(msg);
    return 0;
  }

  try {
    assertLiveUrlAllowed(liveUrl, allowProduction);
  } catch (err) {
    error(err instanceof Error ? err.message : err);
    return 1;
  }

  let liveVersions;
  try {
    liveVersions = await fetchLive(liveUrl, liveKey);
  } catch (err) {
    error(err instanceof Error ? err.message : err);
    return 1;
  }

  const diff = diffSchemaMigrationVersions(repoVersions, liveVersions);
  const criticalMissing = missingCritical(liveVersions);

  log(`Repo versions: ${diff.repoCount}`);
  log(`Live versions: ${diff.liveCount}`);

  if (criticalMissing.length) {
    printList(
      "CRITICAL repo migrations NOT applied live",
      criticalMissing.map((r) => r.version),
      Object.fromEntries(criticalMissing.map((r) => [r.version, r.reason])),
      log,
    );
  }

  printList("In repo, not live (committed but never applied)", diff.inRepoNotLive, {}, log);
  printList("In live, not repo (applied outside git)", diff.inLiveNotRepo, {}, log);

  if (criticalMissing.length || diff.inRepoNotLive.length || diff.inLiveNotRepo.length) {
    error("\nSchema-migration drift detected.");
    return 1;
  }

  log("\nNo schema-migration drift.");
  return 0;
}

function isCliEntry() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(invoked)).href;
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  const code = await runSchemaMigrationsDriftCheck();
  process.exit(code);
}
