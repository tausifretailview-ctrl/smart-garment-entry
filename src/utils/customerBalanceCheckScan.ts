/**
 * "Accounts that need checking": customers whose Customer Ledger header would show
 * "Balance needs checking" (table closing balance ≠ getCustomerAccountState net position).
 *
 * Each check loads one customer's full ledger, so the scan is user-started, limited to
 * likely candidates (returns, credit notes, POS exchange refunds, deleted bills that used
 * credit), runs two customers at a time and stops at a cap. Read-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import { fetchCustomerAccountStateView } from "@/utils/customerAccountStateView";
import { ledgerBalanceCheck, ledgerThreeLineSummary } from "@/utils/customerLedgerHeadline";

export const BALANCE_CHECK_SCAN_MAX = 300;
const CANDIDATE_QUERY_LIMIT = 5000;

export type BalanceCheckFinding = {
  customerId: string;
  customerName: string;
  tableBalance: number;
  checkBalance: number;
  difference: number;
};

export type BalanceCheckScanProgress = { done: number; total: number; found: number };

type Row = Record<string, unknown>;

async function idsFrom(query: PromiseLike<{ data: unknown; error: unknown }>, col: string): Promise<string[]> {
  try {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return (data as Row[]).map((r) => String(r[col] || "")).filter(Boolean);
  } catch {
    return [];
  }
}

/** Customers with the kinds of entries where the two balances have diverged before. */
export async function findBalanceCheckCandidates(
  client: SupabaseClient,
  organizationId: string,
): Promise<string[]> {
  const lists = await Promise.all([
    idsFrom(
      client
        .from("sale_returns")
        .select("customer_id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .limit(CANDIDATE_QUERY_LIMIT),
      "customer_id",
    ),
    idsFrom(
      client
        .from("credit_notes")
        .select("customer_id")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .limit(CANDIDATE_QUERY_LIMIT),
      "customer_id",
    ),
    idsFrom(
      client
        .from("voucher_entries")
        .select("reference_id")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "payment")
        .eq("reference_type", "customer")
        .ilike("description", "%POS exchange%")
        .is("deleted_at", null)
        .limit(CANDIDATE_QUERY_LIMIT),
      "reference_id",
    ),
    idsFrom(
      client
        .from("sales")
        .select("customer_id")
        .eq("organization_id", organizationId)
        .not("deleted_at", "is", null)
        .gt("sale_return_adjust", 0)
        .limit(CANDIDATE_QUERY_LIMIT),
      "customer_id",
    ),
  ]);
  return Array.from(new Set(lists.flat()));
}

/** Check one customer the same way the Customer Ledger header does. */
export async function checkCustomerBalance(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
): Promise<BalanceCheckFinding | null> {
  const rows = await fetchCustomerLedgerTransactionsWithClient(client, organizationId, customerId, {
    startDate: null,
    endDate: null,
  });
  const state = await fetchCustomerAccountStateView(client, organizationId, customerId);
  const table = ledgerThreeLineSummary(rows).balance;
  const check = ledgerBalanceCheck({ tableBalance: table, checkBalance: state.netPosition });
  if (!check.needsChecking) return null;
  return {
    customerId,
    customerName: state.customerName || "",
    tableBalance: check.tableBalance,
    checkBalance: check.checkBalance ?? 0,
    difference: check.difference,
  };
}

export async function scanCustomersForBalanceCheck(
  client: SupabaseClient,
  organizationId: string,
  customerIds: string[],
  opts?: {
    concurrency?: number;
    max?: number;
    signal?: { cancelled: boolean };
    onProgress?: (p: BalanceCheckScanProgress) => void;
  },
): Promise<{ findings: BalanceCheckFinding[]; checked: number; skipped: number; failed: number }> {
  const ids = customerIds.slice(0, opts?.max ?? BALANCE_CHECK_SCAN_MAX);
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 2, 4));
  const findings: BalanceCheckFinding[] = [];
  let next = 0;
  let done = 0;
  let failed = 0;

  const worker = async () => {
    while (next < ids.length && !opts?.signal?.cancelled) {
      const id = ids[next++];
      try {
        const f = await checkCustomerBalance(client, organizationId, id);
        if (f) findings.push(f);
      } catch {
        failed++; // one bad account must not stop the scan
      }
      done++;
      opts?.onProgress?.({ done, total: ids.length, found: findings.length });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  findings.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  return { findings, checked: done, skipped: customerIds.length - ids.length, failed };
}
