#!/usr/bin/env node
/**
 * Dual-run: extracted `fetchCustomerLedgerTransactions` vs frozen desktop retail queryFn.
 *
 *   node scripts/verify-customer-ledger-extract-parity.mjs
 *
 * Offline fixtures always run via Vitest. Live staging (never production) runs
 * when `.env.test` has SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY.
 * Refused if that URL is the production host.
 *
 * Frozen inline copy: scripts/lib/customerLedgerRetailInline.generated.ts
 * — dual-run only, not imported by the Vite app.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PRODUCTION_HOST = "lkbbrqcsbhqjvsxiorvp.supabase.co";

function loadDotEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const root = process.cwd();
const appEnv = loadDotEnv(resolve(root, ".env"));
const testEnv = loadDotEnv(resolve(root, ".env.test"));
const testUrl = process.env.SUPABASE_TEST_URL || testEnv.SUPABASE_TEST_URL || "";
const prodUrl = process.env.VITE_SUPABASE_URL || appEnv.VITE_SUPABASE_URL || "";

if (testUrl && hostOf(testUrl) === PRODUCTION_HOST) {
  console.error("Refusing dual-run: SUPABASE_TEST_URL is production.");
  process.exit(2);
}
if (testUrl && prodUrl && hostOf(testUrl) === hostOf(prodUrl)) {
  console.error("Refusing dual-run: SUPABASE_TEST_URL matches VITE_SUPABASE_URL.");
  process.exit(2);
}

const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    "test/money/customerLedgerTransactions.identity.test.ts",
    "test/money/customerLedgerTransactions.dualrun.test.ts",
  ],
  { stdio: "inherit", cwd: root, env: process.env },
);
process.exit(result.status === null ? 1 : result.status);
