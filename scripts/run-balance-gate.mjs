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
console.log("Post-deploy SQL gates:");
console.log("  scripts/verify-customer-balance-unified-gate.sql");
console.log("    → SECTION A (party-only) for SQL editor — gates A-1..A-5");
console.log("    → SECTION B (snapshot_all) only if DIAG shows postgres/service_role");
console.log("  scripts/verify-snapshot-facet-semantics.sql");
console.log("  scripts/customer-balance-partial-cn-parity.sql");
console.log("    → partial CN + CN memo double-count (blocks 2–3 must be zero rows)");
console.log("");
console.log("SQL editor: do NOT use get_customer_financial_snapshot per row or");
console.log("get_customer_true_outstanding — Authentication required (42501).");
console.log("Required migrations:");
console.log("  20260822183000_snapshot_facet_semantics.sql");
console.log("  20260823160000_fix_party_balances_v2_partial_cn.sql");
console.log("  20260823180000_fix_cn_receipt_double_count_v2_reconcile.sql");
console.log("  20260911150000_fix_party_balances_paid_at_sale_drift_parity.sql (POS orgs)\n");
console.log("UI manual gates (authenticated org):");
console.log("  Customer Reconciliation — 0 rows drift > ₹1");
console.log("  Customer Balance Activity — RPC vs legacy within ₹1");
console.log("  Cross-screen: Ledger = Payment tab = POS picker = Party (±₹1)\n");
console.log("Production invariant (after any bulk repair):");
console.log("  run-invariant-digest — paid_diverges_from_receipts must not rise\n");
