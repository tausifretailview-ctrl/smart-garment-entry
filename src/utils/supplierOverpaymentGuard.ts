import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSupplierBalanceSnapshot } from "@/utils/supplierBalanceUtils";

/** Warn when proposed settlement exceeds fresh payable by more than this (rupees). */
export const SUPPLIER_OVERPAYMENT_WARN_TOLERANCE_RUPEE = 1;

const fmtInr = (n: number) =>
  `₹${Math.max(0, n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function fetchFreshSupplierBillsPending(
  client: SupabaseClient,
  organizationId: string,
  supplierId: string,
  billIds: string[],
): Promise<number> {
  if (billIds.length === 0) return 0;

  const { data, error } = await client
    .from("purchase_bills")
    .select("id, supplier_id, net_amount, paid_amount, is_cancelled")
    .eq("organization_id", organizationId)
    .in("id", billIds)
    .is("deleted_at", null);

  if (error) throw error;

  let sum = 0;
  for (const row of data || []) {
    if (row.supplier_id !== supplierId) continue;
    if (row.is_cancelled) continue;
    sum += Math.max(0, Number(row.net_amount || 0) - Number(row.paid_amount || 0));
  }
  return roundMoney(sum);
}

export type FreshSupplierPayableCap = {
  payable: number;
  selectedBillsPending: number | null;
};

export async function fetchFreshSupplierPayableCap(
  client: SupabaseClient,
  organizationId: string,
  supplierId: string,
  selectedBillIds: string[],
): Promise<FreshSupplierPayableCap> {
  const snapshot = await fetchSupplierBalanceSnapshot(client, organizationId, supplierId);
  const payable = Math.max(0, snapshot.balance);

  if (selectedBillIds.length === 0) {
    return { payable, selectedBillsPending: null };
  }

  const selectedBillsPending = await fetchFreshSupplierBillsPending(
    client,
    organizationId,
    supplierId,
    selectedBillIds,
  );
  return { payable, selectedBillsPending };
}

export function formatSupplierOverpaymentConfirmMessage(params: {
  supplierName: string;
  payable: number;
  proposedSettlement: number;
  excess: number;
  context: "supplier" | "selected_bills";
  selectedBillsPending?: number;
}): string {
  const { supplierName, payable, proposedSettlement, excess, context, selectedBillsPending } = params;

  if (context === "selected_bills") {
    return (
      `Supplier ${supplierName}: selected bills need ${fmtInr(selectedBillsPending ?? 0)} pending.\n` +
      `This payment of ${fmtInr(proposedSettlement)} exceeds that by ${fmtInr(excess)} and may create supplier credit.\n\n` +
      `Continue?`
    );
  }

  return (
    `Supplier ${supplierName} payable balance is ${fmtInr(payable)}.\n` +
    `This payment of ${fmtInr(proposedSettlement)} exceeds payable by ${fmtInr(excess)} and will create supplier credit.\n\n` +
    `Continue?`
  );
}

/**
 * Fresh server-side payable check + warn/confirm before supplier payment write.
 * Returns true to proceed, false if user cancelled.
 */
export async function confirmSupplierOverpaymentIfNeeded(
  client: SupabaseClient,
  params: {
    organizationId: string;
    supplierId: string;
    supplierName?: string;
    /** Cash + settlement discount being applied. */
    proposedSettlement: number;
    selectedBillIds?: string[];
  },
): Promise<boolean> {
  const proposed = Math.max(0, Number(params.proposedSettlement) || 0);
  if (proposed <= SUPPLIER_OVERPAYMENT_WARN_TOLERANCE_RUPEE) return true;

  const billIds = params.selectedBillIds ?? [];
  const { payable, selectedBillsPending } = await fetchFreshSupplierPayableCap(
    client,
    params.organizationId,
    params.supplierId,
    billIds,
  );

  const supplierName = params.supplierName?.trim() || "Supplier";

  if (billIds.length > 0 && selectedBillsPending != null) {
    const excessVsBills = proposed - selectedBillsPending;
    if (excessVsBills > SUPPLIER_OVERPAYMENT_WARN_TOLERANCE_RUPEE) {
      return window.confirm(
        formatSupplierOverpaymentConfirmMessage({
          supplierName,
          payable,
          proposedSettlement: proposed,
          excess: excessVsBills,
          context: "selected_bills",
          selectedBillsPending,
        }),
      );
    }
  }

  const excessVsPayable = proposed - payable;
  if (excessVsPayable > SUPPLIER_OVERPAYMENT_WARN_TOLERANCE_RUPEE) {
    return window.confirm(
      formatSupplierOverpaymentConfirmMessage({
        supplierName,
        payable,
        proposedSettlement: proposed,
        excess: excessVsPayable,
        context: "supplier",
      }),
    );
  }

  return true;
}
