#!/usr/bin/env node
/**
 * Phase D — post-offline-test checklist for production SQL gates.
 * Offline tests run via: npm run test:balance-gate
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const offline = spawnSync("npm", ["run", "test:balance-gate:offline"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: true,
});

if (offline.status !== 0) {
  process.exit(offline.status ?? 1);
}

console.log("\n=== Phase D — Unified customer balance gate ===\n");
console.log("Offline gates: PASS (vitest)\n");
console.log("Post-deploy SQL gates (run in Supabase SQL editor after Lovable migration):");
console.log("  scripts/verify-customer-balance-unified-gate.sql");
console.log("  scripts/verify-snapshot-facet-semantics.sql");
console.log("  scripts/verify-customer-party-balances-parity.sql\n");
console.log("Required migrations:");
console.log("  20260822183000_snapshot_facet_semantics.sql");
console.log("  20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql (POS orgs)\n");
console.log("UI manual gates (authenticated org):");
console.log("  Customer Reconciliation — 0 rows drift > ₹1");
console.log("  Customer Balance Activity — RPC vs legacy within ₹1");
console.log("  Cross-screen: Ledger = Payment tab = POS picker = Party (±₹1)\n");
console.log("Production invariant (after any bulk repair):");
console.log("  run-invariant-digest — paid_diverges_from_receipts must not rise\n");
