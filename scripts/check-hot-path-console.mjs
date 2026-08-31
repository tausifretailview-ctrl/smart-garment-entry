#!/usr/bin/env node
/**
 * Fail CI if noisy console calls return to load/POS/dashboard hot paths.
 *
 * Historical: fb649cbaf removed 17 `console.log(\`Fetched ${n}…\`)` from
 * fetchAllRows. DevTools serializing those logs on the main thread made
 * POS and dashboards feel frozen. Always-on probe `console.info` later
 * repeated the same class of mistake.
 *
 * Allows: console.error / console.warn (real failures).
 * Allows: window.__ezzy*.print() dumps (user-initiated).
 * Allows: opt-in helpers that already gate on a localStorage flag.
 *
 * Keep the file list in sync with src/lib/hotPathConsole.guard.test.ts
 * and docs/console-perf-protections.md.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NOISY = /\bconsole\.(log|info|debug|time|timeEnd|trace|dir|table)\s*\(/;

/** Paginated fetches, POS cart, settlement, persist — must stay quiet. */
const HOT_PATH_FILES = [
  "src/utils/fetchAllRows.ts",
  "src/pages/POSSales.tsx",
  "src/pages/POSDashboard.tsx",
  "src/pages/Index.tsx",
  "src/lib/posBilling/cartMutators.ts",
  "src/lib/posCartPersistence.ts",
  "src/hooks/usePosBilling.ts",
  "src/utils/saleSettlement.ts",
  "src/utils/customerBalanceUtils.ts",
  "src/utils/customerBalanceCore.ts",
  "src/lib/queryPersister.ts",
];

/**
 * These files may record in memory and expose __ezzy*.print().
 * They must not call console.info (use diagConsoleInfo).
 * console.log is only allowed on the explicit print() dump line.
 */
const PROBE_FILES = [
  "src/lib/mainThreadViolationProbe.ts",
  "src/lib/pwaColdOpenDiagnostics.ts",
];

function isCommentOrDocLine(line) {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("{/*")
  );
}

function isAllowedProbeLog(line) {
  return (
    /print\s*:/.test(line) ||
    /printPwa|printMain|printReport|printCloud/.test(line) ||
    /buildMainThreadReport|buildPwaColdOpenReport/.test(line)
  );
}

let violations = 0;

function fail(rel, lineNo, line, why) {
  violations += 1;
  console.error(`${rel}:${lineNo}: ${why}`);
  console.error(`  ${line.trim()}`);
}

for (const rel of HOT_PATH_FILES) {
  const text = await readFile(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isCommentOrDocLine(line)) return;
    if (NOISY.test(line)) {
      fail(
        rel,
        i + 1,
        line,
        "hot-path console.log/info/debug is forbidden (use console.error/warn, or diagConsoleInfo behind a flag)",
      );
    }
  });
}

for (const rel of PROBE_FILES) {
  const text = await readFile(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isCommentOrDocLine(line)) return;
    if (/\bconsole\.info\s*\(/.test(line)) {
      fail(
        rel,
        i + 1,
        line,
        "probe console.info must go through diagConsoleInfo (opt-in flag)",
      );
    }
    if (/\bconsole\.log\s*\(/.test(line) && !isAllowedProbeLog(line)) {
      fail(
        rel,
        i + 1,
        line,
        "probe console.log is only allowed on the __ezzy*.print() dump line",
      );
    }
  });
}

const appSrc = await readFile(path.join(ROOT, "src/App.tsx"), "utf8");
if (
  /import\.meta\.env\.DEV\s*\|\|[\s\S]{0,240}initCloudUsageDiagnostics/.test(appSrc) ||
  /initCloudUsageDiagnostics[\s\S]{0,240}import\.meta\.env\.DEV/.test(appSrc)
) {
  fail(
    "src/App.tsx",
    1,
    "import.meta.env.DEV || … initCloudUsageDiagnostics()",
    "cloud-usage fetch wrapper must stay flag-only — do not auto-enable in DEV",
  );
}

if (violations > 0) {
  console.error(
    `\nFound ${violations} hot-path console violation(s). See docs/console-perf-protections.md`,
  );
  process.exit(1);
}

console.log("Hot-path console guard: OK");
