#!/usr/bin/env bash
# Fail if credit_note_adjustment appears outside the allow-list (CN drift guard).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOW=(
  "src/utils/saleSettlement.ts"
  "src/utils/customerBalanceUtils.ts"
  "src/utils/customerBalanceCore.ts"
  "src/utils/customerAuditBundle.ts"
  "src/utils/accounting/journalService.ts"
  "src/components/InvoiceHistoryDialog.tsx"
  "src/components/CustomerLedger.tsx"
  "src/pages/CustomerLedgerPage.tsx"
  "src/components/CreditNoteHistoryDialog.tsx"
  "src/components/CustomerBalanceAdjustmentDialog.tsx"
  "src/components/accounts/OutstandingDashboardTab.tsx"
  "src/components/accounts/CustomerPaymentTab.tsx"
  "src/pages/SalesInvoiceDashboard.tsx"
  "src/components/AdjustCustomerCreditNoteDialog.tsx"
)

is_allowed() {
  local f="$1"
  for a in "${ALLOW[@]}"; do
    if [[ "$f" == "$a" ]]; then
      return 0
    fi
  done
  return 1
}

violations=0
while IFS= read -r -d '' file; do
  rel="${file#./}"
  if is_allowed "$rel"; then
    continue
  fi
  if grep -q "credit_note_adjustment" "$file"; then
    echo "CN guard violation: $rel references credit_note_adjustment (not in allow-list)"
    violations=$((violations + 1))
  fi
done < <(find src -type f \( -name '*.ts' -o -name '*.tsx' \) -print0)

if [[ "$violations" -gt 0 ]]; then
  echo ""
  echo "Found $violations file(s). CN adjustments must go through adjust_invoice_balance / applyCreditNoteFifoToSale."
  exit 1
fi

echo "CN adjust literal guard: OK"
