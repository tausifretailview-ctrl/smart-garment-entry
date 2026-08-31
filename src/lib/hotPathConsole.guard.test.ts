/**
 * Second layer of the hot-path console guard (CI also runs
 * `npm run check:console-guard`). Keep the file lists in sync with
 * scripts/check-hot-path-console.mjs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const NOISY = /\bconsole\.(log|info|debug|time|timeEnd|trace|dir|table)\s*\(/;

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

const PROBE_FILES = [
  "src/lib/mainThreadViolationProbe.ts",
  "src/lib/pwaColdOpenDiagnostics.ts",
];

function codeLines(rel: string): { line: string; n: number }[] {
  return readFileSync(join(root, rel), "utf8")
    .split(/\r?\n/)
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => {
      const t = line.trim();
      return !(
        t.startsWith("//") ||
        t.startsWith("*") ||
        t.startsWith("/*") ||
        t.startsWith("{/*")
      );
    });
}

describe("hot-path console guard", () => {
  it.each(HOT_PATH_FILES)("%s has no noisy console.log/info/debug", (rel) => {
    const hits = codeLines(rel).filter(({ line }) => NOISY.test(line));
    expect(hits, hits.map((h) => `${rel}:${h.n} ${h.line.trim()}`).join("\n")).toEqual(
      [],
    );
  });

  it.each(PROBE_FILES)("%s does not call console.info (must use diagConsoleInfo)", (rel) => {
    const hits = codeLines(rel).filter(({ line }) => /\bconsole\.info\s*\(/.test(line));
    expect(hits, hits.map((h) => `${rel}:${h.n} ${h.line.trim()}`).join("\n")).toEqual(
      [],
    );
  });

  it("App.tsx does not auto-enable cloud-usage diagnostics in DEV", () => {
    const src = readFileSync(join(root, "src/App.tsx"), "utf8");
    expect(src).toContain("initCloudUsageDiagnostics");
    expect(
      /import\.meta\.env\.DEV\s*\|\|[\s\S]{0,240}initCloudUsageDiagnostics/.test(src),
    ).toBe(false);
  });

  it("probes record via diagConsoleInfo so production stays quiet", () => {
    const main = readFileSync(join(root, "src/lib/mainThreadViolationProbe.ts"), "utf8");
    const cold = readFileSync(join(root, "src/lib/pwaColdOpenDiagnostics.ts"), "utf8");
    expect(main).toContain('diagConsoleInfo("ezzy_main_thread", "mainthread"');
    expect(cold).toContain('diagConsoleInfo("ezzy_pwa_cold_open", "pwacold"');
  });
});
