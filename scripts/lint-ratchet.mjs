#!/usr/bin/env node
/**
 * Floating-promise ratchet.
 * Fails only when the number of `no-floating-promises` warnings exceeds the
 * recorded baseline, so new code is gated while existing debt stays unblocked.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const RULE = "@typescript-eslint/no-floating-promises";
const BASELINE_FILE = ".eslint-floating-promises-baseline.json";
const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));

let raw = "";
try {
  raw = execFileSync("npx", ["eslint", ".", "-f", "json"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
} catch (err) {
  // eslint exits non-zero when there are errors; JSON still lands on stdout.
  raw = err.stdout || "";
  if (!raw) throw err;
}

const results = JSON.parse(raw);
let count = 0;
const byFile = [];
for (const file of results) {
  const hits = file.messages.filter((m) => m.ruleId === RULE).length;
  if (hits) {
    count += hits;
    byFile.push({ file: file.filePath, hits });
  }
}

console.log(`${RULE}: ${count} (baseline ${baseline.baseline})`);

if (count > baseline.baseline) {
  const added = count - baseline.baseline;
  console.error(`\nFAIL: ${added} new floating promise(s) introduced.`);
  console.error("Await the call, or mark it deliberate with `void promise`.\n");
  byFile.sort((a, b) => b.hits - a.hits).slice(0, 20).forEach((f) =>
    console.error(`  ${f.hits}\t${f.file}`)
  );
  process.exit(1);
}

if (count < baseline.baseline && process.argv.includes("--update")) {
  writeFileSync(
    BASELINE_FILE,
    JSON.stringify({ ...baseline, baseline: count, recorded: new Date().toISOString().slice(0, 10) }, null, 2) + "\n"
  );
  console.log(`Baseline lowered to ${count}.`);
} else if (count < baseline.baseline) {
  console.log(`Improved by ${baseline.baseline - count}. Run with --update to lower the baseline.`);
}
