#!/usr/bin/env node
/**
 * Cross-platform CN adjust literal guard (mirrors check-cn-adjust-literals.sh).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOW = new Set([
  "src/utils/saleSettlement.ts",
  "src/utils/customerBalanceUtils.ts",
  "src/utils/customerBalanceCore.ts",
  "src/utils/customerAuditBundle.ts",
  "src/utils/accounting/journalService.ts",
  "src/components/InvoiceHistoryDialog.tsx",
  "src/components/CustomerLedger.tsx",
  "src/pages/CustomerLedgerPage.tsx",
  "src/components/CreditNoteHistoryDialog.tsx",
  "src/components/CustomerBalanceAdjustmentDialog.tsx",
  "src/components/accounts/OutstandingDashboardTab.tsx",
  "src/components/accounts/CustomerPaymentTab.tsx",
  "src/pages/SalesInvoiceDashboard.tsx",
  "src/components/AdjustCustomerCreditNoteDialog.tsx",
]);

async function walk(dir, out = []) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, out);
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

const files = await walk(path.join(ROOT, "src"));
let violations = 0;

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (ALLOW.has(rel)) continue;
  const text = await readFile(abs, "utf8");
  if (text.includes("credit_note_adjustment")) {
    console.error(`CN guard violation: ${rel} references credit_note_adjustment (not in allow-list)`);
    violations++;
  }
}

if (violations > 0) {
  console.error(`\nFound ${violations} file(s). CN adjustments must go through adjust_invoice_balance / applyCreditNoteFifoToSale.`);
  process.exit(1);
}

console.log("CN adjust literal guard: OK");
